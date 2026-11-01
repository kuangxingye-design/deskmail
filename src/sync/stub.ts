/**
 * StubSyncEngine（桩实现）：按账号经 createImap 工厂创建独立 ImapClient 会话，
 * 把各自 fixture 的 mock 数据经解析器写入 store，验证「imap → content → store」接线。
 * loadOlder / startScheduler 留空（#8 之后）。
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
    /** 每账号一个独立会话（fixture 数据按账号隔离）；真实实现保持同签名 */
    private readonly createImap: (accountId: string) => ImapClient,
    private readonly parser: MessageParser,
    private readonly store: MailStore,
    private readonly accounts: Account[],
  ) {}

  async syncAccount(accountId: string): Promise<SyncResult> {
    const account = this.accounts.find((candidate) => candidate.id === accountId);
    if (!account) {
      return { accountId, status: 'failed', fetched: 0, error: 'account not found' };
    }

    const imap = this.createImap(accountId);
    try {
      const cfg: ProviderConfig = PROVIDER_CONFIGS[account.provider];
      // 桩凭据只用于走通接口；真实授权码由 #8 的连接入口在本地输入
      await imap.connect(cfg, { user: account.email, password: 'fixture-auth-code' });
      const headers = await imap.fetchHeaders(1, RECENT_WINDOW);
      let fetched = 0;

      for (const header of headers) {
        const raw = await imap.fetchMessage(header.imapUid);
        const parsed = await this.parser.parse(raw);
        const message: Message = {
          id: `${accountId}:${header.imapUid}`,
          accountId,
          imapUid: header.imapUid,
          messageId: header.messageId,
          senderName: header.senderName,
          senderEmail: header.senderEmail,
          subject: header.subject,
          receivedAt: header.receivedAt,
          isRead: header.isRead,
          importance: 'normal',
          bodyText: parsed.bodyText,
          bodyHtml: parsed.bodyHtml,
          inlineImageIds: [],
        };
        parsed.inlineImages.forEach((image, index) => {
          const imageId = `${accountId}:${header.imapUid}:${index}`;
          this.store.saveInlineImage({
            id: imageId,
            messageId: message.id,
            cid: image.cid,
            contentType: image.contentType,
            size: image.data.byteLength,
            data: image.data,
          });
          message.inlineImageIds.push(imageId);
        });
        this.store.upsertMessages([message]);
        fetched += 1;
      }

      const newest = headers[0];
      const oldest = headers[headers.length - 1];
      const uidValidity = await imap.getUidValidity();
      this.store.saveSyncState({
        accountId,
        lastSyncAt: new Date().toISOString(),
        lastUid: newest ? newest.imapUid : 0,
        uidValidity,
        windowStartUid: oldest ? oldest.imapUid : 0,
        status: 'ok',
      });
      return { accountId, status: 'ok', fetched };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.store.saveSyncState({
        accountId,
        lastUid: 0,
        windowStartUid: 0,
        status: 'failed',
        lastError: error,
      });
      return { accountId, status: 'failed', fetched: 0, error };
    } finally {
      // 每账号会话用完即关（真实实现同样持有 per-account 连接）
      await imap.close();
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
    // 桩：真实翻页在同步引擎任务（#8 之后）实现
  }

  startScheduler(): void {
    // 桩：后台轮询调度在同步引擎任务（#8 之后）实现
  }
}
