/**
 * 真实账号服务（#17）：SQLite 账号仓库 + safeStorage 凭据 + IMAP 连接测试。
 *
 * Node/Electron 主进程专用；renderer 通过 IPC 调用。
 * 授权码只经 CredentialPlatform（safeStorage/DPAPI）流转，绝不落 SQLite / 日志。
 */
import { randomUUID } from 'node:crypto';
import type { Account } from '../../model/types';
import type { AccountRepository } from '../../accounts/repository';
import type {
  AccountService,
  AddAccountInput,
  ConnectionTestResult,
} from '../../accounts/types';
import type { CredentialPlatform } from '../../platform/types';
import type { ImapClient } from '../../imap/types';
import { PROVIDER_CONFIGS } from '../../imap/types';
import type { MailStore } from '../../store/types';

const ACCOUNT_COLORS = [
  '#5aa9ff',
  '#ff7a7a',
  '#4fd1a5',
  '#ffa07a',
  '#8b9dff',
  '#f4a261',
];

export class AccountServiceImpl implements AccountService {
  constructor(
    private readonly repository: AccountRepository,
    private readonly mailStore: MailStore,
    private readonly credentials: CredentialPlatform,
    private readonly createImap: () => ImapClient,
  ) {}

  list(): Account[] {
    return this.repository.listAccounts();
  }

  async add(input: AddAccountInput): Promise<Account> {
    const email = input.email.trim();
    if (!email || !email.includes('@')) {
      throw new Error('请输入完整的邮箱地址');
    }

    const normalized = normalizeEmail(email);
    if (this.repository.findAccountByEmail(normalized)) {
      throw new Error('该邮箱已添加');
    }

    const test = await this.testConnection({ ...input, email });
    if (!test.ok) {
      throw new Error(test.error ?? '连接测试失败');
    }

    const accounts = this.repository.listAccounts();
    const id = randomUUID();
    const account: Account = {
      id,
      provider: input.provider,
      email,
      alias: this.uniqueAlias(input.alias?.trim() || this.defaultAlias(email), accounts),
      color: input.color ?? ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length],
      status: 'ok',
      createdAt: new Date().toISOString(),
    };

    await this.credentials.set(id, input.authCode);
    try {
      this.repository.insertAccount(account, normalized);
    } catch (error) {
      await this.credentials.delete(id).catch(() => undefined);
      throw error;
    }
    return account;
  }

  async update(
    id: string,
    patch: Partial<Pick<Account, 'alias' | 'color'>>,
  ): Promise<Account> {
    return this.repository.updateAccount(id, patch);
  }

  async remove(id: string): Promise<void> {
    // 先清理该账号的消息与内嵌图片，再删账号与凭据
    this.mailStore.reconcileUids(id, []);
    this.repository.removeAccount(id);
    await this.credentials.delete(id);
  }

  async testConnection(input: AddAccountInput): Promise<ConnectionTestResult> {
    let client: ImapClient | undefined;
    try {
      client = this.createImap();
      await client.connect(PROVIDER_CONFIGS[input.provider], {
        user: input.email.trim(),
        password: input.authCode,
      });
      // 能取到头信息即视为连接与认证成功；空邮箱也正常
      await client.fetchHeaders(1, 1);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await client?.close();
    }
  }

  async reauthorize(id: string, newAuthCode: string): Promise<ConnectionTestResult> {
    const account = this.repository.getAccount(id);
    if (!account) {
      return { ok: false, error: '账号不存在' };
    }

    const test = await this.testConnection({
      provider: account.provider,
      email: account.email,
      authCode: newAuthCode,
    });

    if (!test.ok) {
      this.repository.updateAccount(id, {
        status: 'auth_failed',
        lastSyncError: test.error,
      });
      return test;
    }

    await this.credentials.set(id, newAuthCode);
    this.repository.updateAccount(id, { status: 'ok', lastSyncError: undefined });
    return { ok: true };
  }

  defaultAlias(email: string): string {
    const local = email.split('@')[0] ?? '';
    return local.trim().slice(0, 8) || '账号';
  }

  private uniqueAlias(base: string, accounts: Account[]): string {
    const used = new Set(accounts.map((account) => account.alias));
    if (!used.has(base)) return base;
    for (let index = 2; index < 100; index += 1) {
      const candidate = `${base}${index}`;
      if (!used.has(candidate)) return candidate;
    }
    return `${base}${Date.now()}`;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
