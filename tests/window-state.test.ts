import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clampWindowPosition, WindowStateStore } from '../src/main/window-state';

const bounds = { x: 0, y: 0, width: 1920, height: 1080 };

test('clampWindowPosition: 越界位置回到屏幕内，默认居中', () => {
  assert.deepEqual(clampWindowPosition({ x: -500, y: -500 }, 460, 640, bounds), { x: 0, y: 0 });
  assert.deepEqual(clampWindowPosition({ x: 5000, y: 5000 }, 460, 640, bounds), { x: 1460, y: 440 });
  assert.deepEqual(clampWindowPosition(undefined, 460, 640, bounds), { x: 730, y: 220 });
});

test('WindowStateStore: 保存/读取，坏文件返回 undefined', () => {
  const dir = mkdtempSync(join(tmpdir(), 'deskmail-window-'));
  const file = join(dir, 'window-state.json');
  const store = new WindowStateStore(file);

  assert.equal(store.load(), undefined);
  store.save({ x: 120, y: 80 });
  assert.deepEqual(store.load(), { x: 120, y: 80 });

  writeFileSync(file, '{not json', 'utf8');
  assert.equal(store.load(), undefined);

  rmSync(dir, { recursive: true, force: true });
});
