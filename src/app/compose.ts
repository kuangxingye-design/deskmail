/**
 * 组合根：把桩实现装配进真实编排（inbox），完成模块串联。
 * 骨架期唯一装配点；后续任务逐个把桩替换为真实实现（接口不变）。
 */
import { FixtureImapClient } from '../imap/fixture';
import { StubMessageParser } from '../content/stub';
import type { MessageParser } from '../content/types';
import type { MailStore } from '../store/types';
import { InMemoryMailStore } from '../store/memory';
import { StubSyncEngine } from '../sync/stub';
import { StubAccountService } from '../accounts/stub';
import { InboxServiceImpl } from '../inbox/service';
import type { InboxService as InboxServiceContract } from '../inbox/types';
import type { SyncEngine } from '../sync/types';
import type { AccountService } from '../accounts/types';
import type { ImapClient } from '../imap/types';
import type { PlatformServices } from '../platform/types';
import { MOCK_ACCOUNTS, MOCK_RAW_MESSAGES_BY_ACCOUNT } from './mock-data';

export interface App {
  inbox: InboxServiceContract;
  sync: SyncEngine;
  accounts: AccountService;
  platform: PlatformServices;
}

export interface ComposeOptions {
  /** 默认透传桩；主进程/测试可注入真实 mailparser 解析器（#10） */
  parser?: MessageParser;
  /** 默认内存 store；主进程/测试可注入 SQLite MailStore（#9） */
  store?: MailStore;
  /** 默认 mock 账号；主进程注入 SQLite + safeStorage 的真实 AccountService（#17） */
  accounts?: AccountService;
  /** 默认 stub 同步；主进程注入真实 SyncEngine（#19） */
  sync?: SyncEngine;
}

/**
 * platform 参数：骨架期传 BrowserStubPlatformServices；
 * 真实平台实现（#9/#10/#11）落地后在此替换，核心域代码不变。
 * parser 参数：renderer 默认透传桩；真实解析器位于 src/main/content（Node-only，#10）。
 */
export function compose(platform: PlatformServices, options: ComposeOptions = {}): App {
  const store = options.store ?? new InMemoryMailStore();
  // 每账号独立 IMAP 会话：mock 邮件按账号隔离。
  // 真实实现（#8）落地后，工厂改为按账号凭据建真实连接，签名不变。
  const createImap = (accountId: string): ImapClient =>
    new FixtureImapClient(MOCK_RAW_MESSAGES_BY_ACCOUNT[accountId] ?? []);
  const parser = options.parser ?? new StubMessageParser();

  const accounts = options.accounts ?? new StubAccountService(MOCK_ACCOUNTS);
  const sync = options.sync ?? new StubSyncEngine(createImap, parser, store, accounts);
  const inbox = new InboxServiceImpl(store, accounts);

  return { inbox, sync, accounts, platform };
}
