/**
 * InMemoryMailStore（桩实现）：内存 Map，行为与接口一致，不持久化。
 * 真实实现（#6）换成 SQLite 后接口不变。
 */
import type { Importance, InlineImage, Message, SyncState } from '../model/types';
import type { MailStore, MailStoreQuery } from './types';

export class InMemoryMailStore implements MailStore {
  private readonly messages = new Map<string, Message>();
  private readonly images = new Map<string, InlineImage>();
  private readonly syncStates = new Map<string, SyncState>();

  upsertMessages(messages: Message[]): void {
    for (const message of messages) {
      this.messages.set(message.id, message);
    }
  }

  query(q: MailStoreQuery): Message[] {
    let result: Message[] = [...this.messages.values()];
    if (q.accountId !== undefined) {
      result = result.filter((m) => m.accountId === q.accountId);
    }
    const before = q.before;
    if (before !== undefined) {
      result = result.filter((m) => m.receivedAt < before);
    }
    result.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : a.receivedAt > b.receivedAt ? -1 : 0));
    if (q.limit !== undefined) {
      result = result.slice(0, q.limit);
    }
    return result;
  }

  getMessage(id: string): Message | undefined {
    return this.messages.get(id);
  }

  setImportance(id: string, level: Importance): void {
    const message = this.messages.get(id);
    if (message) {
      message.importance = level;
    }
  }

  markRead(id: string): void {
    const message = this.messages.get(id);
    if (message) {
      message.isRead = true;
    }
  }

  unreadCount(accountId?: string): number {
    let count = 0;
    for (const message of this.messages.values()) {
      if (!message.isRead && (accountId === undefined || message.accountId === accountId)) {
        count += 1;
      }
    }
    return count;
  }

  getSyncState(accountId: string): SyncState | undefined {
    return this.syncStates.get(accountId);
  }

  saveSyncState(state: SyncState): void {
    this.syncStates.set(state.accountId, state);
  }

  saveInlineImage(image: InlineImage): void {
    this.images.set(image.id, image);
  }

  getInlineImage(id: string): InlineImage | undefined {
    return this.images.get(id);
  }

  reconcileUids(accountId: string, serverUids: number[]): void {
    const server = new Set(serverUids);
    for (const message of [...this.messages.values()]) {
      if (message.accountId !== accountId) continue;
      if (!server.has(message.imapUid)) {
        for (const imageId of message.inlineImageIds) {
          this.images.delete(imageId);
        }
        this.messages.delete(message.id);
      }
    }
  }
}
