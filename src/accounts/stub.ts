/**
 * StubAccountService（骨架/测试用）：固定 mock 账号，不读写凭据、不做去重与连接测试。
 * 真实实现见 src/main/accounts/real.ts（#17）。
 */
import type { Account } from '../model/types';
import type { AccountService, AddAccountInput, ConnectionTestResult } from './types';

export class StubAccountService implements AccountService {
  constructor(private readonly accounts: Account[]) {}

  list(): Account[] {
    return [...this.accounts];
  }

  async add(_input: AddAccountInput): Promise<Account> {
    throw new Error('StubAccountService.add 未实现（#17）');
  }

  async update(
    id: string,
    patch: Partial<Pick<Account, 'alias' | 'color'>>,
  ): Promise<Account> {
    const index = this.accounts.findIndex((account) => account.id === id);
    if (index < 0) {
      throw new Error(`account not found: ${id}`);
    }
    this.accounts[index] = { ...this.accounts[index], ...patch };
    return this.accounts[index];
  }

  async remove(_id: string): Promise<void> {
    throw new Error('StubAccountService.remove 未实现（#17）');
  }

  async testConnection(_input: AddAccountInput): Promise<ConnectionTestResult> {
    return { ok: false, error: '桩实现：#17 落地真实连接测试' };
  }

  async reauthorize(_id: string, _newAuthCode: string): Promise<ConnectionTestResult> {
    return { ok: false, error: '桩实现：#17 落地重新授权' };
  }

  defaultAlias(email: string): string {
    return email.split('@')[0].slice(0, 8) || '账号';
  }
}
