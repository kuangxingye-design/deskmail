/**
 * renderer ↔ main 的最小 IPC 契约（#15）。
 * 本文件只含类型与 channel 常量，不 import Electron/Node。
 */
import type { Account, Importance } from '../model/types';
import type { AccountWithUnread, ListOptions, MailDetail, MailSummary } from '../inbox/types';
import type { AddAccountInput, ConnectionTestResult } from '../accounts/types';
import type { SyncSummary } from '../sync/types';

export const IPC_CHANNELS = {
  syncAll: 'deskmail:sync:all',
  inboxList: 'deskmail:inbox:list',
  inboxDetail: 'deskmail:inbox:detail',
  inboxSetImportance: 'deskmail:inbox:set-importance',
  accountsOverview: 'deskmail:accounts:overview',
  accountsAdd: 'deskmail:accounts:add',
  accountsUpdate: 'deskmail:accounts:update',
  accountsRemove: 'deskmail:accounts:remove',
  accountsTestConnection: 'deskmail:accounts:test-connection',
  accountsReauthorize: 'deskmail:accounts:reauthorize',
  smoke: 'deskmail:smoke',
} as const;

/** renderer 侧使用的客户端接口；preload 通过 contextBridge 提供同名方法 */
export interface DeskMailClient {
  syncAll(): Promise<SyncSummary>;
  list(filterAccountId: string | null, opts?: ListOptions): Promise<MailSummary[]>;
  detail(id: string): Promise<MailDetail | undefined>;
  setImportance(id: string, level: Importance): Promise<void>;
  accountsOverview(): Promise<AccountWithUnread[]>;
  accounts: {
    add(input: AddAccountInput): Promise<Account>;
    update(
      id: string,
      patch: Partial<Pick<Account, 'alias' | 'color'>>,
    ): Promise<Account>;
    remove(id: string): Promise<void>;
    testConnection(input: AddAccountInput): Promise<ConnectionTestResult>;
    reauthorize(id: string, authCode: string): Promise<ConnectionTestResult>;
  };
}
