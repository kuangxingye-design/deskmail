/**
 * 主进程 PlatformServices 生产组合（#17）：
 * - 凭据：safeStorage/DPAPI 真实实现
 * - 窗口 / 热键 / 剪贴板：暂用桌面壳任务前的占位实现
 */
import type {
  ClipboardPlatform,
  CredentialPlatform,
  GlobalShortcutPlatform,
  PlatformServices,
  WindowPlatform,
} from '../../platform/types';
import {
  StubClipboardPlatform,
  StubGlobalShortcutPlatform,
  StubWindowPlatform,
} from './main-stub';
import { SafeStorageCredentialPlatform } from './safe-storage-credentials';

export class MainPlatformServices implements PlatformServices {
  readonly window: WindowPlatform = new StubWindowPlatform();
  readonly globalShortcut: GlobalShortcutPlatform = new StubGlobalShortcutPlatform();
  readonly clipboard: ClipboardPlatform = new StubClipboardPlatform();
  readonly credentials: CredentialPlatform = new SafeStorageCredentialPlatform();
}
