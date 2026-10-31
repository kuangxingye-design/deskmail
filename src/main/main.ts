/**
 * Electron 主进程（最小启动壳，#2 范围）。
 * 窗口行为（置顶/磨砂/热键/移动）属 #10，本文件不做。
 * --smoke：renderer 上报校验后自动退出，供骨架 mock 链路验证。
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'node:path';

const SMOKE = process.argv.includes('--smoke');

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
    title: 'DeskMail（骨架）',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  void win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    win.show();
  });
  return win;
}

app.whenReady().then(() => {
  ipcMain.on('deskmail:smoke', (_event, payload: SmokeReport) => {
    console.log('[deskmail] renderer smoke report:', JSON.stringify(payload));
    if (SMOKE) {
      app.exit(payload && payload.ok ? 0 : 1);
    }
  });

  if (SMOKE) {
    // 兜底：renderer 未在限时内上报视为失败
    setTimeout(() => {
      console.error('[deskmail] smoke timeout: no report from renderer');
      app.exit(2);
    }, 15_000);
  }

  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
