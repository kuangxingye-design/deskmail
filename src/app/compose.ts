/**
 * 组合根：把桩实现装配进真实编排（inbox），完成模块串联。
 * 骨架期唯一装配点；后续任务逐个把桩替换为真实实现（接口不变）。
 */
import { FixtureImapClient } from '../imap/fixture';
import { StubHtmlSanitizer, StubMessageParser } from '../content/stub';
import { InMemoryMailStore } from '../store/memory';
import { StubSyncEngine } from '../sync/stub';
import { StubAccountService } from '../accounts/stub';
import { InboxServiceImpl } from '../inbox/service';
import type { InboxService as InboxServiceContract } from '../inbox/types';
import type { SyncEngine } from '../sync/types';
import type { AccountService } from '../accounts/types';
import type { PlatformServices } from '../platform/types';
import { MOCK_ACCOUNTS, MOCK_RAW_MESSAGES } from './mock-data';

export interface App {
  inbox: InboxServiceContract;
  sync: SyncEngine;
  accounts: AccountService;
  platform: PlatformServices;
}

/**
 * platform 参数：骨架期传 BrowserStubPlatformServices；
 * 真实平台实现（#9/#10/#11）落地后在此替换，核心域代码不变。
 * TextExtractor 待 #7 随真实 MIME 解析接入 parser，骨架期不装配。
 */
export function compose(platform: PlatformServices): App {
  const store = new InMemoryMailStore();
  const imap = new FixtureImapClient(MOCK_RAW_MESSAGES);
  const parser = new StubMessageParser(new StubHtmlSanitizer());

  const sync = new StubSyncEngine(imap, parser, store, MOCK_ACCOUNTS);
  const accounts = new StubAccountService(MOCK_ACCOUNTS);
  const inbox = new InboxServiceImpl(store, accounts);

  return { inbox, sync, accounts, platform };
}
