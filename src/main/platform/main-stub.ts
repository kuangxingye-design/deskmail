/**
 * 主进程 PlatformServices 占位实现（#15）。
 * 真实窗口/热键/剪贴板/凭据分别由桌面壳、剪贴板、账号管理任务接入。
 */
import type {
  BackgroundEffect,
  ClipboardPlatform,
  CredentialPlatform,
  GlobalShortcutPlatform,
  PlatformServices,
  WindowPlatform,
} from '../../platform/types';

class StubWindowPlatform implements WindowPlatform {
  setAlwaysOnTop(_value: boolean): void {}
  setPosition(_x: number, _y: number): void {}
  getPosition(): { x: number; y: number } {
    return { x: 0, y: 0 };
  }
  setVisible(_visible: boolean): void {}
  setBackgroundEffect(_effect: BackgroundEffect): void {}
  onFocusChange(_cb: (focused: boolean) => void): void {}
}

class StubGlobalShortcutPlatform implements GlobalShortcutPlatform {
  register(_accel: string, _callback: () => void): boolean {
    return false;
  }
}

class StubClipboardPlatform implements ClipboardPlatform {
  async writeText(_text: string): Promise<void> {
    throw new Error('主进程 clipboard.writeText 未实现（#11）');
  }
  async writeImagePng(_bytes: Uint8Array): Promise<void> {
    throw new Error('主进程 clipboard.writeImagePng 未实现（#11）');
  }
}

class StubCredentialPlatform implements CredentialPlatform {
  async get(_key: string): Promise<string | null> {
    return null;
  }
  async set(_key: string, _value: string): Promise<void> {
    throw new Error('主进程 credentials.set 未实现（账号管理任务）');
  }
  async delete(_key: string): Promise<void> {
    throw new Error('主进程 credentials.delete 未实现（账号管理任务）');
  }
}

export class MainStubPlatformServices implements PlatformServices {
  readonly window: WindowPlatform = new StubWindowPlatform();
  readonly globalShortcut: GlobalShortcutPlatform = new StubGlobalShortcutPlatform();
  readonly clipboard: ClipboardPlatform = new StubClipboardPlatform();
  readonly credentials: CredentialPlatform = new StubCredentialPlatform();
}
