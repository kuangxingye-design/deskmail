/**
 * 主进程 PlatformServices 生产组合（#17/#21）：
 * - window / globalShortcut：桌面壳真实实现
 * - credentials：safeStorage/DPAPI
 * - clipboard：暂用占位实现（剪贴板 PNG 任务替换）
 */
import type {
  ClipboardPlatform,
  CredentialPlatform,
  GlobalShortcutPlatform,
  PlatformServices,
  WindowPlatform,
} from '../../platform/types';
import { StubClipboardPlatform } from './main-stub';
import { SafeStorageCredentialPlatform } from './safe-storage-credentials';

export interface MainPlatformOptions {
  window: WindowPlatform;
  globalShortcut: GlobalShortcutPlatform;
  clipboard?: ClipboardPlatform;
  credentials?: CredentialPlatform;
}

export class MainPlatformServices implements PlatformServices {
  readonly window: WindowPlatform;
  readonly globalShortcut: GlobalShortcutPlatform;
  readonly clipboard: ClipboardPlatform;
  readonly credentials: CredentialPlatform;

  constructor(options: MainPlatformOptions) {
    this.window = options.window;
    this.globalShortcut = options.globalShortcut;
    this.clipboard = options.clipboard ?? new StubClipboardPlatform();
    this.credentials = options.credentials ?? new SafeStorageCredentialPlatform();
  }
}
