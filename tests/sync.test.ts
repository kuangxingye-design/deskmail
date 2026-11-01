import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Account } from '../src/model/types';
import type { CredentialPlatform } from '../src/platform/types';
import type {
  HeaderBatch,
  ImapClient,
  ImapCredentials,
  ProviderConfig,
  RawMessage,
} from '../src/imap/types';
import { SqliteMailStore } from '../src/main/store/sqlite';
import { SyncEngineImpl } from '../src/main/sync/real';
import { createMessageParser } from '../src/main/content/real';
import { StubAccountService } from '../src/accounts/stub';

class FakeCredentials implements CredentialPlatform {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

interface FakeMessage {
  header: HeaderBatch;
  raw: RawMessage;
}

class FakeImap implements ImapClient {
  constructor(
    public messages: FakeMessage[],
    public uidValidity = 1,
    private readonly failConnect = false,
  ) {}

  async connect(_cfg: ProviderConfig, _credentials: ImapCredentials): Promise<void> {
    if (this.failConnect) throw new Error('授权失败');
  }

  async fetchHeaders(uidFrom: number, limit: number): Promise<HeaderBatch[]> {
    return this.headers().filter((header) => header.imapUid >= uidFrom).slice(0, limit);
  }

  async fetchHeadersBefore(uidBefore: number, limit: number): Promise<HeaderBatch[]> {
    return this.headers().filter((header) => header.imapUid < uidBefore).slice(0, limit);
  }

  async listUids(): Promise<number[]> {
    return this.messages.map((message) => message.header.imapUid);
  }

  async fetchMessage(uid: number): Promise<RawMessage> {
    const message = this.messages.find((item) => item.header.imapUid === uid);
    if (!message) throw new Error(`no message ${uid}`);
    return message.raw;
  }

  async markSeen(): Promise<void> {}

  async getUidValidity(): Promise<number | undefined> {
    return this.uidValidity;
  }

  async close(): Promise<void> {}

