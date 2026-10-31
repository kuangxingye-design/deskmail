/**
 * BrowserStubPlatformServices（浏览器降级桩）。
 * 骨架期在渲染进程内使用：窗口/热键为无操作，剪贴板走 navigator.clipboard，
 * 凭据拒绝任何读写（不落任何数据）。真实平台实现：#9/#10/#11。
 */
import type {
  BackgroundEffect,
  ClipboardPlatform,
  CredentialPlatform,
  GlobalShortcutPlatform,
  PlatformServices,
  WindowPlatform,
} from './types';

class StubWindowPlatform implements WindowPlatform {
  private x = 0;
  private y = 0;

  setAlwaysOnTop(_value: boolean): void {
    // 桩：真实置顶实现见 #10
  }

  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  getPosition(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  setVisible(_visible: boolean): void {
    // 桩：真实显示/隐藏见 #10
  }

  setBackgroundEffect(_effect: BackgroundEffect): void {
    // 桩：真实磨砂效果见 #10
  }

  onFocusChange(_cb: (focused: boolean) => void): void {
    // 桩：真实焦点感知见 #10
  }
}

class StubGlobalShortcutPlatform implements GlobalShortcutPlatform {
  register(accel: string, _callback: () => void): boolean {
    // 桩：浏览器环境无法注册系统级热键，仅记录 accel（D2 = Alt+`）
    console.info(`[deskmail] globalShortcut stub registered: ${accel}`);
    return true;
  }
}

class StubClipboardPlatform implements ClipboardPlatform {
  async writeText(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
  }

  async writeImagePng(_bytes: Uint8Array): Promise<void> {
    throw new Error('clipboard.writeImagePng 未实现（#11）');
  }
}

class StubCredentialPlatform implements CredentialPlatform {
  async get(key: string): Promise<string | null> {
    console.warn(`[deskmail] credentials stub: get(${key}) 未实现（#9），返回 null`);
    return null;
  }

  async set(key: string, _value: string): Promise<void> {
    throw new Error(`credentials stub: set(${key}) 未实现（#9）`);
  }

  async delete(key: string): Promise<void> {
    throw new Error(`credentials stub: delete(${key}) 未实现（#9）`);
  }
}

export class BrowserStubPlatformServices implements PlatformServices {
  readonly window: WindowPlatform = new StubWindowPlatform();
  readonly globalShortcut: GlobalShortcutPlatform = new StubGlobalShortcutPlatform();
  readonly clipboard: ClipboardPlatform = new StubClipboardPlatform();
  readonly credentials: CredentialPlatform = new StubCredentialPlatform();
}
