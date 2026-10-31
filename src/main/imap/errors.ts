/**
 * IMAP 错误分类：把 imapflow / socket 的异常收敛为产品可展示的三类。
 * 不把原始 error 对象输出到日志，避免带出凭据或命令文本。
 */
import type { ImapFlowError } from 'imapflow';

export type ImapErrorKind = 'auth_failed' | 'network' | 'unsafe_login' | 'other';

export class ImapError extends Error {
  readonly kind: ImapErrorKind;

  constructor(kind: ImapErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ImapError';
    this.kind = kind;
  }
}

interface ErrorInfo {
  code?: string;
  message: string;
  serverResponseCode?: string;
  authenticationFailed?: boolean;
}

function readErrorInfo(error: unknown): ErrorInfo {
  const candidate = error as Partial<ImapFlowError> & { code?: string; message?: string };
  const parts = [candidate.responseText, candidate.message].filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  );
  return {
    code: candidate.code,
    message: parts.join(' | ') || String(error),
    serverResponseCode: candidate.serverResponseCode,
    authenticationFailed: candidate.authenticationFailed,
  };
}

const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'CONNECT_TIMEOUT',
  'GREETING_TIMEOUT',
  'ETIMEOUT',
  'NoConnection',
  'EConnectionClosed',
  'UPGRADE_TIMEOUT',
]);

export function classifyImapError(error: unknown): ImapError {
  const info = readErrorInfo(error);

  // 网易系未通过 ID 校验时的典型返回；排在 auth_failed 前，给出可操作提示
  if (/Unsafe Login/i.test(info.message)) {
    return new ImapError(
      'unsafe_login',
      '网易邮箱要求客户端 ID 校验未通过（Unsafe Login）。请确认网页端已开启 IMAP 服务，并使用最新版客户端重试。',
      { cause: error },
    );
  }

  if (
    info.authenticationFailed ||
    info.serverResponseCode === 'AUTHENTICATIONFAILED' ||
    /AUTHENTICATIONFAILED|LOGIN failed|Invalid credentials|authentication failed/i.test(info.message)
  ) {
    return new ImapError(
      'auth_failed',
      '授权码错误或已失效。请到网页端确认 IMAP 服务已开启，并重新生成授权码。',
      { cause: error },
    );
  }

  if (info.code && NETWORK_CODES.has(info.code)) {
    return new ImapError(
      'network',
      `无法连接 IMAP 服务器（${info.code}）。请检查网络、服务器地址与端口。`,
      { cause: error },
    );
  }

  return new ImapError(
    'other',
    `IMAP 操作失败：${info.message.slice(0, 200)}`,
    { cause: error },
  );
}
