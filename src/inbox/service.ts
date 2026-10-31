/**
 * InboxServiceImpl 真实薄编排：只做「调用 + 组装」，不含平台能力与协议逻辑。
 * 读路径：store → 摘要/详情；副作用：打开即已读（本地）、重要性标记（本地）。
 */
import type { InlineImage } from '../model/types';
import type { Importance, Message } from '../model/types';
import type { InboxService, ListOptions, MailDetail, MailSummary } from './types';
import type { MailStore } from '../store/types';
import type { AccountService } from '../accounts/types';

function toSummary(message: Message): MailSummary {
  return {
    id: message.id,
    accountId: message.accountId,
    senderName: message.senderName,
    senderEmail: message.senderEmail,
    subject: message.subject,
    receivedAt: message.receivedAt,
    isRead: message.isRead,
    importance: message.importance,
  };
}

export class InboxServiceImpl implements InboxService {
  constructor(
    private readonly store: MailStore,
    private readonly accounts: AccountService,
  ) {}

  list(filterAccountId: string | null, opts?: ListOptions): MailSummary[] {
    return this.store
      .query({
        accountId: filterAccountId ?? undefined,
        before: opts?.before,
        limit: opts?.limit,
      })
      .map(toSummary);
  }

  detail(id: string): MailDetail | undefined {
    const message = this.store.getMessage(id);
    if (!message) {
      return undefined;
    }
    if (!message.isRead) {
      // 打开即已读（Proposal 关键决策）；远端 IMAP \Seen 由 #12 异步补发
      this.store.markRead(id);
    }
    const current = this.store.getMessage(id);
    if (!current) {
      return undefined;
    }
    const inlineImages = current.inlineImageIds
      .map((imageId) => this.store.getInlineImage(imageId))
      .filter((image): image is InlineImage => image !== undefined)
      .map((image) => ({ id: image.id, contentType: image.contentType }));
    return {
      id: current.id,
      accountId: current.accountId,
      senderName: current.senderName,
      senderEmail: current.senderEmail,
      subject: current.subject,
      receivedAt: current.receivedAt,
      isRead: current.isRead,
      importance: current.importance,
      bodyText: current.bodyText,
      bodyHtml: current.bodyHtml,
      inlineImages,
    };
  }

  setImportance(id: string, level: Importance): void {
    this.store.setImportance(id, level);
  }

  accountsOverview() {
    return this.accounts.list().map((account) => ({
      ...account,
      unread: this.store.unreadCount(account.id),
    }));
  }
}
