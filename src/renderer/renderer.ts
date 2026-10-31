/**
 * renderer 入口（骨架最小验证壳）：
 * 1. 组合根装配（BrowserStubPlatformServices 注入）；
 * 2. syncAll（桩）把 mock 数据经 imap → content → store 写入；
 * 3. inbox.list 读回并渲染 —— 证明读路径接线成立；
 * 4. 打开一封未读详情，验证「打开即已读」副作用路径（未读数 -1）；
 * 5. 经 preload 上报 smoke 结果，主进程校验后退出。
 */
import { compose } from '../app/compose';
import { BrowserStubPlatformServices } from '../platform/browser-stub';
import type { MailSummary } from '../inbox/types';

function renderList(items: MailSummary[]): void {
  const listEl = document.getElementById('mail-list');
  const unreadEl = document.getElementById('unread-count');
  if (!listEl) return;

  listEl.replaceChildren();
  for (const item of items) {
    const li = document.createElement('li');
    li.className = item.isRead ? 'mail-row' : 'mail-row unread';
    li.title = `${item.subject}（${item.receivedAt}）`;

    const sender = document.createElement('span');
    sender.className = 'sender';
    sender.textContent = item.senderName ?? item.senderEmail;

    const subject = document.createElement('span');
    subject.className = 'subject';
    subject.textContent = item.subject;

    li.append(sender, subject);
    listEl.append(li);
  }

  if (unreadEl) {
    unreadEl.textContent = String(items.filter((item) => !item.isRead).length);
  }
}

function totalUnread(app: ReturnType<typeof compose>): number {
  // 经 accountsOverview → store.unreadCount 聚合（未读数不走列表遍历）
  return app.inbox.accountsOverview().reduce((sum, account) => sum + account.unread, 0);
}

async function boot(): Promise<void> {
  const app = compose(new BrowserStubPlatformServices());

  // 桩同步：mock 数据写入 store（真实链路将在 #8 由调度器触发）
  const summary = await app.sync.syncAll();
  console.log('[deskmail] sync summary:', JSON.stringify(summary));

  const summaries = app.inbox.list(null);
  renderList(summaries);

  const unreadBefore = totalUnread(app);
  const firstUnread = summaries.find((item) => !item.isRead);
  if (firstUnread) {
    app.inbox.detail(firstUnread.id); // 副作用：打开即已读
  }
  const unreadAfter = totalUnread(app);

  const report = {
    ok: summaries.length > 0 && unreadAfter === Math.max(0, unreadBefore - 1),
    count: summaries.length,
    unreadBefore,
    unreadAfter,
  };
  console.log('[deskmail] renderer report:', report);
  window.deskmail?.reportSmoke(report);
}

void boot();
