/**
 * 收件箱用例模块接口（真实定义）。
 * 真实薄编排实现：src/inbox/service.ts（骨架期即可真写，无平台依赖）。
 */
import type { Account, Importance } from '../model/types';

export interface MailSummary {
  id: string;
  accountId: string;
  senderName?: string;
  senderEmail: string;
  subject: string;
  receivedAt: string;
  isRead: boolean;
  importance: Importance;
}

export interface InlineImageRef {
  id: string;
  contentType: string;
}

export interface MailDetail {
  id: string;
  accountId: string;
  senderName?: string;
  senderEmail: string;
  subject: string;
  receivedAt: string;
  isRead: boolean;
  importance: Importance;
  bodyText: string;
  bodyHtml?: string;
  inlineImages: InlineImageRef[];
}

export interface AccountWithUnread extends Account {
  unread: number;
}

export interface ListOptions {
  before?: string;
  limit?: number;
}

export interface InboxService {
  /** filterAccountId 为 null = 全部账号，按 receivedAt 混排 */
  list(filterAccountId: string | null, opts?: ListOptions): MailSummary[];
  /** 打开即已读：本地 isRead 立即生效；远端 \Seen 异步（#12） */
  detail(id: string): MailDetail | undefined;
  setImportance(id: string, level: Importance): void;
  accountsOverview(): AccountWithUnread[];
}
