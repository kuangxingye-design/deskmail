/** preload 经 contextBridge 暴露的全局 API（与 src/main/preload.ts 对应） */
export {};

declare global {
  interface Window {
    deskmail?: {
      reportSmoke(payload: unknown): void;
    };
  }
}
