/**
 * UI（#7）+ 主进程 IPC 客户端（#15）。
 *
 * 数据只经 window.deskmail（preload → main → inbox），renderer 不再直接 compose / import mock。
 * 真实 IMAP / SQLite / 内容解析在主进程；桌面壳能力由后续任务接入。
 */
import type { DeskMailClient } from '../ipc/types';
import type { AccountWithUnread, MailDetail, MailSummary } from '../inbox/types';
import type { Importance, Provider } from '../model/types';

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
}

type ViewName = 'list' | 'detail' | 'manage';

interface UiState {
  view: ViewName;
  filterAccountId: string | null;
  currentId: string | null;
}

const PROVIDER_LABELS: Record<Provider, string> = {
  qq: 'QQ',
  netease126: '126',
  netease163: '163',
  netease162: '162',
};

const IMPORTANCE_LABELS: Record<Importance, string> = {
  normal: '一般',
  important: '重要',
  critical: '严重',
};

class MailCardUi {
  private readonly elements = {
    card: byId<HTMLElement>('card'),
    cardTitle: byId<HTMLElement>('cardTitle'),
    cardSubtitle: byId<HTMLElement>('cardSubtitle'),
    unreadCount: byId<HTMLElement>('unreadCount'),
    accountCount: byId<HTMLElement>('accountCount'),
    settingsBtn: byId<HTMLButtonElement>('settingsBtn'),
    backBtn: byId<HTMLButtonElement>('backBtn'),
    filterTrigger: byId<HTMLButtonElement>('filterTrigger'),
    filterAvatar: byId<HTMLElement>('filterAvatar'),
    filterLabel: byId<HTMLElement>('filterLabel'),
    filterCount: byId<HTMLElement>('filterCount'),
    filterMenu: byId<HTMLDivElement>('filterMenu'),
    listView: byId<HTMLElement>('listView'),
    mailList: byId<HTMLUListElement>('mailList'),
    emptyState: byId<HTMLElement>('emptyState'),
    detailView: byId<HTMLElement>('detailView'),
    detailScroll: byId<HTMLElement>('detailScroll'),
    detailSubject: byId<HTMLElement>('detailSubject'),
    detailSender: byId<HTMLElement>('detailSender'),
    detailTime: byId<HTMLElement>('detailTime'),
    detailAccount: byId<HTMLElement>('detailAccount'),
    detailEmail: byId<HTMLElement>('detailEmail'),
    detailBody: byId<HTMLElement>('detailBody'),
    importance: byId<HTMLElement>('importance'),
    copyTextBtn: byId<HTMLButtonElement>('copyTextBtn'),
    accountSheet: byId<HTMLElement>('accountSheet'),
    accountList: byId<HTMLUListElement>('accountList'),
    sheetCloseBtn: byId<HTMLButtonElement>('sheetCloseBtn'),
    addAccountBtn: byId<HTMLButtonElement>('addAccountBtn'),
    accountForm: byId<HTMLFormElement>('accountForm'),
    accountEmail: byId<HTMLInputElement>('accountEmail'),
    accountAlias: byId<HTMLInputElement>('accountAlias'),
    accountAuthCode: byId<HTMLInputElement>('accountAuthCode'),
    accountCancel: byId<HTMLButtonElement>('accountCancel'),
    accountFormError: byId<HTMLElement>('accountFormError'),
    toast: byId<HTMLElement>('toast'),
  };

  private readonly state: UiState = {
    view: 'list',
    filterAccountId: null,
    currentId: null,
  };

