/**
 * Electron 主进程（#15）：组合根迁移到主进程，renderer 经 IPC 访问 inbox / sync / accounts。
 *
 * 本任务仍使用 Fixture IMAP + StubSyncEngine；真实 IMAP 调度、增量、账号凭据属后续任务。
 * 正常启动使用 userData/deskmail.sqlite；--smoke 使用内存 SQLite，保证未读基线稳定。
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'node:path';
import { compose } from '../app/compose';
import { IPC_CHANNELS } from '../ipc/types';
import { MOCK_ACCOUNTS } from '../app/mock-data';
import { StubAccountService } from '../accounts/stub';
import { AccountServiceImpl } from './accounts/real';
import { createMessageParser } from './content/real';
import { ImapClientImpl } from './imap/real';
import { registerIpcHandlers } from './ipc';
import { MainPlatformServices } from './platform/main-platform';
import { SqliteMailStore } from './store/sqlite';
import { SyncEngineImpl } from './sync/real';

const SMOKE = process.argv.includes('--smoke');
let store: SqliteMailStore | null = null;

interface SmokeReport {
  ok: boolean;
  count: number;
  unreadBefore: number;
  unreadAfter: number;
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 460,
    height: 640,
    title: 'DeskMail',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const rendererFile = path.join(__dirname, '..', 'renderer', 'index.html');
  void win.loadFile(rendererFile, SMOKE ? { hash: 'smoke' } : undefined);
  win.once('ready-to-show', () => {
    win.show();
  });
  return win;
}

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath('userData'), 'deskmail.sqlite');
  const mailStore = SMOKE ? new SqliteMailStore(':memory:') : new SqliteMailStore(dbPath);
  store = mailStore;

  const platform = new MainPlatformServices();
  const accounts = SMOKE
    ? new StubAccountService(MOCK_ACCOUNTS)
    : new AccountServiceImpl(
      mailStore,
      mailStore,
      platform.credentials,
      () => new ImapClientImpl(),
    );

  const parser = createMessageParser();
  const realSync = SMOKE
    ? undefined
    : new SyncEngineImpl(
      () => new ImapClientImpl(),
      parser,
      mailStore,
      accounts,
      mailStore,
      platform.credentials,
      () => {
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send(IPC_CHANNELS.syncUpdated);
        }
      },
    );

  const desktop = compose(platform, {
    store: mailStore,
    parser,
    accounts,
    sync: realSync,
  });
  registerIpcHandlers(desktop);

  if (realSync) {
    realSync.startScheduler();
  }

  ipcMain.on(IPC_CHANNELS.smoke, (_event, payload: SmokeReport) => {
    console.log('[deskmail] renderer smoke report:', JSON.stringify(payload));
    if (SMOKE) {
      app.exit(payload && payload.ok ? 0 : 1);
    }
  });

  if (SMOKE) {
    setTimeout(() => {
      console.error('[deskmail] smoke timeout: no report from renderer');
      app.exit(2);
    }, 15_000);
  }

  createWindow();
});

app.on('before-quit', () => {
  store?.close();
  store = null;
});

app.on('window-all-closed', () => {
  app.quit();
});
