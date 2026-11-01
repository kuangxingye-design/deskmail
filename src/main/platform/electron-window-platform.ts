/**
 * Electron 窗口平台实现（#21）：置顶 / 位置 / 显隐 / 磨砂 / 焦点。
 */
import type { BrowserWindow } from 'electron';
import type { BackgroundEffect, WindowPlatform } from '../../platform/types';

export class ElectronWindowPlatform implements WindowPlatform {
  constructor(private readonly win: BrowserWindow) {}

  setAlwaysOnTop(value: boolean): void {
    this.win.setAlwaysOnTop(value, value ? 'floating' : 'normal');
  }

  setPosition(x: number, y: number): void {
    this.win.setPosition(Math.round(x), Math.round(y));
  }

  getPosition(): { x: number; y: number } {
    const [x, y] = this.win.getPosition();
    return { x, y };
  }

  setVisible(visible: boolean): void {
    if (visible) {
      this.win.show();
      this.win.focus();
    } else {
      this.win.hide();
    }
  }

  setBackgroundEffect(effect: BackgroundEffect): void {
    try {
      this.win.setBackgroundMaterial(effect === 'acrylic' ? 'acrylic' : 'none');
    } catch {
      // Win10 / 非 Win11 22H2+ 降级为 CSS 半透明
    }
  }

  onFocusChange(callback: (focused: boolean) => void): void {
    this.win.on('focus', () => callback(true));
    this.win.on('blur', () => callback(false));
  }
}
