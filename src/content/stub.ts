/**
 * 内容模块桩实现：原样透传，不做任何解析/净化/提取（#7 落地真实实现）。
 * sanitizer 已接入 parser（透传），用于固定「解析 → 净化」的调用顺序；
 * textExtractor（HTML → 纯文本）待 #7 随真实 MIME 解析接入。
 */
import type { RawMessage } from '../imap/types';
import type { HtmlSanitizer, MessageParser, ParsedMessage, TextExtractor } from './types';

export class StubMessageParser implements MessageParser {
  constructor(private readonly sanitizer: HtmlSanitizer) {}

  parse(raw: RawMessage): ParsedMessage {
    return {
      bodyText: raw.bodyText,
      bodyHtml: raw.bodyHtml !== undefined ? this.sanitizer.sanitize(raw.bodyHtml) : undefined,
      inlineImages: raw.inlineImages,
    };
  }
}

export class StubHtmlSanitizer implements HtmlSanitizer {
  sanitize(html: string): string {
    return html;
  }
}

export class StubTextExtractor implements TextExtractor {
  extract(html: string): string {
    return html;
  }
}
