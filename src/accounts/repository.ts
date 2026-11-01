/**
 * 账号持久化仓库接口（#17）。由 SqliteMailStore 实现；核心域不依赖具体数据库。
 */
import type { Account } from '../model/types';

export interface AccountRepository {
  listAccounts(): Account[];
  getAccount(id: string): Account | undefined;
  findAccountByEmail(emailNormalized: string): Account | undefined;
  insertAccount(account: Account, emailNormalized: string): void;
  updateAccount(
    id: string,
    patch: Partial<Pick<Account, 'alias' | 'color' | 'status' | 'lastSyncAt' | 'lastSyncError'>>,
  ): Account;
  removeAccount(id: string): void;
}
