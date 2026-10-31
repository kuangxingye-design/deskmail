/**
 * 邮件内容模块接口（真实定义）。
 * 桩实现：src/content/stub.ts。真实实现：#7（MIME 解析、HTML 净化、文本提取）。
 */
import type { RawInlineImage, RawMessage } from '../imap/types';

/** MIME 解析结果：正文文本 + 净化后 HTML + 内嵌图片 */
export interface ParsedMessage {
  bodyText: string;
  bodyHtml?: string;
  inlineImages: RawInlineImage[];
}

/** 原始邮件 → 结构化内容 */
export interface MessageParser {
  parse(raw: RawMessage): ParsedMessage;
}

/**
 * HTML 净化：白名单标签/CSS、剥离脚本与远程资源。
 * 注意：#7 落地前是透传桩，禁止把真实邮件 HTML 传入渲染（安全风险 R2）。
 */
export interface HtmlSanitizer {
  sanitize(html: string): string;
}

/** HTML → 纯文本（「复制全文」用） */
export interface TextExtractor {
  extract(html: string): string;
}
