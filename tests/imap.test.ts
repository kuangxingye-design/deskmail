import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ImapFlow } from 'imapflow';
import { classifyImapError } from '../src/main/imap/errors';
import { buildImapOptions, ImapClientImpl, selectNewestUids } from '../src/main/imap/real';
import { PROVIDER_CONFIGS } from '../src/imap/types';

test('classifyImapError: 授权失败', () => {
  const error = classifyImapError(
    Object.assign(new Error('LOGIN failed'), { authenticationFailed: true }),
  );
  assert.equal(error.kind, 'auth_failed');
});

test('classifyImapError: 网易 Unsafe Login', () => {
  const error = classifyImapError(
    new Error('NO [UNAVAILABLE] Unsafe Login. Please contact kefu@188.com for help'),
  );
  assert.equal(error.kind, 'unsafe_login');
});

test('classifyImapError: 网络错误', () => {
  const error = classifyImapError(
    Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
  );
  assert.equal(error.kind, 'network');
});

test('classifyImapError: 其他错误', () => {
  const error = classifyImapError(new Error('boom'));
  assert.equal(error.kind, 'other');
});

test('selectNewestUids: 过滤 n:* 的最后一封并倒序截断', () => {
  assert.deepEqual(selectNewestUids([100], 101, 200), []);
  assert.deepEqual(selectNewestUids([100, 102, 101], 100, 2), [102, 101]);
  assert.deepEqual(selectNewestUids([5, 3, 9], 1, 10), [9, 5, 3]);
  assert.deepEqual(selectNewestUids([5, 3, 9], 1, 0), []);
});

test('ProviderConfig: QQ/126 地址与 ID 要求', () => {
  assert.equal(PROVIDER_CONFIGS.qq.host, 'imap.qq.com');
  assert.equal(PROVIDER_CONFIGS.qq.requireId, false);
  assert.equal(PROVIDER_CONFIGS.netease126.host, 'imap.126.com');
  assert.equal(PROVIDER_CONFIGS.netease126.requireId, true);
  assert.equal(PROVIDER_CONFIGS.netease163.host, 'imap.163.com');
  assert.equal(PROVIDER_CONFIGS.netease163.requireId, true);
});

test('buildImapOptions: 带 clientInfo、关闭 logger 与 auto IDLE', () => {
  const options = buildImapOptions(PROVIDER_CONFIGS.netease126, {
    user: 'user@126.com',
    password: 'auth-code-not-logged',
  });
  assert.equal(options.host, 'imap.126.com');
  assert.equal(options.secure, true);
  assert.equal(options.clientInfo?.['support-email'], 'user@126.com');
  assert.equal(options.logger, false);
  assert.equal(options.disableAutoIdle, true);
});

test('ImapClientImpl: 内存 mock 客户端的命令序列与映射', async () => {
  const calls: string[] = [];
  const rows = [
    {
      uid: 108,
      envelope: {
        messageId: '<m1@mock>',
        subject: '验证码',
        from: [{ name: '腾讯云', address: 'noreply@qq.com' }],
      },
      internalDate: new Date('2026-10-31T10:32:00Z'),
      flags: new Set<string>(),
    },
    {
      uid: 107,
      envelope: {
        subject: '安全提醒',
        from: [{ address: 'noreply@163.com' }],
      },
      internalDate: new Date('2026-10-31T09:58:00Z'),
      flags: new Set<string>(['\\Seen']),
    },
  ];

  const fake = {
    mailbox: { uidValidity: 123n },
    connect: async () => { calls.push('connect'); },
    mailboxOpen: async (path: string) => { calls.push(`mailboxOpen:${path}`); return { path }; },
    search: async () => { calls.push('search'); return [108, 107, 101]; },
    fetchAll: async (range: string) => { calls.push(`fetchAll:${range}`); return rows; },
    fetchOne: async (uid: string) => {
      calls.push(`fetchOne:${uid}`);
      return { uid: Number(uid), source: Buffer.from('raw-mime'), envelope: { messageId: '<m1@mock>' } };
    },
    messageFlagsAdd: async (uid: string) => { calls.push(`messageFlagsAdd:${uid}`); return true; },
    logout: async () => { calls.push('logout'); },
  } as unknown as ImapFlow;

  const client = new ImapClientImpl(() => fake);
  await client.connect(PROVIDER_CONFIGS.qq, { user: 'user@qq.com', password: 'auth-code' });

  const headers = await client.fetchHeaders(1, 2);
  assert.equal(headers.length, 2);
  assert.equal(headers[0].imapUid, 108);
  assert.equal(headers[0].subject, '验证码');
  assert.equal(headers[0].senderName, '腾讯云');
  assert.equal(headers[0].isRead, false);
  assert.equal(headers[1].imapUid, 107);
  assert.equal(headers[1].isRead, true);
  assert.equal(headers[1].receivedAt, '2026-10-31T09:58:00.000Z');

  const raw = await client.fetchMessage(108);
  assert.equal(Buffer.from(raw.raw).toString('utf8'), 'raw-mime');

  await client.markSeen(108);
  assert.equal(await client.getUidValidity(), 123);
  await client.close();

  assert.deepEqual(calls, [
    'connect',
    'mailboxOpen:INBOX',
    'search',
    'fetchAll:108,107',
    'fetchOne:108',
    'messageFlagsAdd:108',
    'logout',
  ]);
});
