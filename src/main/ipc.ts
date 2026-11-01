/**
 * 主进程 IPC handlers（#15）。renderer 只通过这些 channel 访问 inbox / sync / accounts。
 */
import { ipcMain } from 'electron';
import type { App } from '../app/compose';
import type { AddAccountInput } from '../accounts/types';
import type { ListOptions } from '../inbox/types';
import type { Account, Importance } from '../model/types';
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

  ipcMain.handle(
    IPC_CHANNELS.accountsAdd,
    (_event, input: AddAccountInput) => desktop.accounts.add(input),
  );

  ipcMain.handle(
    IPC_CHANNELS.accountsUpdate,
    (_event, id: string, patch: Partial<Pick<Account, 'alias' | 'color'>>) =>
      desktop.accounts.update(id, patch),
  );

  ipcMain.handle(
    IPC_CHANNELS.accountsRemove,
    (_event, id: string) => desktop.accounts.remove(id),
  );

  ipcMain.handle(
    IPC_CHANNELS.accountsTestConnection,
    (_event, input: AddAccountInput) => desktop.accounts.testConnection(input),
  );

  ipcMain.handle(
    IPC_CHANNELS.accountsReauthorize,
    (_event, id: string, authCode: string) => desktop.accounts.reauthorize(id, authCode),
  );
}
