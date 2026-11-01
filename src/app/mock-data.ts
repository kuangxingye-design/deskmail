/**
 * mock 数据：取自 P0 原型 prototype/deskmail-v0.1.html（ACCOUNTS 与 mails）。
 * 仅骨架期使用；ui 不得直接 import 本文件（必须经 inbox → store 链路）。
 *
 * mock 邮件按账号分组：每个账号一份独立 IMAP fixture（经组合根 createImap 工厂装配），
 * 账号间邮件不重复。共 8 封、未读 3 封，与原型一致。
 * 126 账号用于覆盖 getmeal 已验证的 QQ + 126 组合。
 */
import type { Account } from '../model/types';
import type { FixtureMessage } from '../imap/fixture';

export const MOCK_ACCOUNTS: Account[] = [
  {
    id: 'qq-main',
    provider: 'qq',
    email: 'kuangxy@qq.com',
    alias: '主号',
    color: '#5aa9ff',
    status: 'ok',
    createdAt: '2026-10-01T00:00:00+08:00',
  },
  {
    id: 'qq-alt',
    provider: 'qq',
    email: 'deskmail_demo_account@qq.com',
    alias: '小号',
    color: '#8b9dff',
    status: 'ok',
    createdAt: '2026-10-01T00:00:00+08:00',
  },
  {
    id: '163-work',
    provider: 'netease163',
    email: 'kuangxingye.deskmail@163.com',
    alias: '工作',
    color: '#ff7a7a',
    status: 'ok',
    createdAt: '2026-10-01T00:00:00+08:00',
  },
  {
    id: '163-bill',
    provider: 'netease163',
    email: 'kxy.bill@163.com',
    alias: '账单',
    color: '#ffa07a',
    status: 'ok',
    createdAt: '2026-10-01T00:00:00+08:00',
  },
  {
    id: '126-daily',
    provider: 'netease126',
    email: 'daily@126.com',
    alias: '订阅',
    color: '#4fd1a5',
    status: 'ok',
    createdAt: '2026-10-01T00:00:00+08:00',
  },
];

interface MockMessageInput extends Omit<FixtureMessage, 'raw'> {
  body: string;
}

/**
 * 生成最小 RFC822 文本：头信息用 ASCII 占位，正文保留 UTF-8。
 * 列表展示使用的是 FixtureMessage 的 header 元数据，不依赖这里的 Subject/From。
 */
function buildRawMessage(input: MockMessageInput): Uint8Array {
  const headers = [
    `From: mock <${input.senderEmail}>`,
    'To: mock@deskmail.local',
    'Subject: mock message',
    `Date: ${new Date(input.receivedAt).toUTCString()}`,
    input.messageId ? `Message-ID: ${input.messageId}` : '',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
  ]
    .filter((line) => line.length > 0)
    .join('\r\n');
  return new TextEncoder().encode(`${headers}\r\n\r\n${input.body}\r\n`);
}

function mockMessage(input: MockMessageInput): FixtureMessage {
  const meta: Omit<FixtureMessage, 'raw'> = {
    imapUid: input.imapUid,
    messageId: input.messageId,
    senderName: input.senderName,
    senderEmail: input.senderEmail,
    subject: input.subject,
    receivedAt: input.receivedAt,
    isRead: input.isRead,
  };
  return { ...meta, raw: buildRawMessage(input) };
}

/** 每账号的 IMAP fixture 数据（key = Account.id，uid 在账号内唯一） */
export const MOCK_RAW_MESSAGES_BY_ACCOUNT: Record<string, FixtureMessage[]> = {
  'qq-main': [
    mockMessage({
      imapUid: 108,
      messageId: '<m1@mock.local>',
      senderName: '腾讯云',
      senderEmail: 'noreply@qq.com',
      subject: '您的验证码是 482913',
      receivedAt: '2026-10-31T10:32:00+08:00',
      isRead: false,
      body: '您正在登录腾讯云控制台，本次登录的验证码是：482913。验证码 5 分钟内有效。如非本人操作，请忽略本邮件。',
    }),
    mockMessage({
      imapUid: 102,
      messageId: '<m7@mock.local>',
      senderName: '张三',
      senderEmail: 'zhangsan@qq.com',
      subject: '项目周报（10 月第 4 周）',
      receivedAt: '2026-10-26T17:30:00+08:00',
      isRead: true,
      body: '本周完成登录流程联调，下周开始做邮件列表。风险是 IMAP 授权码在部分账号上过期，需要补一个重新授权入口。',
    }),
  ],
  'qq-alt': [
    mockMessage({
      imapUid: 105,
      messageId: '<m4@mock.local>',
      senderName: 'GitHub',
      senderEmail: 'notifications@github.com',
      subject: '[deskmail] 新的 Issue 已分配给你',
      receivedAt: '2026-10-30T15:04:00+08:00',
      isRead: true,
      body: 'Issue #12「桌面卡片置顶行为」已分配给你。请在本周内确认交互细节并回复。',
    }),
  ],
  '163-work': [
    mockMessage({
      imapUid: 107,
      messageId: '<m2@mock.local>',
      senderName: '网易邮箱团队',
      senderEmail: 'noreply@163.com',
      subject: '账号安全提醒：检测到新设备登录',
      receivedAt: '2026-10-31T09:58:00+08:00',
      isRead: false,
      body: '我们检测到你的账号在一台新设备上登录。设备：Windows 11 · Chrome；地点：中国 · 杭州；时间：今天 09:56。如果这是你本人操作，请忽略本邮件；否则请立即修改密码。',
    }),
    mockMessage({
      imapUid: 101,
      messageId: '<m8@mock.local>',
      senderName: '携程旅行',
      senderEmail: 'no-reply@ctrip.com',
      subject: '您的行程确认：杭州 → 北京',
      receivedAt: '2026-10-25T08:40:00+08:00',
      isRead: true,
      body: '您预订的 11 月 2 日杭州飞北京航班已确认，起飞时间 08:40，请提前 2 小时到达机场。',
    }),
  ],
  '163-bill': [
    mockMessage({
      imapUid: 104,
      messageId: '<m5@mock.local>',
      senderName: '招商银行信用卡',
      senderEmail: 'ebill@cmbchina.com',
      subject: '9 月电子账单已出',
      receivedAt: '2026-10-30T09:12:00+08:00',
      isRead: true,
      body: '您的 9 月信用卡电子账单已生成。本期应还：3,286.40 元；最后还款日：10 月 25 日。请按时还款，以免产生利息。',
    }),
  ],
  '126-daily': [
    mockMessage({
      imapUid: 106,
      messageId: '<m3@mock.local>',
      senderName: '林晚',
      senderEmail: 'linwan@126.com',
      subject: '周四评审材料（含最新视觉稿）',
      receivedAt: '2026-10-30T18:20:00+08:00',
      isRead: false,
      body: 'Hi，最新的视觉稿放在下面了，周四评审用。重点看首页的玻璃卡片和列表层级，有问题明天上午前告诉我。另外，交互稿里「重要程度」那组按钮也一起确认一下。',
    }),
    mockMessage({
      imapUid: 103,
      messageId: '<m6@mock.local>',
      senderName: '订阅日报',
      senderEmail: 'daily@126.com',
      subject: '今日精选：桌面效率工具 12 款',
      receivedAt: '2026-10-27T08:00:00+08:00',
      isRead: true,
      body: '今日精选了 12 款桌面效率工具，其中包括窗口管理、剪贴板增强和桌面挂件。点击阅读全文。',
    }),
  ],
};
