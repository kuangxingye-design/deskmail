/**
 * Electron 全局快捷键平台实现（#21）。
 */
import { globalShortcut } from 'electron';
import type { GlobalShortcutPlatform } from '../../platform/types';

export class ElectronGlobalShortcutPlatform implements GlobalShortcutPlatform {
  register(accel: string, callback: () => void): boolean {
    try {
      return globalShortcut.register(accel, callback);
    } catch {
      return false;
    }
  }
}
