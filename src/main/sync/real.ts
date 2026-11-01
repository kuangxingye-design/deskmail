/**
 * 真实同步引擎（#19）：真实 IMAP + 账号凭据 + parser + SQLite。
 *
 * 两阶段：先 upsert 头信息让列表秒可用，再逐封取正文/内嵌图；支持增量、翻页、
 * UIDVALIDITY 重置、服务器 UID 对账、单账号失败隔离与 5 分钟轮询。
 */
import type { AccountRepository } from '../../accounts/repository';
import type { AccountService } from '../../accounts/types';
import type { MessageParser } from '../../content/types';
import type { HeaderBatch, ImapClient, RawInlineImage } from '../../imap/types';
import { PROVIDER_CONFIGS } from '../../imap/types';
import type { Message } from '../../model/types';
import type { CredentialPlatform } from '../../platform/types';
import type { MailStore } from '../../store/types';
import { ImapError } from '../imap/errors';
import { RECENT_WINDOW, type SyncEngine, type SyncResult, type SyncSummary } from '../../sync/types';

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

export class SyncEngineImpl implements SyncEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<SyncSummary> | null = null;

  constructor(
    private readonly createImap: (accountId: string) => ImapClient,
    private readonly parser: MessageParser,
    private readonly store: MailStore,
    private readonly accounts: AccountService,
    private readonly accountRepository: AccountRepository,
    private readonly credentials: CredentialPlatform,
    private readonly onUpdated?: () => void,
  ) {}

  async syncAccount(accountId: string): Promise<SyncResult> {
    const account = this.accounts.list().find((candidate) => candidate.id === accountId);
    if (!account) {
      return { accountId, status: 'failed', fetched: 0, error: 'account not found' };
    }

    let state = this.store.getSyncState(accountId);
    let client: ImapClient | null = null;

    try {
      const authCode = await this.credentials.get(accountId);
      if (!authCode) {
        this.markAccountFailed(accountId, 'auth_failed', '缺少授权码，请重新授权');
        return { accountId, status: 'failed', fetched: 0, error: '缺少授权码，请重新授权' };
      }

      const imap = this.createImap(accountId);
      client = imap;
      await imap.connect(PROVIDER_CONFIGS[account.provider], {
        user: account.email,
        password: authCode,
      });

      const uidValidity = await imap.getUidValidity();
      if (
        state?.uidValidity !== undefined &&
        uidValidity !== undefined &&
        state.uidValidity !== uidValidity
      ) {
        // 服务器重建了文件夹：本地该账号数据以服务器为准，从零重取
        this.store.reconcileUids(accountId, []);
        state = undefined;
      }

      const uidFrom = state?.lastUid ? state.lastUid + 1 : 1;
      const headers = await imap.fetchHeaders(uidFrom, RECENT_WINDOW);

      // Phase 1：先落头信息，列表立即可用
      for (const header of headers) {
        this.persistHeader(accountId, header);
      }
      this.onUpdated?.();

      // Phase 2：正文与内嵌图（已有正文的跳过）
      for (const header of headers) {
        await this.fetchBody(imap, accountId, header);
      }

      // 服务器删除的邮件本地移除（服务器为准）
      const serverUids = await imap.listUids();
      this.store.reconcileUids(accountId, serverUids);

      const newest = headers[0];
      const oldest = headers[headers.length - 1];
      const now = new Date().toISOString();
      const lastUid = newest
        ? Math.max(newest.imapUid, state?.lastUid ?? 0)
        : state?.lastUid ?? 0;
      const windowStartUid = state?.windowStartUid || (oldest ? oldest.imapUid : 0);

      this.store.saveSyncState({
        accountId,
        lastSyncAt: now,
        lastUid,
        uidValidity: uidValidity ?? state?.uidValidity,
        windowStartUid,
        status: 'ok',
      });
      this.accountRepository.updateAccount(accountId, {
        status: 'ok',
        lastSyncAt: now,
        lastSyncError: undefined,
      });
      this.onUpdated?.();
      return { accountId, status: 'ok', fetched: headers.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = error instanceof ImapError && error.kind === 'auth_failed'
        ? 'auth_failed'
        : 'sync_error';
      this.accountRepository.updateAccount(accountId, {
        status,
        lastSyncError: message,
      });
      this.store.saveSyncState({
        accountId,
        lastUid: state?.lastUid ?? 0,
        uidValidity: state?.uidValidity,
        windowStartUid: state?.windowStartUid ?? 0,
        status: 'failed',
        lastError: message,
      });
      return { accountId, status: 'failed', fetched: 0, error: message };
    } finally {
      await client?.close();
    }
  }

  async syncAll(): Promise<SyncSummary> {
    if (this.running) return this.running;
    this.running = this.doSyncAll();
    try {
      return await this.running;
    } finally {
      this.running = null;
    }
  }

  private async doSyncAll(): Promise<SyncSummary> {
    const startedAt = new Date().toISOString();
    const results: SyncResult[] = [];
    for (const account of this.accounts.list()) {
      results.push(await this.syncAccount(account.id));
    }
    this.onUpdated?.();
    return { startedAt, accounts: results };
  }

  async loadOlder(accountId: string): Promise<void> {
    const account = this.accounts.list().find((candidate) => candidate.id === accountId);
    if (!account) throw new Error('账号不存在');

    const state = this.store.getSyncState(accountId);
    if (!state || state.windowStartUid <= 1) return;

    const authCode = await this.credentials.get(accountId);
    if (!authCode) throw new Error('缺少授权码，请重新授权');

    const client = this.createImap(accountId);
    try {
      await client.connect(PROVIDER_CONFIGS[account.provider], {
        user: account.email,
        password: authCode,
      });
      const headers = await client.fetchHeadersBefore(state.windowStartUid, RECENT_WINDOW);
      for (const header of headers) {
        this.persistHeader(accountId, header);
        await this.fetchBody(client, accountId, header);
      }
      const oldest = headers[headers.length - 1];
      if (oldest) {
        this.store.saveSyncState({
          ...state,
          lastSyncAt: new Date().toISOString(),
          windowStartUid: oldest.imapUid,
        });
      }
      this.onUpdated?.();
    } finally {
      await client.close();
    }
  }

  startScheduler(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.syncAll().catch((error) => {
        console.error(
          '[deskmail] scheduled sync failed:',
          error instanceof Error ? error.message : error,
        );
      });
    }, SYNC_INTERVAL_MS);
  }

  private persistHeader(accountId: string, header: HeaderBatch): Message {
    const id = `${accountId}:${header.imapUid}`;
    const existing = this.store.getMessage(id);
    const message: Message = {
      id,
      accountId,
      imapUid: header.imapUid,
      messageId: header.messageId,
      senderName: header.senderName,
      senderEmail: header.senderEmail,
      subject: header.subject,
      receivedAt: header.receivedAt,
      isRead: existing?.isRead || header.isRead,
      importance: existing?.importance ?? 'normal',
      bodyText: existing?.bodyText ?? '',
      bodyHtml: existing?.bodyHtml,
      inlineImageIds: existing?.inlineImageIds ?? [],
    };
    this.store.upsertMessages([message]);
    return message;
  }

  private async fetchBody(
    client: ImapClient,
    accountId: string,
    header: HeaderBatch,
  ): Promise<void> {
    const id = `${accountId}:${header.imapUid}`;
    const existing = this.store.getMessage(id);
    if (!existing || existing.bodyText) return;

    try {
      const raw = await client.fetchMessage(header.imapUid);
      const parsed = await this.parser.parse(raw);
      const inlineImageIds: string[] = [];
      parsed.inlineImages.forEach((image: RawInlineImage, index: number) => {
        const imageId = `${id}:${index}`;
        this.store.saveInlineImage({
          id: imageId,
          messageId: id,
          cid: image.cid,
          contentType: image.contentType,
          size: image.data.byteLength,
          data: image.data,
        });
        inlineImageIds.push(imageId);
      });

      // 重新读取，避免覆盖正文拉取期间用户已标记的已读/重要性
      const current = this.store.getMessage(id);
      if (!current) return;
      this.store.upsertMessages([{
        ...current,
        bodyText: parsed.bodyText,
        bodyHtml: parsed.bodyHtml,
        inlineImageIds,
      }]);
    } catch (error) {
      console.warn(
        '[deskmail] body fetch failed:',
        id,
        error instanceof Error ? error.message : error,
      );
    }
  }

  private markAccountFailed(
    accountId: string,
    status: 'auth_failed' | 'sync_error',
    message: string,
  ): void {
    this.accountRepository.updateAccount(accountId, { status, lastSyncError: message });
  }
}
