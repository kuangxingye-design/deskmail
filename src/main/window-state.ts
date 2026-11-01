/**
 * 桌面壳窗口位置持久化（#21）：userData/window-state.json。
 * 只存位置；启动时 clamp 到主屏 workArea，避免窗口落在屏幕外。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface WindowPosition {
  x: number;
  y: number;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface StoredWindowState {
  x?: unknown;
  y?: unknown;
}

export class WindowStateStore {
  constructor(private readonly filePath: string) {}

  load(): WindowPosition | undefined {
    if (!existsSync(this.filePath)) return undefined;
    try {
      const data = JSON.parse(readFileSync(this.filePath, 'utf8')) as StoredWindowState;
      if (
        typeof data.x === 'number' &&
        typeof data.y === 'number' &&
        Number.isFinite(data.x) &&
        Number.isFinite(data.y)
      ) {
        return { x: data.x, y: data.y };
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  save(position: WindowPosition): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(position), 'utf8');
  }
}

export function clampWindowPosition(
  saved: WindowPosition | undefined,
  windowWidth: number,
  windowHeight: number,
  bounds: WindowBounds,
): WindowPosition {
  const maxX = bounds.x + Math.max(0, bounds.width - windowWidth);
  const maxY = bounds.y + Math.max(0, bounds.height - windowHeight);
  const defaultX = bounds.x + Math.max(0, (bounds.width - windowWidth) / 2);
  const defaultY = bounds.y + Math.max(0, (bounds.height - windowHeight) / 2);

  const x = saved?.x ?? defaultX;
  const y = saved?.y ?? defaultY;

  return {
    x: Math.round(Math.min(Math.max(x, bounds.x), maxX)),
    y: Math.round(Math.min(Math.max(y, bounds.y), maxY)),
  };
}
