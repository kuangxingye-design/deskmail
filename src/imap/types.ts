/**
 * IMAP 协议适配模块接口（真实定义）。
 * 桩实现：FixtureImapClient。真实实现：#5。
 */
import type { Provider } from '../model/types';

/** 供应商连接参数表（骨架期静态表；#5 以实测修正） */
export interface ProviderConfig {
  provider: Provider;
  host: string;
  port: number;
  tls: boolean;
  /** 认证前需发送 IMAP ID 命令（网易系历史上要求） */
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

/** 单封原始邮件（MIME 解析前） */
export interface RawMessage {
  imapUid: number;
  messageId?: string;
  senderName?: string;
  senderEmail: string;
  subject: string;
  receivedAt: string;
  isRead: boolean;
  bodyText: string;
  bodyHtml?: string;
  inlineImages: RawInlineImage[];
}

/** 会话级 IMAP 客户端（每账号一个会话） */
export interface ImapClient {
  connect(cfg: ProviderConfig): Promise<void>;
  /** 按 UID 从高到低取一段头信息；uidFrom 含该 UID */
  fetchHeaders(uidFrom: number, limit: number): Promise<HeaderBatch[]>;
  fetchMessage(uid: number): Promise<RawMessage>;
  /** 打开即已读：IMAP STORE +FLAGS (\Seen)，失败不阻塞本地 */
  markSeen(uid: number): Promise<void>;
  close(): Promise<void>;
}

export const PROVIDER_CONFIGS: Record<Provider, ProviderConfig> = {
  qq: {
    provider: 'qq',
    host: 'imap.qq.com',
    port: 993,
    tls: true,
    requireId: false,
    description: 'QQ 邮箱 IMAP（网页端开启 IMAP/SMTP 服务并生成授权码）',
  },
  netease163: {
    provider: 'netease163',
    host: 'imap.163.com',
    port: 993,
    tls: true,
    requireId: true,
    description: '网易 163 邮箱 IMAP（授权码方式）',
  },
  netease162: {
    provider: 'netease162',
    host: 'imap.163.com',
    port: 993,
    tls: true,
    requireId: true,
    description: '网易 162 邮箱 IMAP（与 163 同服务器，待 #5 实测确认）',
  },
};
