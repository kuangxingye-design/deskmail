/**
 * StubSyncEngine（桩实现）：把 FixtureImapClient 的 mock 数据经解析器写入 store，
 * 用于验证「imap → content → store」接线。loadOlder / startScheduler 留空（#8）。
 */
import type { ImapClient, ProviderConfig } from '../imap/types';
import { PROVIDER_CONFIGS } from '../imap/types';
import type { MessageParser } from '../content/types';
import type { MailStore } from '../store/types';
import type { Account, Message } from '../model/types';
import type { SyncEngine, SyncResult, SyncSummary } from './types';
import { RECENT_WINDOW } from './types';

export class StubSyncEngine implements SyncEngine {
  constructor(
    private readonly imap: ImapClient,
    private readonly parser: MessageParser,
    private readonly store: MailStore,
    private readonly accounts: Account[],
  ) {}

  async syncAccount(accountId: string): Promise<SyncResult> {
    const account = this.accounts.find((a) => a.id === accountId);
    if (!account) {
      return { accountId, status: 'failed', fetched: 0, error: 'account not found' };
    }
    try {
      const cfg: ProviderConfig = PROVIDER_CONFIGS[account.provider];
      await this.imap.connect(cfg);
      const headers = await this.imap.fetchHeaders(1, RECENT_WINDOW);
      let fetched = 0;
      for (const header of headers) {
        const raw = await this.imap.fetchMessage(header.imapUid);
        const parsed = this.parser.parse(raw);
        const message: Message = {
          id: `${accountId}:${raw.imapUid}`,
          accountId,
          imapUid: raw.imapUid,
          messageId: raw.messageId,
          senderName: raw.senderName,
          senderEmail: raw.senderEmail,
          subject: raw.subject,
          receivedAt: raw.receivedAt,
          isRead: raw.isRead,
          importance: 'normal',
          bodyText: parsed.bodyText,
          bodyHtml: parsed.bodyHtml,
          inlineImageIds: [],
        };
        parsed.inlineImages.forEach((img, index) => {
          const imageId = `${accountId}:${raw.imapUid}:${index}`;
          this.store.saveInlineImage({
            id: imageId,
            messageId: message.id,
            cid: img.cid,
            contentType: img.contentType,
            size: img.data.byteLength,
            data: img.data,
          });
          message.inlineImageIds.push(imageId);
        });
        this.store.upsertMessages([message]);
        fetched += 1;
      }
      const newest = headers[0];
      const oldest = headers[headers.length - 1];
      this.store.saveSyncState({
        accountId,
        lastSyncAt: new Date().toISOString(),
        lastUid: newest ? newest.imapUid : 0,
        // 桩：uidValidity 未模拟；#8 记录真实值并处理变化
        windowStartUid: oldest ? oldest.imapUid : 0,
        status: 'ok',
      });
      return { accountId, status: 'ok', fetched };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.store.saveSyncState({ accountId, lastUid: 0, windowStartUid: 0, status: 'failed', lastError: error });
      return { accountId, status: 'failed', fetched: 0, error };
    }
  }

  async syncAll(): Promise<SyncSummary> {
    const startedAt = new Date().toISOString();
    const results: SyncResult[] = [];
    for (const account of this.accounts) {
      results.push(await this.syncAccount(account.id));
    }
    return { startedAt, accounts: results };
  }

  async loadOlder(_accountId: string): Promise<void> {
    // 桩：#8 实现按 windowStartUid 向前翻页
  }

  startScheduler(): void {
    // 桩：#8 实现后台轮询调度（失败退避、单账号隔离）
  }
}
