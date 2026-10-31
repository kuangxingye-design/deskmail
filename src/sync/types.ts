/**
 * 同步引擎模块接口（真实定义）。
 * 桩实现：StubSyncEngine。真实实现：#8（两阶段同步、增量、翻页、调度）。
 */

/** 每账号最近 N 封窗口（Proposal #1 决策：每账号最近 200 封 + 滚动加载更早） */
export const RECENT_WINDOW = 200;

export interface SyncResult {
  accountId: string;
  status: 'ok' | 'failed';
  fetched: number;
  error?: string;
}

export interface SyncSummary {
  startedAt: string;
  accounts: SyncResult[];
}

export interface SyncEngine {
  /** 单账号同步：失败只影响该账号（R7） */
  syncAccount(accountId: string): Promise<SyncResult>;
  syncAll(): Promise<SyncSummary>;
  /** 滚动加载更早：向前翻一页（#8 实现） */
  loadOlder(accountId: string): Promise<void>;
  /** 后台定时调度（#8 实现；v0.1 不做 IMAP IDLE） */
  startScheduler(): void;
}
