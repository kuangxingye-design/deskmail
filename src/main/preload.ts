/**
 * preload：经 contextBridge 暴露最小 IPC API（#15）。
 * 注意：sandbox preload 只能 require electron 等内置模块，不能 require 本地文件；
 * 因此 channel 字符串在此内联，与 src/ipc/types.ts 的 IPC_CHANNELS 保持一致。
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { ListOptions } from '../inbox/types';
import type { Importance } from '../model/types';

contextBridge.exposeInMainWorld('deskmail', {
  syncAll: () => ipcRenderer.invoke('deskmail:sync:all'),
  list: (filterAccountId: string | null, opts?: ListOptions) =>
    ipcRenderer.invoke('deskmail:inbox:list', filterAccountId, opts),
  detail: (id: string) => ipcRenderer.invoke('deskmail:inbox:detail', id),
  setImportance: (id: string, level: Importance) =>
    ipcRenderer.invoke('deskmail:inbox:set-importance', id, level),
  accountsOverview: () => ipcRenderer.invoke('deskmail:accounts:overview'),
  reportSmoke: (payload: unknown) => ipcRenderer.send('deskmail:smoke', payload),
});
