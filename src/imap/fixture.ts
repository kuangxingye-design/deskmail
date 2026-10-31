/**
 * FixtureImapClient（桩实现）。
 * 不建真实连接；数据由构造参数注入（组合根传入 mock 数据）。
 */
import type { HeaderBatch, ImapClient, ProviderConfig, RawMessage } from './types';

export class FixtureImapClient implements ImapClient {
  private readonly byUid = new Map<number, RawMessage>();
  private readonly seen = new Set<number>();

  constructor(messages: RawMessage[]) {
    for (const message of messages) {
      this.byUid.set(message.imapUid, message);
    }
  }

  async connect(_cfg: ProviderConfig): Promise<void> {
    // 桩：不建立真实连接（#5 落地）
  }

  async fetchHeaders(uidFrom: number, limit: number): Promise<HeaderBatch[]> {
    const headers: HeaderBatch[] = [];
    for (const message of this.byUid.values()) {
      if (message.imapUid < uidFrom) continue;
      headers.push({
        imapUid: message.imapUid,
        messageId: message.messageId,
        senderName: message.senderName,
        senderEmail: message.senderEmail,
        subject: message.subject,
        receivedAt: message.receivedAt,
        isRead: message.isRead,
      });
    }
    headers.sort((a, b) => b.imapUid - a.imapUid);
    return headers.slice(0, limit);
  }

  async fetchMessage(uid: number): Promise<RawMessage> {
    const message = this.byUid.get(uid);
    if (!message) {
      throw new Error(`FixtureImapClient: no message with uid ${uid}`);
    }
    return message;
  }

  async markSeen(uid: number): Promise<void> {
    this.seen.add(uid);
  }

  async close(): Promise<void> {
    // 桩：无连接可关闭
  }
}
