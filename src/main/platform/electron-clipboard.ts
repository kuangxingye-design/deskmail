/**
 * Electron 剪贴板平台实现（#23）：文本 + 图片（PNG 字节）写入系统剪贴板。
 * Electron 45 使用 W3C 风格的 ClipboardItem API（无 clipboard.writeImage）。
 */
import { ClipboardItem, clipboard, nativeImage } from 'electron';
import type { ClipboardPlatform } from '../../platform/types';

export class ElectronClipboardPlatform implements ClipboardPlatform {
  async writeText(text: string): Promise<void> {
    await clipboard.writeText(text);
  }

  async writeImagePng(bytes: Uint8Array): Promise<void> {
    const image = nativeImage.createFromBuffer(Buffer.from(bytes));
    if (image.isEmpty()) {
      throw new Error('图片解码失败');
    }

    const png = image.toPNG();
    const pngBytes = new Uint8Array(png.length);
    pngBytes.set(png);
    const blob = new Blob([pngBytes], { type: 'image/png' });
    await clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  }
}
