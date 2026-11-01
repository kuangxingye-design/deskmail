/** preload 经 contextBridge 暴露的全局 API（与 src/main/preload.ts 对应） */
import type { DeskMailClient } from '../ipc/types';

export {};

declare global {
  interface Window {
    deskmail?: DeskMailClient & {
      reportSmoke(payload: unknown): void;
    };
  }
}
