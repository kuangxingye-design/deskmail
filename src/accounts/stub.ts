/**
 * StubAccountService（桩实现）：固定 mock 账号，不读写凭据、不做去重与连接测试（#9）。
 */
import type { Account } from '../model/types';
import type { AccountService, AddAccountInput, ConnectionTestResult } from './types';

export class StubAccountService implements AccountService {
  constructor(private readonly accounts: Account[]) {}

  list(): Account[] {
    return [...this.accounts];
  }

  add(_input: AddAccountInput): Account {
    throw new Error('StubAccountService.add 未实现（#9）');
  }

  update(id: string, patch: Partial<Pick<Account, 'alias' | 'color'>>): Account {
    const account = this.accounts.find((a) => a.id === id);
    if (!account) {
      throw new Error(`account not found: ${id}`);
    }
    return { ...account, ...patch };
  }

  remove(_id: string): void {
    throw new Error('StubAccountService.remove 未实现（#9）');
  }

  async testConnection(_input: AddAccountInput): Promise<ConnectionTestResult> {
    return { ok: false, error: '桩实现：#5 落地真实连接测试' };
  }

  async reauthorize(_id: string, _newAuthCode: string): Promise<ConnectionTestResult> {
    return { ok: false, error: '桩实现：#9 落地重新授权' };
  }

  defaultAlias(email: string): string {
    // 桩：占位规则；#9 落地「前缀 6-8 字符 + 序号」
    return email.split('@')[0].slice(0, 8);
  }
}
