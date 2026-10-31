/**
 * 内容模块桩实现：只做最小纯文本提取，不做 MIME/HTML 解析（#10 落地真实实现）。
 * 真实解析器会接收 IMAP 的原始 MIME 字节，并负责 character set、HTML 净化与 cid 图片关联。
 */
import type { RawMessage } from '../imap/types';
import type { HtmlSanitizer, MessageParser, ParsedMessage, TextExtractor } from './types';

export class StubMessageParser implements MessageParser {
  parse(raw: RawMessage): ParsedMessage {
    const source = new TextDecoder('utf-8', { fatal: false }).decode(raw.raw);
    const separator = source.indexOf('\r\n\r\n');
    const body = separator >= 0 ? source.slice(separator + 4) : source;
    return {
      bodyText: body.trim(),
      // 骨架期不渲染 HTML；#10 净化器落地前禁止把真实邮件 HTML 传给渲染
      bodyHtml: undefined,
      inlineImages: [],
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
