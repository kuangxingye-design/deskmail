/**
 * renderer 构建：esbuild 打包 renderer.ts（含核心域）为 IIFE，并拷贝静态资源。
 * 不用 shell 命令，保证 Windows 下可直接运行。
 */
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

await esbuild.build({
  entryPoints: ['src/renderer/renderer.ts'],
  bundle: true,
  outfile: 'dist/renderer/renderer.js',
  format: 'iife',
  platform: 'browser',
  sourcemap: true,
  logLevel: 'info',
});

mkdirSync('dist/renderer', { recursive: true });
cpSync('src/renderer/index.html', 'dist/renderer/index.html');
cpSync('src/renderer/styles.css', 'dist/renderer/styles.css');
