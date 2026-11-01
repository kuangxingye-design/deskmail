/**
 * 主进程 IPC handlers（#15）。renderer 只通过这些 channel 访问 inbox / sync / accounts。
 */
import { ipcMain } from 'electron';
import type { App } from '../app/compose';
import type { ListOptions } from '../inbox/types';
import type { Importance } from '../model/types';
import { IPC_CHANNELS } from '../ipc/types';

export function registerIpcHandlers(desktop: App): void {
  ipcMain.handle(IPC_CHANNELS.syncAll, () => desktop.sync.syncAll());

  ipcMain.handle(
    IPC_CHANNELS.inboxList,
    (_event, filterAccountId: string | null, opts?: ListOptions) =>
      desktop.inbox.list(filterAccountId, opts),
  );

  ipcMain.handle(
    IPC_CHANNELS.inboxDetail,
    (_event, id: string) => desktop.inbox.detail(id),
  );

  ipcMain.handle(
    IPC_CHANNELS.inboxSetImportance,
    (_event, id: string, level: Importance) => {
      desktop.inbox.setImportance(id, level);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.accountsOverview,
    () => desktop.inbox.accountsOverview(),
  );
}
