/**
 * 真实内容解析与净化（#10）：mailparser + sanitize-html。
 *
 * Node-only：renderer 仍使用透传桩；组合根通过 ComposeOptions.parser 注入本实现。
 * 安全边界：
 * - 远程图片不加载（D3）：sanitize-html 对 img 只允许 data:，http(s) src 会被移除
 * - 脚本 / iframe / 事件属性 / 危险 style 属性全部剥离
 * - mailparser 默认把 cid: 图片替换为 data: URL；本实现只保留 image/* 的内嵌图字节
 */
import { simpleParser } from 'mailparser';
import sanitizeHtml from 'sanitize-html';
import type {
  HtmlSanitizer,
  MessageParser,
  ParsedMessage,
  TextExtractor,
} from '../../content/types';
import type { RawInlineImage, RawMessage } from '../../imap/types';

/** 单封原始 MIME 与正文字符上限（Proposal 附注2：2MB 截断） */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

const ALLOWED_TAGS = [
  'p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'a',
  'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
  'figure', 'figcaption', 'sub', 'sup', 'small',
];

const COLOR = /^#[0-9a-f]{3,8}$/i;
const RGBA = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i;
const SPACING = /^[0-9.]+(px|em|rem|%)(?:\s+[0-9.]+(px|em|rem|%)){0,3}$/;

export class SanitizeHtmlSanitizer implements HtmlSanitizer {
  sanitize(html: string): string {
    return sanitizeHtml(html, {
      allowedTags: ALLOWED_TAGS,
      allowedAttributes: {
        a: ['title'],
        img: ['src', 'alt', 'width', 'height'],
        td: ['colspan', 'rowspan'],
        th: ['colspan', 'rowspan'],
        '*': ['style'],
      },
      allowedSchemes: ['http', 'https', 'mailto'],
      // 远程图片一律不加载；只允许 mailparser 生成的 data: 内嵌图
      allowedSchemesByTag: { img: ['data'] },
      allowedStyles: {
        '*': {
          color: [COLOR, RGBA],
          'background-color': [COLOR, RGBA],
          'font-weight': [/^(normal|bold|[1-9]00)$/],
          'font-style': [/^(normal|italic)$/],
          'text-decoration': [/^(none|underline|line-through)$/],
          'text-align': [/^(left|right|center|justify)$/],
          'line-height': [/^[0-9.]+$/],
          'font-size': [/^[0-9.]+(px|em|rem|%)$/],
          margin: [SPACING],
          padding: [SPACING],
          'border-radius': [/^[0-9.]+(px|em|rem|%)$/],
        },
      },
      disallowedTagsMode: 'discard',
      allowProtocolRelative: false,
      nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript'],
    });
  }
}

export class SimpleHtmlTextExtractor implements TextExtractor {
  extract(html: string): string {
    return html
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}

export class MailparserMessageParser implements MessageParser {
  constructor(
    private readonly sanitizer: HtmlSanitizer,
    private readonly textExtractor: TextExtractor,
  ) {}

  async parse(raw: RawMessage): Promise<ParsedMessage> {
    const source = raw.raw.byteLength > MAX_BODY_BYTES
      ? raw.raw.subarray(0, MAX_BODY_BYTES)
      : raw.raw;

    // keepCidLinks: false 让 mailparser 直接把 cid: 图片替换为 data: URL
    const parsed = await simpleParser(Buffer.from(source), { keepCidLinks: false });

    const inlineImages: RawInlineImage[] = [];
    for (const attachment of parsed.attachments) {
      if (!attachment.cid || !attachment.contentType.startsWith('image/')) {
        continue;
      }
      inlineImages.push({
        cid: attachment.cid,
        contentType: attachment.contentType,
        data: new Uint8Array(attachment.content),
      });
    }

    const rawHtml = typeof parsed.html === 'string' ? parsed.html : '';
    const sanitizedHtml = rawHtml ? this.sanitizer.sanitize(rawHtml) : '';
    const bodyHtml = sanitizedHtml ? truncate(sanitizedHtml, MAX_BODY_BYTES) : undefined;

    const plainText = (parsed.text ?? '').trim();
    const bodyText = truncate(
      plainText || (sanitizedHtml ? this.textExtractor.extract(sanitizedHtml) : ''),
      MAX_BODY_BYTES,
    );

    return { bodyText, bodyHtml, inlineImages };
  }
}

export function createMessageParser(): MessageParser {
  return new MailparserMessageParser(new SanitizeHtmlSanitizer(), new SimpleHtmlTextExtractor());
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? value.slice(0, limit) : value;
}
