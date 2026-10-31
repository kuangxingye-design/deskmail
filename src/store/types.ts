/**
 * 本地存储模块接口（真实定义）。
 * 桩实现：InMemoryMailStore。真实实现：#6（SQLite）。
 */
import type { Importance, InlineImage, Message, SyncState } from '../model/types';

export interface MailStoreQuery {
  /** 不传 = 全部账号 */
  accountId?: string;
  /** 滚动加载游标：只取 receivedAt 早于该时间的邮件 */
  before?: string;
  limit?: number;
}

export interface MailStore {
  upsertMessages(messages: Message[]): void;
  /** 按 receivedAt 倒序（统一收件箱混排依据） */
  query(q: MailStoreQuery): Message[];
  getMessage(id: string): Message | undefined;
  setImportance(id: string, level: Importance): void;
  markRead(id: string): void;
  unreadCount(accountId?: string): number;

  getSyncState(accountId: string): SyncState | undefined;
  saveSyncState(state: SyncState): void;

  saveInlineImage(image: InlineImage): void;
  getInlineImage(id: string): InlineImage | undefined;

  /** UID 对账（附注1：以服务器为准）：移除服务器已不存在的邮件及其图片 */
  reconcileUids(accountId: string, serverUids: number[]): void;
}
