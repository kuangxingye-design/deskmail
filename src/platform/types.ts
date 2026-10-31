/**
 * 平台能力接口（真实定义）。
 * 核心域禁止直接依赖壳层 API；平台能力一律经本接口注入。
 * 浏览器降级桩：BrowserStubPlatformServices。真实实现：#10（窗口/热键）、#11（剪贴板）、#9（凭据）。
 */

export type BackgroundEffect = 'acrylic' | 'opaque';

export interface WindowPlatform {
  setAlwaysOnTop(value: boolean): void;
  setPosition(x: number, y: number): void;
  getPosition(): { x: number; y: number };
  setVisible(visible: boolean): void;
  /** 磨砂玻璃（DWM Acrylic）优先，失败降级 opaque（R4） */
  setBackgroundEffect(effect: BackgroundEffect): void;
  onFocusChange(cb: (focused: boolean) => void): void;
}

export interface GlobalShortcutPlatform {
  /** 返回 false = 注册失败（冲突，启动即提示；D2） */
  register(accel: string, callback: () => void): boolean;
}

export interface ClipboardPlatform {
  writeText(text: string): Promise<void>;
  /** 内嵌图片转 PNG 后写入剪贴板（R3：取存储字节直写，不经渲染回读） */
  writeImagePng(bytes: Uint8Array): Promise<void>;
}

export interface CredentialPlatform {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface PlatformServices {
  window: WindowPlatform;
  globalShortcut: GlobalShortcutPlatform;
  clipboard: ClipboardPlatform;
  credentials: CredentialPlatform;
}