  private headers(): HeaderBatch[] {
    return this.messages
      .map((message) => message.header)
      .sort((a, b) => b.imapUid - a.imapUid);
  }
}

function makeAccount(id: string): Account {
  return {
    id,
    provider: 'qq',
    email: `${id}@qq.com`,
    alias: id,
    color: '#5aa9ff',
    status: 'ok',
    createdAt: '2026-10-01T00:00:00.000Z',
  };
}

function fakeMessage(
  uid: number,
  subject: string,
  body: string,
  isRead = false,
): FakeMessage {
  const header: HeaderBatch = {
    imapUid: uid,
    messageId: `<${uid}@example.com>`,
    senderName: `Sender ${uid}`,
    senderEmail: `sender${uid}@example.com`,
    subject,
    receivedAt: new Date(Date.UTC(2026, 9, 31, 10, uid % 60)).toISOString(),
    isRead,
  };
  const source = [
    `From: Sender <sender${uid}@example.com>`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
    '',
  ].join('\r\n');
  return {
    header,
    raw: {
      imapUid: uid,
      messageId: header.messageId,
      raw: new TextEncoder().encode(source),
    },
  };
}

async function setup(
  accounts: Account[],
  createImap: (accountId: string) => ImapClient,
) {
  const store = new SqliteMailStore(':memory:');
  const credentials = new FakeCredentials();
  for (const account of accounts) {
    store.insertAccount(account, account.email.toLowerCase());
    await credentials.set(account.id, 'good');
  }

  let updates = 0;
  const sync = new SyncEngineImpl(
    createImap,
    createMessageParser(),
    store,
    new StubAccountService(accounts),
    store,
    credentials,
    () => {
      updates += 1;
    },
  );

  return { store, sync, credentials, updates: () => updates };
}

test('初始同步：头先落库、正文解析、状态与账号更新', async () => {
  const account = makeAccount('acc-1');
  const fake = new FakeImap([
    fakeMessage(101, 'One', 'Body one'),
    fakeMessage(102, 'Two', 'Body two'),
  ]);
  const { store, sync, updates } = await setup([account], () => fake);

  const result = await sync.syncAccount(account.id);
  assert.equal(result.status, 'ok');

  const list = store.query({ accountId: account.id });
  assert.equal(list.length, 2);
  assert.equal(list[0].imapUid, 102);
  assert.match(list[0].bodyText, /Body two/);

  const state = store.getSyncState(account.id);
  assert.equal(state?.lastUid, 102);
  assert.equal(state?.windowStartUid, 101);
  assert.equal(state?.uidValidity, 1);
  assert.equal(store.getAccount(account.id)?.status, 'ok');
  assert.ok(updates() >= 2);

  store.close();
});

test('增量同步保留本地已读/重要性，且窗口起点不被抬高', async () => {
  const account = makeAccount('acc-1');
  const fake = new FakeImap([fakeMessage(101, 'One', 'Body one')]);
  const { store, sync } = await setup([account], () => fake);

  await sync.syncAccount(account.id);
  const id = `${account.id}:101`;
  store.markRead(id);
  store.setImportance(id, 'important');

  fake.messages.push(fakeMessage(102, 'Two', 'Body two'));
  await sync.syncAccount(account.id);

  const first = store.getMessage(id);
  assert.equal(first?.isRead, true);
  assert.equal(first?.importance, 'important');
  assert.equal(store.query({ accountId: account.id }).length, 2);

  const state = store.getSyncState(account.id);
  assert.equal(state?.lastUid, 102);
  assert.equal(state?.windowStartUid, 101);

  store.close();
});

test('UIDVALIDITY 变化：清空该账号本地数据后重取', async () => {
  const account = makeAccount('acc-1');
  let current = new FakeImap([fakeMessage(101, 'One', 'Body one')], 1);
  const { store, sync } = await setup([account], () => current);

  await sync.syncAccount(account.id);
  current = new FakeImap([fakeMessage(201, 'New', 'New body')], 2);
  await sync.syncAccount(account.id);

  const list = store.query({ accountId: account.id });
  assert.equal(list.length, 1);
  assert.equal(list[0].imapUid, 201);

  const state = store.getSyncState(account.id);
  assert.equal(state?.uidValidity, 2);
  assert.equal(state?.lastUid, 201);
  assert.equal(state?.windowStartUid, 201);

  store.close();
});

test('服务器删除的邮件本地移除', async () => {
  const account = makeAccount('acc-1');
  const fake = new FakeImap([
    fakeMessage(101, 'One', 'Body one'),
    fakeMessage(102, 'Two', 'Body two'),
  ]);
  const { store, sync } = await setup([account], () => fake);

  await sync.syncAccount(account.id);
  fake.messages = [fakeMessage(102, 'Two', 'Body two')];
  await sync.syncAccount(account.id);

  assert.equal(store.getMessage(`${account.id}:101`), undefined);
  assert.ok(store.getMessage(`${account.id}:102`));

  store.close();
});

test('loadOlder 向前翻页并更新 windowStartUid', async () => {
  const account = makeAccount('acc-1');
  const fake = new FakeImap([
    fakeMessage(105, 'Five', 'Body five'),
    fakeMessage(106, 'Six', 'Body six'),
  ]);
  const { store, sync } = await setup([account], () => fake);

  await sync.syncAccount(account.id);
  assert.equal(store.getSyncState(account.id)?.windowStartUid, 105);

  fake.messages.push(fakeMessage(103, 'Three', 'Body three'), fakeMessage(104, 'Four', 'Body four'));
  await sync.loadOlder(account.id);

  assert.equal(store.query({ accountId: account.id }).length, 4);
  assert.equal(store.getSyncState(account.id)?.windowStartUid, 103);

  store.close();
});

test('缺少凭据：账号标记 auth_failed，不建连接', async () => {
  const account = makeAccount('acc-1');
  const fake = new FakeImap([fakeMessage(101, 'One', 'Body one')]);
  const { store, credentials, sync } = await setup([account], () => fake);

  await credentials.delete(account.id);
  const result = await sync.syncAccount(account.id);

  assert.equal(result.status, 'failed');
  assert.equal(store.getAccount(account.id)?.status, 'auth_failed');
  assert.equal(store.query({ accountId: account.id }).length, 0);

  store.close();
});

test('单账号连接失败不阻塞其他账号', async () => {
  const goodAccount = makeAccount('acc-1');
  const badAccount = makeAccount('acc-2');
  const good = new FakeImap([fakeMessage(101, 'One', 'Body one')]);
  const bad = new FakeImap([], 1, true);
  const { store, sync } = await setup(
    [goodAccount, badAccount],
    (accountId) => (accountId === goodAccount.id ? good : bad),
  );

  const summary = await sync.syncAll();
  const statuses = Object.fromEntries(
    summary.accounts.map((result) => [result.accountId, result.status]),
  );

  assert.equal(statuses[goodAccount.id], 'ok');
  assert.equal(statuses[badAccount.id], 'failed');
  assert.equal(store.query({ accountId: goodAccount.id }).length, 1);
  assert.equal(store.getAccount(goodAccount.id)?.status, 'ok');
  assert.equal(store.getAccount(badAccount.id)?.status, 'sync_error');

  store.close();
});