  private accounts: AccountWithUnread[] = [];
  private accountMap = new Map<string, AccountWithUnread>();
  private currentDetail: MailDetail | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly client: DeskMailClient) {}

  async init(): Promise<void> {
    await this.refreshAccounts();
    this.bindEvents();
    this.renderShell();
    await this.renderList();
    this.renderFilterTrigger();
  }

  private async refreshAccounts(): Promise<void> {
    this.accounts = await this.client.accountsOverview();
    this.accountMap = new Map(this.accounts.map((account) => [account.id, account]));
  }

  private totalUnread(): number {
    return this.accounts.reduce((sum, account) => sum + account.unread, 0);
  }

  private renderShell(): void {
    const isDetail = this.state.view === 'detail';
    this.elements.card.classList.toggle('detail-mode', isDetail);
    this.elements.cardTitle.textContent = isDetail ? '邮件详情' : '收件箱';
    this.elements.cardSubtitle.hidden = isDetail;
    this.elements.settingsBtn.hidden = isDetail;
    this.elements.listView.hidden = this.state.view !== 'list';
    this.elements.detailView.hidden = !isDetail;
    this.elements.accountSheet.hidden = this.state.view !== 'manage';
    this.elements.unreadCount.textContent = String(this.totalUnread());
    this.elements.accountCount.textContent = String(this.accounts.length);
  }

  private async renderList(): Promise<void> {
    const items = await this.client.list(this.state.filterAccountId);
    this.elements.mailList.replaceChildren();
    for (const item of items) {
      this.elements.mailList.append(this.createMailRow(item));
    }
    this.elements.emptyState.hidden = items.length > 0;
    this.renderShell();
    this.renderFilterTrigger();
  }

  private createMailRow(item: MailSummary): HTMLLIElement {
    const account = this.accountMap.get(item.accountId);
    const row = document.createElement('li');
    row.className = `mail-row${item.isRead ? '' : ' unread'}`;
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `${item.senderName || item.senderEmail}：${item.subject}`);
    row.addEventListener('click', () => {
      void this.openMail(item.id);
    });
    row.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      void this.openMail(item.id);
    });

    const dot = document.createElement('span');
    dot.className = 'unread-dot';
    dot.setAttribute('aria-hidden', 'true');

    const main = document.createElement('div');
    main.className = 'mail-main';

    const top = document.createElement('div');
    top.className = 'mail-top';

    const badge = document.createElement('span');
    badge.className = 'acct';
    if (account) badge.style.setProperty('--acct-color', account.color);
    const avatar = document.createElement('span');
    avatar.className = 'acct-avatar';
    avatar.textContent = (account?.alias || '?').charAt(0);
    badge.append(avatar, document.createTextNode(account?.alias ?? item.accountId));

    const sender = document.createElement('span');
    sender.className = 'sender';
    sender.textContent = item.senderName || item.senderEmail;

    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = formatTime(item.receivedAt);

    top.append(badge, sender, time);

    const bottom = document.createElement('div');
    bottom.className = 'mail-bottom';

    const subject = document.createElement('span');
    subject.className = 'subject';
    subject.textContent = item.subject;
    bottom.append(subject);

    if (item.importance !== 'normal') {
      const importance = document.createElement('span');
      importance.className = `imp-badge ${item.importance}`;
      importance.textContent = IMPORTANCE_LABELS[item.importance];
      bottom.append(importance);
    }

    main.append(top, bottom);
    row.append(dot, main);
    return row;
  }

  private async openMail(id: string): Promise<void> {
    const detail = await this.client.detail(id);
    if (!detail) return;

    this.currentDetail = detail;
    this.state.currentId = id;
    this.state.view = 'detail';
    await this.refreshAccounts();
    this.renderDetail(detail);
    this.renderShell();
    this.elements.detailScroll.scrollTop = 0;
  }

  private renderDetail(detail: MailDetail): void {
    const account = this.accountMap.get(detail.accountId);

    this.elements.detailSubject.textContent = detail.subject;
    this.elements.detailSender.textContent = detail.senderName || detail.senderEmail;
    this.elements.detailTime.textContent = formatTime(detail.receivedAt);

    this.elements.detailAccount.replaceChildren();
    const avatar = document.createElement('span');
    avatar.className = 'acct-avatar';
    avatar.textContent = (account?.alias || '?').charAt(0);
    this.elements.detailAccount.append(
      avatar,
      document.createTextNode(account?.alias ?? detail.accountId),
    );
    if (account) {
      this.elements.detailAccount.style.setProperty('--acct-color', account.color);
      this.elements.detailAccount.title = `${account.alias} · ${account.email}`;
    }
    this.elements.detailEmail.textContent = account?.email ?? '';

    this.elements.detailBody.replaceChildren();
    if (detail.bodyHtml) {
      // #10 已净化；CSP img-src 仅 self/data，远程图不会加载
      this.elements.detailBody.innerHTML = detail.bodyHtml;
    } else {
      this.elements.detailBody.textContent = detail.bodyText || '（无正文）';
    }

    this.updateImportanceButtons();
  }

  private updateImportanceButtons(): void {
    const active = this.currentDetail?.importance;
    this.elements.importance.querySelectorAll<HTMLButtonElement>('.imp-btn').forEach((button) => {
      button.classList.toggle('active', button.dataset.importance === active);
    });
  }

  private async setImportance(level: Importance): Promise<void> {
    if (!this.currentDetail) return;
    await this.client.setImportance(this.currentDetail.id, level);
    this.currentDetail.importance = level;
    this.updateImportanceButtons();
    await this.refreshAccounts();
    await this.renderList();
    this.showToast(`已标记为${IMPORTANCE_LABELS[level]}`);
  }

  private async backToList(): Promise<void> {
    this.currentDetail = null;
    this.state.currentId = null;
    this.state.view = 'list';
    this.renderShell();
    await this.renderList();
  }

  private renderFilterTrigger(): void {
    const selected = this.state.filterAccountId
      ? this.accountMap.get(this.state.filterAccountId)
      : undefined;

    if (selected) {
      this.elements.filterAvatar.className = 'chip-avatar';
      this.elements.filterAvatar.style.setProperty('--acct-color', selected.color);
      this.elements.filterAvatar.textContent = selected.alias.charAt(0) || '?';
      this.elements.filterLabel.textContent = selected.alias;
      this.elements.filterCount.textContent = selected.unread > 0 ? `${selected.unread} 未读` : '';
    } else {
      this.elements.filterAvatar.className = 'chip-avatar all';
      this.elements.filterAvatar.style.removeProperty('--acct-color');
      this.elements.filterAvatar.textContent = '全';
      this.elements.filterLabel.textContent = '全部账号';
      const total = this.totalUnread();
      this.elements.filterCount.textContent = total > 0 ? `${total} 未读` : '';
    }
  }

  private openFilterMenu(): void {
    this.renderFilterMenu();
    this.positionFilterMenu();
    this.elements.filterMenu.hidden = false;
    this.elements.filterTrigger.setAttribute('aria-expanded', 'true');
  }

  private closeFilterMenu(): void {
    this.elements.filterMenu.hidden = true;
    this.elements.filterTrigger.setAttribute('aria-expanded', 'false');
  }

  private positionFilterMenu(): void {
    const rect = this.elements.filterTrigger.getBoundingClientRect();
    const width = Math.min(rect.width, window.innerWidth - 16);
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    this.elements.filterMenu.style.width = `${width}px`;
    this.elements.filterMenu.style.left = `${left}px`;
    this.elements.filterMenu.style.top = `${rect.bottom + 8}px`;
  }

  private renderFilterMenu(): void {
    this.elements.filterMenu.replaceChildren();

    const all = this.createFilterOption({
      id: null,
      alias: '全部账号',
      email: '',
      color: '',
      unread: this.totalUnread(),
      isAll: true,
    });
    this.elements.filterMenu.append(all);

    const separator = document.createElement('div');
    separator.className = 'filter-sep';
    this.elements.filterMenu.append(separator);

    for (const account of this.accounts) {
      this.elements.filterMenu.append(
        this.createFilterOption({
          id: account.id,
          alias: account.alias,
          email: account.email,
          color: account.color,
          provider: account.provider,
          unread: account.unread,
          isAll: false,
        }),
      );
    }
  }

  private createFilterOption(input: {
    id: string | null;
    alias: string;
    email: string;
    color: string;
    provider?: Provider;
    unread: number;
    isAll: boolean;
  }): HTMLButtonElement {
    const active = this.state.filterAccountId === input.id;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `filter-option${active ? ' active' : ''}`;
    button.dataset.accountId = input.id ?? 'all';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(active));

    const avatar = document.createElement('span');
    avatar.className = input.isAll ? 'chip-avatar all' : 'chip-avatar';
    if (!input.isAll) avatar.style.setProperty('--acct-color', input.color);
    avatar.textContent = input.isAll ? '全' : input.alias.charAt(0) || '?';

    const main = document.createElement('span');
    main.className = 'opt-main';

    const alias = document.createElement('span');
    alias.className = 'opt-alias';
    alias.textContent = input.alias;
    if (input.provider) {
      const provider = document.createElement('em');
      provider.textContent = PROVIDER_LABELS[input.provider];
      alias.append(provider);
    }
    main.append(alias);

    if (input.email) {
      const email = document.createElement('span');
      email.className = 'opt-email';
      email.textContent = input.email;
      main.append(email);
    }

    const count = document.createElement('span');
    count.className = 'opt-count';
    count.textContent = input.unread > 0 ? `${input.unread} 未读` : '';

    const check = document.createElement('span');
    check.className = 'check';
    check.textContent = active ? '✓' : '';

    button.append(avatar, main, count, check);
    button.addEventListener('click', () => {
      this.state.filterAccountId = input.id;
      this.closeFilterMenu();
      void this.renderList();
    });
    return button;
  }

  private async openAccountSheet(): Promise<void> {
    this.closeFilterMenu();
    this.state.view = 'manage';
    await this.refreshAccounts();
    this.renderAccountList();
    this.elements.accountForm.hidden = true;
    this.elements.accountFormError.hidden = true;
    this.renderShell();
  }

  private async closeAccountSheet(): Promise<void> {
    this.state.view = 'list';
    this.renderShell();
    await this.renderList();
  }

  private renderAccountList(): void {
    this.elements.accountList.replaceChildren();
    for (const account of this.accounts) {
      const item = document.createElement('li');
      item.className = 'account-item';

      const avatar = document.createElement('span');
      avatar.className = 'avatar';
      avatar.style.setProperty('--acct-color', account.color);
      avatar.textContent = account.alias.charAt(0) || '?';

      const info = document.createElement('div');
      info.className = 'info';

      const alias = document.createElement('div');
      alias.className = 'alias';
      alias.textContent = account.alias;
      const provider = document.createElement('em');
      provider.textContent = PROVIDER_LABELS[account.provider];
      alias.append(provider);

      const email = document.createElement('div');
      email.className = 'email';
      email.textContent = account.email;

      info.append(alias, email);

      const status = document.createElement('span');
      status.className = 'status';
      status.textContent = statusLabel(account.status);

      item.append(avatar, info, status);
      this.elements.accountList.append(item);
    }
  }

  private toggleAccountForm(show: boolean): void {
    this.elements.accountForm.hidden = !show;
    this.elements.accountFormError.hidden = true;
    if (show) {
      this.elements.accountEmail.focus();
    } else {
      this.elements.accountForm.reset();
    }
  }

  private submitAccountForm(event: SubmitEvent): void {
    event.preventDefault();
    const email = this.elements.accountEmail.value.trim();
    const alias = this.elements.accountAlias.value.trim();
    const authCode = this.elements.accountAuthCode.value;

    const error = validateAccountForm(email, alias, authCode);
    if (error) {
      this.elements.accountFormError.textContent = error;
      this.elements.accountFormError.hidden = false;
      return;
    }

    this.elements.accountFormError.hidden = true;
    this.elements.accountAuthCode.value = '';
    this.showToast('账号添加逻辑将在账号管理任务接入（当前仅 UI 壳）');
  }

  private async copyText(): Promise<void> {
    const text = this.currentDetail?.bodyText ?? '';
    if (!text) {
      this.showToast('没有可复制的正文');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      this.showToast('已复制正文');
    } catch {
      if (fallbackCopyText(text)) {
        this.showToast('已复制正文');
      } else {
        this.showToast('复制失败，请检查剪贴板权限');
      }
    }
  }

  private showToast(message: string): void {
    this.elements.toast.textContent = message;
    this.elements.toast.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.elements.toast.classList.remove('show');
    }, 1800);
  }

  private bindEvents(): void {
    this.elements.filterTrigger.addEventListener('click', (event) => {
      event.stopPropagation();
      if (this.elements.filterMenu.hidden) this.openFilterMenu();
      else this.closeFilterMenu();
    });

    document.addEventListener('click', (event) => {
      if (this.elements.filterMenu.hidden) return;
      const target = event.target as Node;
      if (
        this.elements.filterMenu.contains(target) ||
        this.elements.filterTrigger.contains(target)
      ) {
        return;
      }
      this.closeFilterMenu();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.closeFilterMenu();
    });

    window.addEventListener('resize', () => {
      if (!this.elements.filterMenu.hidden) this.positionFilterMenu();
    });

    this.elements.settingsBtn.addEventListener('click', () => {
      void this.openAccountSheet();
    });
    this.elements.backBtn.addEventListener('click', () => {
      void this.backToList();
    });
    this.elements.sheetCloseBtn.addEventListener('click', () => {
      void this.closeAccountSheet();
    });
    this.elements.addAccountBtn.addEventListener('click', () => {
      this.toggleAccountForm(this.elements.accountForm.hasAttribute('hidden'));
    });
    this.elements.accountCancel.addEventListener('click', () => this.toggleAccountForm(false));
    this.elements.accountForm.addEventListener('submit', (event) => this.submitAccountForm(event));
    this.elements.importance.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.imp-btn');
      const level = button?.dataset.importance as Importance | undefined;
      if (level) void this.setImportance(level);
    });
    this.elements.copyTextBtn.addEventListener('click', () => {
      void this.copyText();
    });
  }
}

