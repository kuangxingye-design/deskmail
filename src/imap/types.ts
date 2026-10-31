/**
 * IMAP 协议适配模块接口（真实定义）。
 * 桩实现：FixtureImapClient；真实实现：src/main/imap/real.ts（#8）。
 */
import type { Provider } from '../model/types';

/** 供应商连接参数表（getmeal 实测：QQ / 126 已验证；163 / 162 待实测） */
export interface ProviderConfig {
  provider: Provider;
  host: string;
  port: number;
  tls: boolean;
  /** 网易系需要在 LOGIN 后发送 IMAP ID 命令；imapflow 通过 clientInfo 自动补发 */
  requireId: boolean;
  description: string;
}

/** 列表级数据（对应 IMAP ENVELOPE + FLAGS 子集） */
export interface HeaderBatch {
  imapUid: number;
  messageId?: string;
  senderName?: string;
  senderEmail: string;
  subject: string;
  receivedAt: string;
  isRead: boolean;
}

export interface RawInlineImage {
  cid?: string;
  contentType: string;
  data: Uint8Array;
}

/**
 * 单封原始邮件：只承载 IMAP FETCH 得到的原始 MIME 字节。
 * MIME 解析与 HTML 净化归 content.MessageParser（#10）；IMAP 层不做解析。
 */
export interface RawMessage {
  imapUid: number;
  messageId?: string;
  raw: Uint8Array;
}

/** 账号凭据：只在内存中流转，禁止写日志/落盘（p1.md R6） */
export interface ImapCredentials {
  user: string;
  password: string;
}

/** 会话级 IMAP 客户端（每账号一个会话） */
export interface ImapClient {
  /** 连接并认证；网易系由实现负责在登录后发送 ID 命令 */
  connect(cfg: ProviderConfig, credentials: ImapCredentials): Promise<void>;
  /** 按 UID 从高到低取一段头信息；uidFrom 含该 UID */
  fetchHeaders(uidFrom: number, limit: number): Promise<HeaderBatch[]>;
  /** 取单封原始 MIME 字节；不做解析 */
  fetchMessage(uid: number): Promise<RawMessage>;
  /** 打开即已读：IMAP STORE +FLAGS (\Seen)，失败不阻塞本地 */
  markSeen(uid: number): Promise<void>;
  /** 当前文件夹 UIDVALIDITY；变化时该账号需全量重取 */
  getUidValidity(): Promise<number | undefined>;
  close(): Promise<void>;
}

export const PROVIDER_CONFIGS: Record<Provider, ProviderConfig> = {
  qq: {
    provider: 'qq',
    host: 'imap.qq.com',
    port: 993,
    tls: true,
    requireId: false,
    description: 'QQ 邮箱 IMAP（网页端开启 IMAP/SMTP 并生成授权码；getmeal 已验证）',
  },
  netease126: {
    provider: 'netease126',
    host: 'imap.126.com',
    port: 993,
    tls: true,
    requireId: true,
    description: '网易 126 邮箱 IMAP（授权码方式；getmeal 已验证）',
  },
  netease163: {
    provider: 'netease163',
    host: 'imap.163.com',
    port: 993,
    tls: true,
    requireId: true,
    description: '网易 163 邮箱 IMAP（授权码方式；getmeal 支持，待本机实测）',
  },
  netease162: {
    provider: 'netease162',
    host: 'imap.163.com',
    port: 993,
    tls: true,
    requireId: true,
    description: '网易 162 邮箱 IMAP（可能共用 imap.163.com，待 #8 实测确认）',
  },
};
