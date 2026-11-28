export const GUIDE_COLORS = ['회색', '갈색', '주황', '노랑', '초록', '파랑', '보라', '분홍', '빨강'] as const;
export type GuideColor = (typeof GUIDE_COLORS)[number];
export type GuideColorTarget = 'color' | 'background';
export type GuideStyle = { color?: GuideColor; background?: GuideColor };
export type GuideText = GuideStyle & { text: string };
export type GuideInline = GuideStyle & { text: string; bold?: boolean; underline?: boolean };
export type GuideBlock =
  | ({ kind: 'heading' | 'subheading' | 'heading3' | 'paragraph' | 'quote' | 'info' } & GuideText)
  | ({ kind: 'image' | 'link'; url: string } & GuideStyle)
  | { kind: 'list'; ordered: boolean; items: GuideText[] }
  | { kind: 'divider' }
  | { kind: 'fold'; title: string; blocks: GuideBlock[] };

export const GUIDE_COLOR_CLASSES: Record<GuideColor, { text: string; background: string }> = {
  회색: { text: 'guide-text-gray', background: 'guide-bg-gray' },
  갈색: { text: 'guide-text-brown', background: 'guide-bg-brown' },
  주황: { text: 'guide-text-orange', background: 'guide-bg-orange' },
  노랑: { text: 'guide-text-yellow', background: 'guide-bg-yellow' },
  초록: { text: 'guide-text-green', background: 'guide-bg-green' },
  파랑: { text: 'guide-text-blue', background: 'guide-bg-blue' },
  보라: { text: 'guide-text-purple', background: 'guide-bg-purple' },
  분홍: { text: 'guide-text-pink', background: 'guide-bg-pink' },
  빨강: { text: 'guide-text-red', background: 'guide-bg-red' },
};

export const GUIDE_BUCKET = 'guide-images';
export const GUIDE_PUBLIC_LINK = 'https://www.handaryeoncamp.space/guide';
export const GUIDE_MAX_LENGTH = 20_000;
export const GUIDE_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function isGuideColor(value: string): value is GuideColor {
  return (GUIDE_COLORS as readonly string[]).includes(value);
}