function statusLabel(status: AccountWithUnread['status']): string {
  if (status === 'ok') return '正常';
  if (status === 'auth_failed') return '授权失效';
  return '同步失败';
}

function validateAccountForm(email: string, alias: string, authCode: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '请输入完整的邮箱地址';
  if (alias.length > 12) return '备注名最多 12 个字符';
  if (!authCode) return '请输入授权码（不是登录密码）';
  return null;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const now = new Date();
  const pad = (input: number): string => String(input).padStart(2, '0');
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  if (date.toDateString() === now.toDateString()) return time;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${time}`;

  if (date.getFullYear() === now.getFullYear()) {
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fallbackCopyText(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

async function runSmoke(client: DeskMailClient): Promise<void> {
  const summaries = await client.list(null);
  const before = await client.accountsOverview();
  const unreadBefore = before.reduce((sum, account) => sum + account.unread, 0);

  const firstUnread = summaries.find((item) => !item.isRead);
  if (firstUnread) {
    await client.detail(firstUnread.id);
  }

  const after = await client.accountsOverview();
  const unreadAfter = after.reduce((sum, account) => sum + account.unread, 0);

  const distinctCount = new Set(
    summaries.map((item) => `${item.senderEmail}|${item.subject}`),
  ).size;
  const isolated = distinctCount === summaries.length;

  const report = {
    ok: summaries.length > 0 && isolated && unreadAfter === Math.max(0, unreadBefore - 1),
    count: summaries.length,
    unreadBefore,
    unreadAfter,
  };
  console.log('[deskmail] renderer report:', report);
  window.deskmail?.reportSmoke(report);
}

async function boot(): Promise<void> {
  const client = window.deskmail;
  if (!client) {
    console.error('[deskmail] preload API missing');
    return;
  }

  try {
    await client.syncAll();
  } catch (error) {
    console.error('[deskmail] sync failed:', error);
  }

  const ui = new MailCardUi(client);
  await ui.init();

  if (location.hash === '#smoke') {
    await runSmoke(client);
  }
}

void boot();
