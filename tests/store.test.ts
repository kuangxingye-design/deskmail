import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Message, SyncState } from '../src/model/types';
import { compose } from '../src/app/compose';
import { BrowserStubPlatformServices } from '../src/platform/browser-stub';
import { SqliteMailStore } from '../src/main/store/sqlite';

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    accountId: 'qq-main',
    imapUid: 1,
    messageId: '<m1@example.com>',
    senderName: 'Sender',
    senderEmail: 'sender@example.com',
    subject: 'Subject',
    receivedAt: '2026-10-31T10:00:00.000Z',
    isRead: false,
    importance: 'normal',
    bodyText: 'body',
    inlineImageIds: [],
    ...overrides,
  };
}

test('query: 账号过滤 / 时间倒序 / before 游标 / limit', () => {
  const store = new SqliteMailStore(':memory:');
  store.upsertMessages([
    message({ id: 'm1', imapUid: 1, receivedAt: '2026-10-31T10:00:00.000Z' }),
    message({ id: 'm2', imapUid: 2, receivedAt: '2026-10-31T11:00:00.000Z' }),
    message({ id: 'm3', accountId: '163-work', imapUid: 3, receivedAt: '2026-10-31T12:00:00.000Z' }),
  ]);

  assert.deepEqual(
    store.query({ accountId: 'qq-main' }).map((item) => item.id),
    ['m2', 'm1'],
  );
  assert.deepEqual(
    store.query({ accountId: 'qq-main', before: '2026-10-31T10:30:00.000Z' }).map((item) => item.id),
    ['m1'],
  );
  assert.deepEqual(
    store.query({ limit: 1 }).map((item) => item.id),
    ['m3'],
  );

  store.close();
});

test('未读计数 / 已读 / 重要性更新', () => {
  const store = new SqliteMailStore(':memory:');
  store.upsertMessages([
    message({ id: 'm1', imapUid: 1 }),
    message({ id: 'm2', imapUid: 2 }),
    message({ id: 'm3', accountId: '163-work', imapUid: 3 }),
  ]);

  assert.equal(store.unreadCount(), 3);
  assert.equal(store.unreadCount('qq-main'), 2);

  store.markRead('m1');
  assert.equal(store.unreadCount(), 2);
  assert.equal(store.unreadCount('qq-main'), 1);

  store.setImportance('m2', 'important');
  assert.equal(store.getMessage('m2')?.importance, 'important');

  store.close();
});

test('内嵌图片保存/读取，reconcileUids 联删邮件与图片', () => {
  const store = new SqliteMailStore(':memory:');
  store.upsertMessages([
    message({ id: 'm1', imapUid: 1 }),
    message({ id: 'm2', imapUid: 2 }),
  ]);
  store.saveInlineImage({
    id: 'img1',
    messageId: 'm1',
    cid: 'logo1',
    contentType: 'image/png',
    size: 3,
    data: new Uint8Array([1, 2, 3]),
  });

  const image = store.getInlineImage('img1');
  assert.equal(image?.cid, 'logo1');
  assert.equal(image?.contentType, 'image/png');
  assert.deepEqual([...(image?.data ?? [])], [1, 2, 3]);

  store.reconcileUids('qq-main', [2]);
  assert.equal(store.getMessage('m1'), undefined);
  assert.equal(store.getInlineImage('img1'), undefined);
  assert.equal(store.getMessage('m2')?.id, 'm2');

  store.close();
});

test('同步状态保存/读取', () => {
  const store = new SqliteMailStore(':memory:');
  const state: SyncState = {
    accountId: 'qq-main',
    lastSyncAt: '2026-10-31T12:00:00.000Z',
    lastUid: 108,
    uidValidity: 12345,
    windowStartUid: 100,
    status: 'ok',
  };
  store.saveSyncState(state);

  const loaded = store.getSyncState('qq-main');
  assert.equal(loaded?.lastUid, 108);
  assert.equal(loaded?.uidValidity, 12345);
  assert.equal(loaded?.windowStartUid, 100);
  assert.equal(loaded?.status, 'ok');
  assert.equal(loaded?.lastSyncAt, state.lastSyncAt);

  store.close();
});

test('重启后数据保留（文件数据库）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'deskmail-store-'));
  const file = join(dir, 'mail.db');

  const first = new SqliteMailStore(file);
  first.upsertMessages([message({ id: 'persisted', imapUid: 42, subject: 'Persisted' })]);
  first.close();

  const second = new SqliteMailStore(file);
  assert.equal(second.getMessage('persisted')?.subject, 'Persisted');
  second.close();

  rmSync(dir, { recursive: true, force: true });
});

test('组合根可注入 SQLite store 并完成 mock 同步', async () => {
  const store = new SqliteMailStore(':memory:');
  const app = compose(new BrowserStubPlatformServices(), { store });
  const summary = await app.sync.syncAll();

  assert.equal(summary.accounts.length, 5);
  assert.ok(summary.accounts.every((account) => account.status === 'ok'));
  assert.equal(app.inbox.list(null).length, 8);

  store.close();
});