export function safeGuideUrl(text: string): string | null {
  try {
    const url = new URL(text);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function takeLineStyle(line: string): { style: GuideStyle; rest: string } {
  const style: GuideStyle = {};
  let rest = line;
  for (let count = 0; count < 2; count += 1) {
    const match = /^\{(배경:)?([^{}|]+)\}/.exec(rest);
    if (!match || !isGuideColor(match[2] ?? '')) break;
    if (match[1]) style.background = match[2] as GuideColor;
    else style.color = match[2] as GuideColor;
    rest = rest.slice(match[0].length);
  }
  return { style, rest };
}

function sameStyle(a: GuideStyle, b: GuideStyle) {
  return a.color === b.color && a.background === b.background;
}

export function parseGuide(body: string, storageOrigin = ''): GuideBlock[] {
  const result: GuideBlock[] = [];
  let current = result;
  for (const rawLine of body.replace(/\r\n?/g, '\n').split('\n')) {
    const fold = /^\[\[(.+)\]\]$/.exec(rawLine);
    if (fold?.[1]) {
      current = result;
      if (fold[1] !== '끝') {
        const block: GuideBlock = { kind: 'fold', title: fold[1], blocks: [] };
        result.push(block);
        current = block.blocks;
      }
      continue;
    }

    const { style, rest: line } = takeLineStyle(rawLine);
    if (line === '---') current.push({ kind: 'divider' });
    else if (line.startsWith('### ')) current.push({ kind: 'heading3', text: line.slice(4), ...style });
    else if (line.startsWith('## ')) current.push({ kind: 'subheading', text: line.slice(3), ...style });
    else if (line.startsWith('# ')) current.push({ kind: 'heading', text: line.slice(2), ...style });
    else if (line.startsWith('> ')) {
      const last = current.at(-1);
      if (last?.kind === 'quote' && sameStyle(last, style)) last.text += '\n' + line.slice(2);
      else current.push({ kind: 'quote', text: line.slice(2), ...style });
    } else if (line.startsWith('! ')) current.push({ kind: 'info', text: line.slice(2), ...style });
    else if (line.startsWith('- ') || /^\d+\. /.test(line)) {
      const ordered = !line.startsWith('- ');
      const text = ordered ? line.replace(/^\d+\. /, '') : line.slice(2);
      const last = current.at(-1);
      if (last?.kind === 'list' && last.ordered === ordered) last.items.push({ text, ...style });
      else current.push({ kind: 'list', ordered, items: [{ text, ...style }] });
    } else {
      const url = safeGuideUrl(line.trim());
      if (url) {
        const parsed = new URL(url);
        const ownImage = storageOrigin && parsed.origin === storageOrigin && parsed.pathname.startsWith(`/storage/v1/object/public/${GUIDE_BUCKET}/`);
        current.push({ kind: /\.(jpe?g|png|webp)$/i.test(parsed.pathname) || ownImage ? 'image' : 'link', url, ...style });
      } else current.push({ kind: 'paragraph', text: line, ...style });
    }
  }
  return result;
}

export function parseGuideInline(text: string, inherited: GuideStyle & { bold?: boolean; underline?: boolean } = {}, allowColor = true): GuideInline[] {
  const result: GuideInline[] = [];
  let plain = '';
  const flush = () => {
    if (!plain) return;
    result.push({ text: plain, ...inherited });
    plain = '';
  };
  const append = (segments: GuideInline[]) => {
    flush();
    result.push(...segments);
  };

  let index = 0;
  while (index < text.length) {
    const marker = text.startsWith('**', index) ? '**' : text.startsWith('__', index) ? '__' : null;
    if (marker) {
      const contentStart = index + 2;
      const close = text.indexOf(marker, contentStart);
      if (close > contentStart) {
        const style = marker === '**' ? { ...inherited, bold: true } : { ...inherited, underline: true };
        append(parseGuideInline(text.slice(contentStart, close), style, allowColor));
        index = close + 2;
        continue;
      }
      plain += marker;
      index += 2;
      continue;
    }

    if (allowColor && text[index] === '{') {
      const open = /^\{(배경:)?([^{}|]+)\|/.exec(text.slice(index));
      if (open && isGuideColor(open[2] ?? '')) {
        const contentStart = index + open[0].length;
        const close = text.indexOf('}', contentStart);
        if (close > contentStart) {
          const style = { ...inherited };
          if (open[1]) style.background = open[2] as GuideColor;
          else style.color = open[2] as GuideColor;
          append(parseGuideInline(text.slice(contentStart, close), style, false));
          index = close + 1;
          continue;
        }
      }
    }

    plain += text[index];
    index += 1;
  }
  flush();
  return result;
}

export type GuideBlockKind = 'text' | 'heading' | 'subheading' | 'heading3' | 'quote' | 'info' | 'bullet' | 'ordered' | 'fold' | 'divider';
export type GuideSelection = { start: number; end: number };
export type GuideEditResult = GuideSelection & { body: string };

function selectedLineRange(body: string, selection: GuideSelection) {
  const start = Math.max(0, Math.min(selection.start, body.length));
  const end = Math.max(start, Math.min(selection.end, body.length));
  const from = (start === 0 ? -1 : body.lastIndexOf('\n', start - 1)) + 1;
  const effectiveEnd = end > start && body[end - 1] === '\n' ? end - 1 : end;
  const nextBreak = body.indexOf('\n', effectiveEnd);
  return { from, to: nextBreak === -1 ? body.length : nextBreak };
}

function withoutBlockPrefix(line: string) {
  for (const prefix of ['### ', '## ', '# ', '> ', '! ', '- ']) {
    if (line.startsWith(prefix)) return line.slice(prefix.length);
  }
  return line.replace(/^\d+\. /, '');
}

export function applyGuideBlock(body: string, selection: GuideSelection, kind: GuideBlockKind): GuideEditResult {
  const { from, to } = selectedLineRange(body, selection);
  const original = body.slice(from, to);
  let replacement: string;
  if (kind === 'divider') replacement = '---';
  else if (kind === 'fold') replacement = `[[제목]]\n${original}\n[[끝]]`;
  else {
    replacement = original.split('\n').map((rawLine, index) => {
      const { rest } = takeLineStyle(rawLine);
      const lineStyle = rawLine.slice(0, rawLine.length - rest.length);
      const text = withoutBlockPrefix(rest);
      const prefix = kind === 'heading' ? '# ' : kind === 'subheading' ? '## ' : kind === 'heading3' ? '### ' : kind === 'quote' ? '> ' : kind === 'info' ? '! ' : kind === 'bullet' ? '- ' : kind === 'ordered' ? `${index + 1}. ` : '';
      return lineStyle + prefix + text;
    }).join('\n');
  }
  return { body: body.slice(0, from) + replacement + body.slice(to), start: from, end: from + replacement.length };
}

const COLOR_PATTERN = GUIDE_COLORS.join('|');
function inlineWrapper(text: string, target: GuideColorTarget) {
  const match = new RegExp(`^\\{(배경:)?(${COLOR_PATTERN})\\|([\\s\\S]*)\\}$`).exec(text);
  if (!match || (target === 'background') !== !!match[1]) return null;
  return { color: match[2] as GuideColor, text: match[3] ?? '' };
}

function applyInlineColor(body: string, selection: GuideSelection, target: GuideColorTarget, color: GuideColor | 'default'): GuideEditResult {
  const { start, end } = selection;
  const selected = body.slice(start, end);
  const ownWrapper = inlineWrapper(selected, target);
  if (ownWrapper) {
    const replacement = color === 'default' ? ownWrapper.text : `{${target === 'background' ? '배경:' : ''}${color}|${ownWrapper.text}}`;
    const contentStart = color === 'default' ? start : start + replacement.indexOf(ownWrapper.text);
    return { body: body.slice(0, start) + replacement + body.slice(end), start: contentStart, end: contentStart + ownWrapper.text.length };
  }

  const before = body.slice(0, start);
  const surrounding = new RegExp(`\\{(배경:)?(${COLOR_PATTERN})\\|$`).exec(before);
  if (surrounding && body[end] === '}' && (target === 'background') === !!surrounding[1]) {
    const openStart = start - surrounding[0].length;
    const replacement = color === 'default' ? selected : `{${target === 'background' ? '배경:' : ''}${color}|${selected}}`;
    const contentStart = color === 'default' ? openStart : openStart + replacement.indexOf(selected);
    return { body: body.slice(0, openStart) + replacement + body.slice(end + 1), start: contentStart, end: contentStart + selected.length };
  }

  if (color === 'default') return { body, ...selection };
  const wrapper = `{${target === 'background' ? '배경:' : ''}${color}|${selected}}`;
  const contentStart = start + wrapper.indexOf(selected);
  return { body: body.slice(0, start) + wrapper + body.slice(end), start: contentStart, end: contentStart + selected.length };
}

export function applyGuideColor(body: string, selection: GuideSelection, target: GuideColorTarget, color: GuideColor | 'default'): GuideEditResult {
  if (selection.end > selection.start && !body.slice(selection.start, selection.end).includes('\n')) {
    return applyInlineColor(body, selection, target, color);
  }
  const { from, to } = selectedLineRange(body, selection);
  const replacement = body.slice(from, to).split('\n').map((rawLine) => {
    const { style, rest } = takeLineStyle(rawLine);
    if (color === 'default') delete style[target];
    else style[target] = color;
    return `${style.color ? `{${style.color}}` : ''}${style.background ? `{배경:${style.background}}` : ''}${rest}`;
  }).join('\n');
  return { body: body.slice(0, from) + replacement + body.slice(to), start: from, end: from + replacement.length };
}

export function toggleGuideInline(body: string, selection: GuideSelection, marker: '**' | '__'): GuideEditResult {
  const { start, end } = selection;
  const selected = body.slice(start, end);
  if (!selected || selected.includes('\n')) return { body, ...selection };
  if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length > marker.length * 2) {
    const inner = selected.slice(2, -2);
    return { body: body.slice(0, start) + inner + body.slice(end), start, end: start + inner.length };
  }
  if (body.slice(start - 2, start) === marker && body.slice(end, end + 2) === marker) {
    return { body: body.slice(0, start - 2) + selected + body.slice(end + 2), start: start - 2, end: end - 2 };
  }
  return { body: body.slice(0, start) + marker + selected + marker + body.slice(end), start: start + 2, end: end + 2 };
}

export function validateGuideBody(body: string): string {
  if (body.length > GUIDE_MAX_LENGTH) throw new Error('안내문은 20,000자 이하로 입력해 주세요.');
  return body;
}

export function validateGuideImage(type: string, bytes: Uint8Array): 'jpg' | 'png' | 'webp' {
  if (!bytes.length || bytes.length > GUIDE_MAX_IMAGE_BYTES) throw new Error('이미지는 5MB 이하만 올릴 수 있습니다.');
  if (type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (type === 'image/png' && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)) return 'png';
  if (type === 'image/webp' && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'webp';
  throw new Error('jpg·png·webp 이미지 파일만 올릴 수 있습니다.');
}
