/**
 * FixtureImapClient（桩实现，仅骨架/mock 链路使用）。
 * 不建真实连接；数据由构造参数注入（组合根传入 mock 数据）。
 */
import type {
  HeaderBatch,
  ImapClient,
  ImapCredentials,
  ProviderConfig,
  RawMessage,
} from './types';

/** fixture 数据：头信息 + 原始 MIME 字节 */
export interface FixtureMessage extends RawMessage {
  senderName?: string;
  senderEmail: string;
  subject: string;
  receivedAt: string;
  isRead: boolean;
}

const FIXTURE_UID_VALIDITY = 1;

export class FixtureImapClient implements ImapClient {
  private readonly byUid = new Map<number, FixtureMessage>();
  private readonly seen = new Set<number>();

  constructor(messages: FixtureMessage[]) {
    for (const message of messages) {
      this.byUid.set(message.imapUid, message);
    }
  }

  async connect(_cfg: ProviderConfig, _credentials: ImapCredentials): Promise<void> {
    // 桩：不建立真实连接（#8 的真实实现见 src/main/imap/real.ts）
  }

  private toHeader(message: FixtureMessage): HeaderBatch {
    return {
      imapUid: message.imapUid,
      messageId: message.messageId,
      senderName: message.senderName,
      senderEmail: message.senderEmail,
      subject: message.subject,
      receivedAt: message.receivedAt,
      isRead: message.isRead || this.seen.has(message.imapUid),
    };
  }

  async fetchHeaders(uidFrom: number, limit: number): Promise<HeaderBatch[]> {
    const headers: HeaderBatch[] = [];
    for (const message of this.byUid.values()) {
      if (message.imapUid < uidFrom) continue;
      headers.push(this.toHeader(message));
    }
    headers.sort((a, b) => b.imapUid - a.imapUid);
    return headers.slice(0, Math.max(0, limit));
  }

  async fetchHeadersBefore(uidBefore: number, limit: number): Promise<HeaderBatch[]> {
    const headers: HeaderBatch[] = [];
    for (const message of this.byUid.values()) {
      if (message.imapUid >= uidBefore) continue;
      headers.push(this.toHeader(message));
    }
    headers.sort((a, b) => b.imapUid - a.imapUid);
    return headers.slice(0, Math.max(0, limit));
  }

  async listUids(): Promise<number[]> {
    return [...this.byUid.keys()];
  }

  async fetchMessage(uid: number): Promise<RawMessage> {
    const message = this.byUid.get(uid);
    if (!message) {
      throw new Error(`FixtureImapClient: no message with uid ${uid}`);
    }
    return { imapUid: message.imapUid, messageId: message.messageId, raw: message.raw };
  }

  async markSeen(uid: number): Promise<void> {
    this.seen.add(uid);
  }

  async getUidValidity(): Promise<number | undefined> {
    return FIXTURE_UID_VALIDITY;
  }

  async close(): Promise<void> {
    // 桩：无连接可关闭
  }
}
