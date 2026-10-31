/**
 * 核心数据模型（真实定义）。
 * 对应 Proposal #1「基本概念与信息结构」与 docs/architecture/p1.md 第 3 节。
 * 骨架期字段已定；后续任务不得随意改字段，变更需走设计澄清。
 */

/** 邮箱供应商（v0.1 仅三类） */
export type Provider = 'qq' | 'netease163' | 'netease162';

/** 账号连接状态 */
export type AccountStatus = 'ok' | 'auth_failed' | 'sync_error';

/** 本地三档重要性（不同步邮箱） */
export type Importance = 'normal' | 'important' | 'critical';

/** 卡片视图 */
export type ViewName = 'list' | 'detail' | 'manage';

/** 账号：供应商 + 完整邮箱 + 短备注名 + 头像颜色 + 连接状态 */
export interface Account {
  id: string;
  provider: Provider;
  email: string;
  alias: string;
  color: string;
  status: AccountStatus;
  createdAt: string;
  lastSyncAt?: string;
  lastSyncError?: string;
}

/** 邮件：头信息 + 已读 + 重要性（本地） + 正文 + 内嵌图片引用 */
export interface Message {
  id: string;
  accountId: string;
  /** IMAP UID，(accountId, imapUid) 唯一，增量同步游标依据 */
  imapUid: number;
  /** RFC 5322 Message-ID，用于去重 */
  messageId?: string;
  senderName?: string;
  senderEmail: string;
  subject: string;
  /** IMAP INTERNALDATE，统一收件箱按此混排 */
  receivedAt: string;
  isRead: boolean;
  importance: Importance;
  bodyText: string;
  /** 净化后的 HTML（#7 落地净化前，真实邮件 HTML 禁止进入渲染） */
  bodyHtml?: string;
  inlineImageIds: string[];
}

/** 内嵌图片：cid 关联正文，原始字节，复制时转 PNG */
export interface InlineImage {
  id: string;
  messageId: string;
  cid?: string;
  contentType: string;
  size: number;
  data: Uint8Array;
}

/** 每账号同步状态：游标 + 窗口 + 错误 */
export interface SyncState {
  accountId: string;
  lastSyncAt?: string;
  /** 已同步到的最大 UID */
  lastUid: number;
  /** IMAP UIDVALIDITY；变化触发全量重取 */
  uidValidity?: number;
  /** 滚动加载游标：已取到的最老 UID，向前翻页递减 */
  windowStartUid: number;
  status: 'ok' | 'failed';
  lastError?: string;
}

/** 卡片窗口状态（对应 Proposal「卡片」概念） */
export interface CardState {
  visible: boolean;
  x: number;
  y: number;
  /** null = 全部账号 */
  filterAccountId: string | null;
  view: ViewName;
  lastOpenMessageId?: string;
}
