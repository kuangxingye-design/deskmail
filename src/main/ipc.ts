/**
 * 主进程 IPC handlers（#15）。renderer 只通过这些 channel 访问 inbox / sync / accounts。
 */
import { ipcMain, net } from 'electron';
import type { App } from '../app/compose';
import type { AddAccountInput } from '../accounts/types';
import type { ListOptions } from '../inbox/types';
import type { Account, Importance } from '../model/types';
import { IPC_CHANNELS } from '../ipc/types';
import type { RemoteImageResult } from '../ipc/types';

const ALLOWED_REMOTE_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
]);
const MAX_REMOTE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_REMOTE_IMAGES = 50;

function isSafeRemoteImageUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

    const host = url.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '::1' ||
      host === '[::1]' ||
      host.endsWith('.local') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function registerIpcHandlers(desktop: App): void {
  ipcMain.handle(IPC_CHANNELS.syncAll, () => desktop.sync.syncAll());

  ipcMain.handle(
    IPC_CHANNELS.inboxList,
    (_event, filterAccountId: string | null, opts?: ListOptions) =>
      desktop.inbox.list(filterAccountId, opts),
  );

  ipcMain.handle(
    IPC_CHANNELS.inboxDetail,
    (_event, id: string) => desktop.inbox.detail(id),
  );

  ipcMain.handle(
    IPC_CHANNELS.inboxSetImportance,
    (_event, id: string, level: Importance) => {
      desktop.inbox.setImportance(id, level);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.accountsOverview,
    () => desktop.inbox.accountsOverview(),
  );

  ipcMain.handle(
    IPC_CHANNELS.accountsAdd,
    (_event, input: AddAccountInput) => desktop.accounts.add(input),
  );

  ipcMain.handle(
    IPC_CHANNELS.accountsUpdate,
    (_event, id: string, patch: Partial<Pick<Account, 'alias' | 'color'>>) =>
      desktop.accounts.update(id, patch),
  );

  ipcMain.handle(
    IPC_CHANNELS.accountsRemove,
    (_event, id: string) => desktop.accounts.remove(id),
  );

  ipcMain.handle(
    IPC_CHANNELS.accountsTestConnection,
    (_event, input: AddAccountInput) => desktop.accounts.testConnection(input),
  );

  ipcMain.handle(
    IPC_CHANNELS.accountsReauthorize,
    (_event, id: string, authCode: string) => desktop.accounts.reauthorize(id, authCode),
  );

  ipcMain.handle(IPC_CHANNELS.copyImage, async (_event, dataUrl: string) => {
    const match = /^data:image\/[^;]+;base64,(.+)$/i.exec(dataUrl);
    if (!match) {
      throw new Error('无效的图片数据');
    }
    const bytes = Buffer.from(match[1], 'base64');
    await desktop.platform.clipboard.writeImagePng(new Uint8Array(bytes));
  });

  ipcMain.handle(
    IPC_CHANNELS.loadRemoteImages,
    async (_event, urls: string[]): Promise<RemoteImageResult[]> => {
      const unique = Array.from(
        new Set(Array.isArray(urls) ? urls.filter((url) => typeof url === 'string') : []),
      )
        .filter(isSafeRemoteImageUrl)
        .slice(0, MAX_REMOTE_IMAGES);

      const results: RemoteImageResult[] = [];
      for (const url of unique) {
        try {
          const response = await net.fetch(url, {
            signal: AbortSignal.timeout(10_000),
          });
          if (!response.ok) continue;

          const contentType = (response.headers.get('content-type') ?? '')
            .split(';')[0]
            .trim()
            .toLowerCase();
          if (!ALLOWED_REMOTE_IMAGE_TYPES.has(contentType)) continue;

          const buffer = Buffer.from(await response.arrayBuffer());
          if (buffer.byteLength === 0 || buffer.byteLength > MAX_REMOTE_IMAGE_BYTES) {
            continue;
          }

          results.push({
            url,
            dataUrl: `data:${contentType};base64,${buffer.toString('base64')}`,
          });
        } catch {
          // 单张失败跳过，不影响其他图片
        }
      }
      return results;
    },
  );
}
