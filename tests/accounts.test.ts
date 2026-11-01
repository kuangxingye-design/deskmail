import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CredentialPlatform } from '../src/platform/types';
import type {
  HeaderBatch,
  ImapClient,
  ImapCredentials,
  ProviderConfig,
  RawMessage,
} from '../src/imap/types';
import type { Message } from '../src/model/types';
import { SqliteMailStore } from '../src/main/store/sqlite';
import { AccountServiceImpl } from '../src/main/accounts/real';

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

  size(): number {
    return this.values.size;
  }
}

class FakeImap implements ImapClient {
  async connect(_cfg: ProviderConfig, credentials: ImapCredentials): Promise<void> {
    if (credentials.password !== 'good' && credentials.password !== 'good2') {
      throw new Error('授权码错误');
    }
  }

  async fetchHeaders(): Promise<HeaderBatch[]> {
    return [];
  }

  async fetchHeadersBefore(): Promise<HeaderBatch[]> {
    return [];
  }

  async listUids(): Promise<number[]> {
    return [];
  }

  async fetchMessage(): Promise<RawMessage> {
    throw new Error('not used');
  }

  async markSeen(): Promise<void> {}

  async getUidValidity(): Promise<number | undefined> {
    return 1;
  }

  async close(): Promise<void> {}
}

function makeService(store: SqliteMailStore, credentials = new FakeCredentials()) {
  return {
    service: new AccountServiceImpl(store, store, credentials, () => new FakeImap()),
    credentials,
  };
}

function message(accountId: string): Message {
  return {
    id: `${accountId}:1`,
    accountId,
    imapUid: 1,
    messageId: '<m1@example.com>',
    senderName: 'Sender',
    senderEmail: 'sender@example.com',
    subject: 'Subject',
    receivedAt: '2026-11-01T00:00:00.000Z',
    isRead: false,
    importance: 'normal',
    bodyText: 'body',
    inlineImageIds: ['img1'],
  };
}

test('add: email 规范化、默认备注名、连接测试、凭据入库', async () => {
  const store = new SqliteMailStore(':memory:');
  const { service, credentials } = makeService(store);

  const account = await service.add({
    provider: 'qq',
    email: 'User@QQ.com',
    alias: '',
    authCode: 'good',
  });

  assert.equal(account.email, 'User@QQ.com');
  assert.equal(account.alias, 'User');
  assert.equal(account.status, 'ok');
  assert.equal(store.findAccountByEmail('user@qq.com')?.id, account.id);
  assert.equal(await credentials.get(account.id), 'good');

  store.close();
});

test('add: 重复邮箱阻止，连接失败不落账号/凭据', async () => {
  const store = new SqliteMailStore(':memory:');
  const { service, credentials } = makeService(store);

  await service.add({ provider: 'qq', email: 'user@qq.com', authCode: 'good' });
  await assert.rejects(
    () => service.add({ provider: 'qq', email: 'USER@qq.com', authCode: 'good' }),
    /已添加/,
  );
  assert.equal(store.listAccounts().length, 1);

  await assert.rejects(
    () => service.add({ provider: 'qq', email: 'bad@qq.com', authCode: 'bad' }),
    /授权码错误/,
  );
  assert.equal(store.listAccounts().length, 1);
  assert.equal(credentials.size(), 1);

  store.close();
});

test('reauthorize: 失败保留旧凭据并标记 auth_failed，成功更新凭据与状态', async () => {
  const store = new SqliteMailStore(':memory:');
  const { service, credentials } = makeService(store);
  const account = await service.add({
    provider: 'qq',
    email: 'user@qq.com',
    authCode: 'good',
  });

  const failed = await service.reauthorize(account.id, 'bad');
  assert.equal(failed.ok, false);
  assert.equal(store.getAccount(account.id)?.status, 'auth_failed');
  assert.equal(await credentials.get(account.id), 'good');

  const ok = await service.reauthorize(account.id, 'good2');
  assert.deepEqual(ok, { ok: true });
  assert.equal(await credentials.get(account.id), 'good2');
  assert.equal(store.getAccount(account.id)?.status, 'ok');

  store.close();
});

test('update: 备注名与颜色写回', async () => {
  const store = new SqliteMailStore(':memory:');
  const { service } = makeService(store);
  const account = await service.add({
    provider: 'qq',
    email: 'user@qq.com',
    authCode: 'good',
  });

  const updated = await service.update(account.id, { alias: '工作', color: '#000000' });
  assert.equal(updated.alias, '工作');
  assert.equal(store.getAccount(account.id)?.color, '#000000');

  store.close();
});

test('remove: 删除账号、凭据、消息与内嵌图片', async () => {
  const store = new SqliteMailStore(':memory:');
  const { service, credentials } = makeService(store);
  const account = await service.add({
    provider: 'qq',
    email: 'user@qq.com',
    authCode: 'good',
  });

  store.upsertMessages([message(account.id)]);
  store.saveInlineImage({
    id: 'img1',
    messageId: `${account.id}:1`,
    contentType: 'image/png',
    size: 1,
    data: new Uint8Array([1]),
  });

  await service.remove(account.id);

  assert.equal(store.getAccount(account.id), undefined);
  assert.equal(await credentials.get(account.id), null);
  assert.equal(store.getMessage(`${account.id}:1`), undefined);
  assert.equal(store.getInlineImage('img1'), undefined);

  store.close();
});

test('账号持久化：关闭重开仍可读回', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'deskmail-accounts-'));
  const file = join(dir, 'mail.db');

  const first = new SqliteMailStore(file);
  const firstService = makeService(first).service;
  const account = await firstService.add({
    provider: 'netease126',
    email: 'user@126.com',
    authCode: 'good',
  });
  first.close();

  const second = new SqliteMailStore(file);
  const secondService = makeService(second).service;
  const loaded = secondService.list();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, account.id);
  assert.equal(loaded[0].email, 'user@126.com');
  second.close();

  rmSync(dir, { recursive: true, force: true });
});
