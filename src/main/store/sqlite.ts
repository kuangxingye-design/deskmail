/**
 * SQLite MailStore（#9）：实现 src/store/types.ts 的 MailStore 接口。
 *
 * Node-only：renderer 仍用 InMemoryMailStore；组合根通过 ComposeOptions.store 注入本实现。
 * 选型 node:sqlite：Node / Electron 内置，无原生模块与 ABI 重建；测试需 `--experimental-sqlite`。
 * 迁移策略：PRAGMA user_version 从 0 → 1 建 v1 schema；后续版本在此追加，不引入迁移框架。
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Account, AccountStatus, Importance, InlineImage, Message, Provider, SyncState } from '../../model/types';
import type { MailStore, MailStoreQuery } from '../../store/types';
import type { AccountRepository } from '../../accounts/repository';

const SCHEMA_VERSION = 1;

const SCHEMA_V1 = `
-- accounts 表预置给账号管理任务使用；本任务不实现 Account CRUD。
-- email_normalized 为小写规范化值，唯一约束作为去重依据。
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  alias TEXT NOT NULL,
  color TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_sync_at TEXT,
  last_sync_error TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  imap_uid INTEGER NOT NULL,
  message_id TEXT,
  sender_name TEXT,
  sender_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  received_at TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  importance TEXT NOT NULL DEFAULT 'normal',
  body_text TEXT NOT NULL DEFAULT '',
  body_html TEXT,
  inline_image_ids TEXT NOT NULL DEFAULT '[]',
  UNIQUE(account_id, imap_uid)
);
CREATE INDEX IF NOT EXISTS idx_messages_account_received ON messages(account_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_received ON messages(received_at DESC);

CREATE TABLE IF NOT EXISTS inline_images (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  cid TEXT,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inline_images_message ON inline_images(message_id);

CREATE TABLE IF NOT EXISTS sync_state (
  account_id TEXT PRIMARY KEY,
  last_sync_at TEXT,
  last_uid INTEGER NOT NULL DEFAULT 0,
  uid_validity INTEGER,
  window_start_uid INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  last_error TEXT
);
`;

interface MessageRow {
  id: string;
  account_id: string;
  imap_uid: number;
  message_id: string | null;
  sender_name: string | null;
  sender_email: string;
  subject: string;
  received_at: string;
  is_read: number;
  importance: string;
  body_text: string;
  body_html: string | null;
  inline_image_ids: string;
}

interface InlineImageRow {
  id: string;
  message_id: string;
  cid: string | null;
  content_type: string;
  size: number;
  data: Uint8Array;
}

interface SyncStateRow {
  account_id: string;
  last_sync_at: string | null;
  last_uid: number;
  uid_validity: number | null;
  window_start_uid: number;
  status: string;
  last_error: string | null;
}

interface AccountRow {
  id: string;
  provider: string;
  email: string;
  email_normalized: string;
  alias: string;
  color: string;
  status: string;
  created_at: string;
  last_sync_at: string | null;
  last_sync_error: string | null;
}

type BindValue = string | number | null | Uint8Array;

export class SqliteMailStore implements MailStore, AccountRepository {
  private readonly db: DatabaseSync;

  constructor(filename: string) {
    if (filename !== ':memory:') {
      mkdirSync(dirname(filename), { recursive: true });
    }
    this.db = new DatabaseSync(filename);
    this.db.prepare('PRAGMA journal_mode = WAL').get();
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  upsertMessages(messages: Message[]): void {
    const statement = this.db.prepare(`
      INSERT INTO messages (
        id, account_id, imap_uid, message_id, sender_name, sender_email,
        subject, received_at, is_read, importance, body_text, body_html, inline_image_ids
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        account_id = excluded.account_id,
        imap_uid = excluded.imap_uid,
        message_id = excluded.message_id,
        sender_name = excluded.sender_name,
        sender_email = excluded.sender_email,
        subject = excluded.subject,
        received_at = excluded.received_at,
        is_read = excluded.is_read,
        importance = excluded.importance,
        body_text = excluded.body_text,
        body_html = excluded.body_html,
        inline_image_ids = excluded.inline_image_ids
    `);

    this.transaction(() => {
      for (const message of messages) {
        statement.run(
          message.id,
          message.accountId,
          message.imapUid,
          message.messageId ?? null,
          message.senderName ?? null,
          message.senderEmail,
          message.subject,
          normalizeReceivedAt(message.receivedAt),
          message.isRead ? 1 : 0,
          message.importance,
          message.bodyText,
          message.bodyHtml ?? null,
          JSON.stringify(message.inlineImageIds),
        );
      }
    });
  }

  query(q: MailStoreQuery): Message[] {
    const conditions: string[] = [];
    const params: BindValue[] = [];

    if (q.accountId !== undefined) {
      conditions.push('account_id = ?');
      params.push(q.accountId);
    }
    if (q.before !== undefined) {
      conditions.push('received_at < ?');
      params.push(q.before);
    }

    let sql = 'SELECT * FROM messages';
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ' ORDER BY received_at DESC';
    if (q.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(q.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as unknown as MessageRow[];
    return rows.map(rowToMessage);
  }

  getMessage(id: string): Message | undefined {
    const row = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as
      | MessageRow
      | undefined;
    return row ? rowToMessage(row) : undefined;
  }

  setImportance(id: string, level: Importance): void {
    this.db.prepare('UPDATE messages SET importance = ? WHERE id = ?').run(level, id);
  }

  markRead(id: string): void {
    this.db.prepare('UPDATE messages SET is_read = 1 WHERE id = ?').run(id);
  }

  unreadCount(accountId?: string): number {
    const row = accountId === undefined
      ? this.db.prepare('SELECT COUNT(*) AS count FROM messages WHERE is_read = 0').get()
      : this.db
        .prepare('SELECT COUNT(*) AS count FROM messages WHERE is_read = 0 AND account_id = ?')
        .get(accountId);
    return (row as { count: number } | undefined)?.count ?? 0;
  }

  getSyncState(accountId: string): SyncState | undefined {
    const row = this.db
      .prepare('SELECT * FROM sync_state WHERE account_id = ?')
      .get(accountId) as SyncStateRow | undefined;
    if (!row) return undefined;
    return {
      accountId: row.account_id,
      lastSyncAt: row.last_sync_at ?? undefined,
      lastUid: row.last_uid,
      uidValidity: row.uid_validity ?? undefined,
      windowStartUid: row.window_start_uid,
      status: row.status === 'failed' ? 'failed' : 'ok',
      lastError: row.last_error ?? undefined,
    };
  }

  saveSyncState(state: SyncState): void {
    this.db.prepare(`
      INSERT INTO sync_state (
        account_id, last_sync_at, last_uid, uid_validity, window_start_uid, status, last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        last_sync_at = excluded.last_sync_at,
        last_uid = excluded.last_uid,
        uid_validity = excluded.uid_validity,
        window_start_uid = excluded.window_start_uid,
        status = excluded.status,
        last_error = excluded.last_error
    `).run(
      state.accountId,
      state.lastSyncAt ?? null,
      state.lastUid,
      state.uidValidity ?? null,
      state.windowStartUid,
      state.status,
      state.lastError ?? null,
    );
  }

  saveInlineImage(image: InlineImage): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO inline_images (id, message_id, cid, content_type, size, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      image.id,
      image.messageId,
      image.cid ?? null,
      image.contentType,
      image.size,
      image.data,
    );
  }

  getInlineImage(id: string): InlineImage | undefined {
    const row = this.db
      .prepare('SELECT * FROM inline_images WHERE id = ?')
      .get(id) as InlineImageRow | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      messageId: row.message_id,
      cid: row.cid ?? undefined,
      contentType: row.content_type,
      size: row.size,
      data: new Uint8Array(row.data),
    };
  }

  reconcileUids(accountId: string, serverUids: number[]): void {
    const server = new Set(serverUids);
    const rows = this.db
      .prepare('SELECT id, imap_uid FROM messages WHERE account_id = ?')
      .all(accountId) as unknown as Array<{ id: string; imap_uid: number }>;
    const stale = rows.filter((row) => !server.has(row.imap_uid));
    if (stale.length === 0) return;

    const deleteImages = this.db.prepare('DELETE FROM inline_images WHERE message_id = ?');
    const deleteMessage = this.db.prepare('DELETE FROM messages WHERE id = ?');
    this.transaction(() => {
      for (const row of stale) {
        deleteImages.run(row.id);
        deleteMessage.run(row.id);
      }
    });
  }

  listAccounts(): Account[] {
    const rows = this.db
      .prepare('SELECT * FROM accounts ORDER BY created_at ASC, id ASC')
      .all() as unknown as AccountRow[];
    return rows.map(rowToAccount);
  }

  getAccount(id: string): Account | undefined {
    const row = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as
      | AccountRow
      | undefined;
    return row ? rowToAccount(row) : undefined;
  }

  findAccountByEmail(emailNormalized: string): Account | undefined {
    const row = this.db
      .prepare('SELECT * FROM accounts WHERE email_normalized = ?')
      .get(emailNormalized) as AccountRow | undefined;
    return row ? rowToAccount(row) : undefined;
  }

  insertAccount(account: Account, emailNormalized: string): void {
    this.db.prepare(`
      INSERT INTO accounts (
        id, provider, email, email_normalized, alias, color, status,
        created_at, last_sync_at, last_sync_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      account.id,
      account.provider,
      account.email,
      emailNormalized,
      account.alias,
      account.color,
      account.status,
      account.createdAt,
      account.lastSyncAt ?? null,
      account.lastSyncError ?? null,
    );
  }

  updateAccount(
    id: string,
    patch: Partial<Pick<Account, 'alias' | 'color' | 'status' | 'lastSyncAt' | 'lastSyncError'>>,
  ): Account {
    const sets: string[] = [];
    const params: BindValue[] = [];

    if (patch.alias !== undefined) {
      sets.push('alias = ?');
      params.push(patch.alias);
    }
    if (patch.color !== undefined) {
      sets.push('color = ?');
      params.push(patch.color);
    }
    if (patch.status !== undefined) {
      sets.push('status = ?');
      params.push(patch.status);
    }
    if ('lastSyncAt' in patch) {
      sets.push('last_sync_at = ?');
      params.push(patch.lastSyncAt ?? null);
    }
    if ('lastSyncError' in patch) {
      sets.push('last_sync_error = ?');
      params.push(patch.lastSyncError ?? null);
    }

    if (sets.length > 0) {
      params.push(id);
      this.db.prepare(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    }

    const account = this.getAccount(id);
    if (!account) {
      throw new Error(`account not found: ${id}`);
    }
    return account;
  }

  removeAccount(id: string): void {
    this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  }

  private migrate(): void {
    const row = this.db.prepare('PRAGMA user_version').get() as
      | { user_version: number }
      | undefined;
    const version = row?.user_version ?? 0;
    if (version > SCHEMA_VERSION) {
      throw new Error(
        `database schema v${version} is newer than app v${SCHEMA_VERSION}`,
      );
    }
    if (version < SCHEMA_VERSION) {
      this.db.exec(SCHEMA_V1);
      this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    }
  }

  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    accountId: row.account_id,
    imapUid: row.imap_uid,
    messageId: row.message_id ?? undefined,
    senderName: row.sender_name ?? undefined,
    senderEmail: row.sender_email,
    subject: row.subject,
    receivedAt: row.received_at,
    isRead: row.is_read === 1,
    importance: row.importance as Importance,
    bodyText: row.body_text,
    bodyHtml: row.body_html ?? undefined,
    inlineImageIds: JSON.parse(row.inline_image_ids) as string[],
  };
}

function normalizeReceivedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function rowToAccount(row: AccountRow): Account {
  return {
    id: row.id,
    provider: row.provider as Provider,
    email: row.email,
    alias: row.alias,
    color: row.color,
    status: row.status as AccountStatus,
    createdAt: row.created_at,
    lastSyncAt: row.last_sync_at ?? undefined,
    lastSyncError: row.last_sync_error ?? undefined,
  };
}
