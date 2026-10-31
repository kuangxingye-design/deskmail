/**
 * 真实 IMAP 适配器（#8）：基于 imapflow，实现 ImapClient 接口。
 *
 * 关键行为：
 * - 网易系（126/163/162）：imapflow 的 clientInfo 会在 LOGIN 后补发 ID 命令
 * - 同步读取使用 BODY.PEEK（imapflow source），不会把邮件标成已读
 * - 打开即已读由 markSeen 显式 STORE +FLAGS (\Seen)
 * - UID SEARCH 的 n:* 在无新邮件时可能返回最后一封，selectNewestUids 会再过滤
 */
import { ImapFlow } from 'imapflow';
import type { ImapFlowOptions } from 'imapflow';
import type {
  HeaderBatch,
  ImapClient,
  ImapCredentials,
  ProviderConfig,
  RawMessage,
} from '../../imap/types';
import { classifyImapError, ImapError } from './errors';

export function buildImapOptions(
  cfg: ProviderConfig,
  credentials: ImapCredentials,
): ImapFlowOptions {
  return {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.tls,
    auth: { user: credentials.user, pass: credentials.password },
    clientInfo: {
      name: 'DeskMail',
      version: '0.1.0',
      vendor: 'deskmail',
      'support-email': credentials.user,
    },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 20_000,
  };
}

/** UID 倒序取最新 limit 个；uidFrom 含该 UID（IMAP n:* 的最后一封需再次过滤） */
export function selectNewestUids(uids: number[], uidFrom: number, limit: number): number[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  return uids
    .filter((uid) => uid >= uidFrom)
    .sort((a, b) => b - a)
    .slice(0, Math.trunc(limit));
}

export type ImapFlowFactory = (options: ImapFlowOptions) => ImapFlow;

export class ImapClientImpl implements ImapClient {
  private client: ImapFlow | null = null;

  constructor(
    private readonly createClient: ImapFlowFactory = (options) => new ImapFlow(options),
  ) {}

  async connect(cfg: ProviderConfig, credentials: ImapCredentials): Promise<void> {
    if (this.client) {
      await this.close();
    }

    const client = this.createClient(buildImapOptions(cfg, credentials));
    try {
      await client.connect();
      await client.mailboxOpen('INBOX');
      this.client = client;
    } catch (error) {
      try {
        await client.logout();
      } catch {
        // 连接失败后的 logout 也可能失败，忽略
      }
      throw classifyImapError(error);
    }
  }

  async fetchHeaders(uidFrom: number, limit: number): Promise<HeaderBatch[]> {
    const client = this.requireClient();
    try {
      const found = await client.search({ uid: `${uidFrom}:*` }, { uid: true });
      if (!Array.isArray(found)) return [];

      const selected = selectNewestUids(found, uidFrom, limit);
      if (selected.length === 0) return [];

      const rows = await client.fetchAll(
        selected.join(','),
        { uid: true, envelope: true, internalDate: true, flags: true },
        { uid: true },
      );

      return rows
        .map((row) => {
          const from = row.envelope?.from?.[0];
          return {
            imapUid: row.uid,
            messageId: row.envelope?.messageId,
            senderName: from?.name,
            senderEmail: from?.address ?? '',
            subject: row.envelope?.subject ?? '(无主题)',
            receivedAt: toIsoString(row.internalDate),
            isRead: row.flags?.has('\\Seen') ?? false,
          };
        })
        .sort((a, b) => b.imapUid - a.imapUid);
    } catch (error) {
      throw classifyImapError(error);
    }
  }

  async fetchMessage(uid: number): Promise<RawMessage> {
    const client = this.requireClient();
    try {
      const row = await client.fetchOne(
        String(uid),
        { uid: true, source: true, envelope: true },
        { uid: true },
      );
      if (!row || !row.source) {
        throw new ImapError('other', `无法读取 UID ${uid} 的邮件内容`);
      }
      return {
        imapUid: uid,
        messageId: row.envelope?.messageId,
        raw: row.source,
      };
    } catch (error) {
      if (error instanceof ImapError) throw error;
      throw classifyImapError(error);
    }
  }

  async markSeen(uid: number): Promise<void> {
    const client = this.requireClient();
    try {
      await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
    } catch (error) {
      throw classifyImapError(error);
    }
  }

  async getUidValidity(): Promise<number | undefined> {
    const client = this.requireClient();
    const mailbox = client.mailbox;
    return mailbox ? Number(mailbox.uidValidity) : undefined;
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (!client) return;
    try {
      await client.logout();
    } catch {
      // 断开异常不影响调用方
    }
  }

  private requireClient(): ImapFlow {
    if (!this.client) {
      throw new ImapError('other', 'IMAP 尚未连接');
    }
    return this.client;
  }
}

function toIsoString(value: Date | string | undefined): string {
  if (!value) return new Date(0).toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}
