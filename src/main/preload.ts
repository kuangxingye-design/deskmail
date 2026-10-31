/**
 * preload：经 contextBridge 暴露最小 API（仅 smoke 上报）。
 * 后续真实桥接（#10/#11）在本文件扩展，保持 contextIsolation。
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('deskmail', {
  reportSmoke(payload: unknown): void {
    ipcRenderer.send('deskmail:smoke', payload);
  },
});
