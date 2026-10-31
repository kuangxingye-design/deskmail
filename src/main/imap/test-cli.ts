/**
 * 本地 IMAP 连接测试（#8）。
 *
 * 用法：
 *   npm run imap:test -- --provider qq --email you@qq.com
 *   npm run imap:test -- --provider 126 --email you@126.com
 *
 * 授权码优先读环境变量 DESKMAIL_IMAP_AUTH_CODE；否则终端隐藏输入。
 * 不打印授权码，不写任何文件。
 */
import { PROVIDER_CONFIGS } from '../../imap/types';
import type { Provider } from '../../model/types';
import { ImapError } from './errors';
import { ImapClientImpl } from './real';

const PROVIDER_ALIASES: Record<string, Provider> = {
  qq: 'qq',
  '126': 'netease126',
  netease126: 'netease126',
  '163': 'netease163',
  netease163: 'netease163',
  '162': 'netease162',
  netease162: 'netease162',
};

interface CliOptions {
  provider: Provider;
  email: string;
  limit: number;
}

function printHelp(): void {
  console.log(
    [
      '用法: npm run imap:test -- --provider <qq|126|163|162> --email <address> [--limit 5]',
      '',
      '授权码优先读环境变量 DESKMAIL_IMAP_AUTH_CODE；否则终端隐藏输入。',
      '示例: npm run imap:test -- --provider qq --email you@qq.com',
    ].join('\n'),
  );
}

function parseArgs(argv: string[]): CliOptions | null {
  let providerKey = '';
  let email = '';
  let limit = 5;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      return null;
    }
    if (arg === '--provider') {
      providerKey = argv[++index] ?? '';
      continue;
    }
    if (arg === '--email') {
      email = argv[++index] ?? '';
      continue;
    }
    if (arg === '--limit') {
      limit = Number(argv[++index] ?? '5');
      continue;
    }
    throw new Error(`未知参数: ${arg}`);
  }

  const provider = PROVIDER_ALIASES[providerKey];
  if (!provider) {
    throw new Error('--provider 必须是 qq / 126 / 163 / 162');
  }
  if (!email.includes('@')) {
    throw new Error('--email 必须是完整邮箱地址');
  }
  if (!Number.isFinite(limit) || limit <= 0) {
    limit = 5;
  }

  return { provider, email, limit: Math.min(Math.trunc(limit), 50) };
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin as NodeJS.ReadStream & { setRawMode(mode: boolean): void };
    const stdout = process.stdout;

    if (!stdin.isTTY) {
      reject(new Error('当前终端不支持隐藏输入；请设置环境变量 DESKMAIL_IMAP_AUTH_CODE 后重试'));
      return;
    }

    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
    };

    const onData = (chunk: string | Buffer) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      for (const char of text) {
        if (char === '\u0003') {
          cleanup();
          stdout.write('\n');
          reject(new Error('已取消'));
          return;
        }
        if (char === '\r' || char === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u007f' || char === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write('\b \b');
          }
          continue;
        }
        value += char;
        stdout.write('*');
      }
    };

    stdin.on('data', onData);
  });
}

async function readAuthCode(): Promise<string> {
  const fromEnv = process.env.DESKMAIL_IMAP_AUTH_CODE;
  if (fromEnv) return fromEnv;
  return promptHidden('授权码（输入不回显）: ');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options) return;

  const cfg = PROVIDER_CONFIGS[options.provider];
  const authCode = await readAuthCode();
  const client = new ImapClientImpl();

  console.log(`provider: ${options.provider} (${cfg.host}:${cfg.port}, TLS=${cfg.tls})`);
  console.log(`email: ${options.email}`);

  try {
    await client.connect(cfg, { user: options.email, password: authCode });
    const uidValidity = await client.getUidValidity();
    const headers = await client.fetchHeaders(1, options.limit);

    console.log(`uidValidity: ${uidValidity ?? 'unknown'}`);
    console.log(`headers: ${headers.length}`);
    for (const header of headers) {
      console.log(
        `- uid=${header.imapUid} | ${header.senderName || header.senderEmail} | ${header.subject} | ${header.receivedAt} | ${header.isRead ? 'read' : 'unread'}`,
      );
    }

    const first = headers[0];
    if (first) {
      const raw = await client.fetchMessage(first.imapUid);
      console.log(
        `raw: uid=${first.imapUid}, ${raw.raw.byteLength} bytes, messageId=${raw.messageId ?? '-'}`,
      );
    }

    console.log('OK');
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof ImapError) {
    console.error(`[${error.kind}] ${error.message}`);
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exitCode = 1;
});
