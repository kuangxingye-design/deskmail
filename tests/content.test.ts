import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compose } from '../src/app/compose';
import { BrowserStubPlatformServices } from '../src/platform/browser-stub';
import { createMessageParser, MAX_BODY_BYTES } from '../src/main/content/real';

const parser = createMessageParser();

function raw(source: string): { imapUid: number; raw: Uint8Array } {
  return { imapUid: 1, raw: new TextEncoder().encode(source) };
}

test('解析 multipart/alternative + 净化攻击载荷 + cid 内嵌图', async () => {
  const source = [
    'From: Test <test@example.com>',
    'To: you@example.com',
    'Subject: Test',
    'MIME-Version: 1.0',
    'Content-Type: multipart/related; boundary="rel"',
    '',
    '--rel',
    'Content-Type: multipart/alternative; boundary="alt"',
    '',
    '--alt',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Hello plain text',
    '--alt',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<p>Hello <strong>HTML</strong></p>',
    '<script>alert(1)</script>',
    '<p style="background-image:url(https://evil.example/x)">styled</p>',
    '<img src="https://evil.example/pixel.png" onerror="alert(2)">',
    '<img src="cid:logo1">',
    '<iframe src="https://evil.example"></iframe>',
    '--alt--',
    '--rel',
    'Content-Type: image/png',
    'Content-ID: <logo1>',
    'Content-Transfer-Encoding: base64',
    '',
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nJ8AAAAASUVORK5CYII=',
    '--rel--',
    '',
  ].join('\r\n');

  const result = await parser.parse(raw(source));

  assert.match(result.bodyText, /Hello plain text/);
  assert.ok(result.bodyHtml);
  assert.match(result.bodyHtml ?? '', /Hello <strong>HTML<\/strong>/);
  assert.doesNotMatch(result.bodyHtml ?? '', /<script/i);
  assert.doesNotMatch(result.bodyHtml ?? '', /alert\(/i);
  assert.doesNotMatch(result.bodyHtml ?? '', /onerror/i);
  assert.doesNotMatch(result.bodyHtml ?? '', /<iframe/i);
  assert.doesNotMatch(result.bodyHtml ?? '', /https:\/\/evil\.example/i);
  assert.doesNotMatch(result.bodyHtml ?? '', /url\(/i);
  assert.match(result.bodyHtml ?? '', /data:image\/png;base64,/);

  assert.equal(result.inlineImages.length, 1);
  const image = result.inlineImages[0];
  assert.equal(image.cid, 'logo1');
  assert.equal(image.contentType, 'image/png');
  assert.ok(image.data.byteLength > 0);
});

test('仅 HTML 正文时提取纯文本，并保留白名单标签', async () => {
  const source = [
    'From: Test <test@example.com>',
    'Subject: HTML only',
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<p>Hello <b>world</b></p><script>alert("x")</script>',
    '',
  ].join('\r\n');

  const result = await parser.parse(raw(source));

  assert.match(result.bodyText, /Hello/);
  assert.doesNotMatch(result.bodyText, /alert/);
  assert.match(result.bodyHtml ?? '', /<b>world<\/b>/);
});

test('单封正文超过 2MB 时截断', async () => {
  const source = [
    'From: Test <test@example.com>',
    'Subject: Large',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'A'.repeat(MAX_BODY_BYTES + 2048),
    '',
  ].join('\r\n');

  const result = await parser.parse(raw(source));
  assert.ok(result.bodyText.length <= MAX_BODY_BYTES);
});

test('远程图片被移除，不产生内嵌图', async () => {
  const source = [
    'From: Test <test@example.com>',
    'Subject: Remote image',
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<p>tracker</p><img src="https://tracker.example/pixel.png">',
    '',
  ].join('\r\n');

  const result = await parser.parse(raw(source));
  assert.doesNotMatch(result.bodyHtml ?? '', /https:\/\/tracker\.example/i);
  assert.equal(result.inlineImages.length, 0);
});

test('组合根可注入真实 parser 并完成 mock 同步', async () => {
  const app = compose(new BrowserStubPlatformServices(), { parser: createMessageParser() });
  const summary = await app.sync.syncAll();

  assert.equal(summary.accounts.length, 5);
  assert.ok(summary.accounts.every((account) => account.status === 'ok'));

  const list = app.inbox.list(null);
  assert.equal(list.length, 8);

  const detail = app.inbox.detail(list[0].id);
  assert.ok(detail);
  assert.ok(detail.bodyText.length > 0);
  assert.ok(detail.bodyText.includes('腾讯云') || detail.bodyText.includes('482913'));
});
