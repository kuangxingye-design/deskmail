/**
 * Electron 主进程（#15/#17/#19/#21）：
 * - 域逻辑在 main；renderer 经 IPC 访问 inbox / sync / accounts
 * - 桌面壳：无边框、始终置顶、Win11 acrylic、Alt+` 显隐、聚焦时 Alt+方向键移动
 * - 正常启动 userData/deskmail.sqlite；--smoke 用内存 SQLite
 */
import { app, BrowserWindow, globalShortcut, ipcMain, nativeTheme, screen } from 'electron';
import * as path from 'node:path';
import { compose } from '../app/compose';
import { MOCK_ACCOUNTS } from '../app/mock-data';
import { StubAccountService } from '../accounts/stub';
import { IPC_CHANNELS } from '../ipc/types';
import { AccountServiceImpl } from './accounts/real';
import { createMessageParser } from './content/real';
import { ImapClientImpl } from './imap/real';
import { registerIpcHandlers } from './ipc';
import { ElectronGlobalShortcutPlatform } from './platform/electron-global-shortcut';
import { ElectronWindowPlatform } from './platform/electron-window-platform';
import { MainPlatformServices } from './platform/main-platform';
import { SqliteMailStore } from './store/sqlite';
import { SyncEngineImpl } from './sync/real';
import { clampWindowPosition, WindowStateStore } from './window-state';

const SMOKE = process.argv.includes('--smoke');
const WINDOW_WIDTH = 460;
const WINDOW_HEIGHT = 640;
const MOVE_STEP = 16;

let store: SqliteMailStore | null = null;
let mainWindow: BrowserWindow | null = null;
let windowStateStore: WindowStateStore | null = null;

interface SmokeReport {
  ok: boolean;
  count: number;
  unreadBefore: number;
  unreadAfter: number;
}

function createWindow(position: { x: number; y: number }): BrowserWindow {
  const win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x: position.x,
    y: position.y,
    title: 'DeskMail',
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setAlwaysOnTop(true, 'floating');
  return win;
}

function loadRenderer(win: BrowserWindow): void {
  const rendererFile = path.join(__dirname, '..', 'renderer', 'index.html');
  void win.loadFile(rendererFile, SMOKE ? { hash: 'smoke' } : undefined);
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });
}

app.whenReady().then(() => {
  // 强制深色：让 Win11 acrylic 与卡片文字对比度一致
  nativeTheme.themeSource = 'dark';

  const userData = app.getPath('userData');
  const stateStore = new WindowStateStore(path.join(userData, 'window-state.json'));
  windowStateStore = stateStore;

  const workArea = screen.getPrimaryDisplay().workArea;
  const position = clampWindowPosition(
    stateStore.load(),
    WINDOW_WIDTH,
    WINDOW_HEIGHT,
    workArea,
  );

  const win = createWindow(position);
  mainWindow = win;

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const savePositionSoon = (): void => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (win.isDestroyed()) return;
      const [x, y] = win.getPosition();
      stateStore.save({ x, y });
    }, 200);
  };
  win.on('move', savePositionSoon);

  // Alt+方向键：仅窗口（卡片）聚焦时生效；限制在主屏工作区
  win.webContents.on('before-input-event', (event, input) => {
    if (!input.alt || input.type !== 'keyDown') return;
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-MOVE_STEP, 0],
      ArrowRight: [MOVE_STEP, 0],
      ArrowUp: [0, -MOVE_STEP],
      ArrowDown: [0, MOVE_STEP],
    };
    const delta = deltas[input.key];
    if (!delta) return;

    event.preventDefault();
    const [x, y] = win.getPosition();
    const next = clampWindowPosition(
      { x: x + delta[0], y: y + delta[1] },
      WINDOW_WIDTH,
      WINDOW_HEIGHT,
      screen.getPrimaryDisplay().workArea,
    );
    win.setPosition(next.x, next.y);
    stateStore.save(next);
  });

  const platform = new MainPlatformServices({
    window: new ElectronWindowPlatform(win),
    globalShortcut: new ElectronGlobalShortcutPlatform(),
  });

  const dbPath = path.join(userData, 'deskmail.sqlite');
  const mailStore = SMOKE ? new SqliteMailStore(':memory:') : new SqliteMailStore(dbPath);
  store = mailStore;

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

  ipcMain.handle(IPC_CHANNELS.appQuit, () => {
    app.quit();
  });

  if (realSync) {
    realSync.startScheduler();
  }

  if (!SMOKE) {
    const registered = platform.globalShortcut.register('Alt+`', () => {
      if (win.isVisible()) {
        win.hide();
      } else {
        win.show();
        win.focus();
      }
    });
    if (!registered) {
      console.error('[deskmail] 全局快捷键 Alt+` 注册失败');
    }
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

  loadRenderer(win);
});

app.on('before-quit', () => {
  if (mainWindow && !mainWindow.isDestroyed() && windowStateStore) {
    const [x, y] = mainWindow.getPosition();
    windowStateStore.save({ x, y });
  }
  store?.close();
  store = null;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  app.quit();
});
