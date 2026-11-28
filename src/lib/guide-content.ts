export type GuideBlock =
  | { kind: 'heading' | 'subheading' | 'paragraph' | 'quote' | 'info'; text: string }
  | { kind: 'image' | 'link'; url: string }
  | { kind: 'fold'; title: string; blocks: GuideBlock[] };

export const GUIDE_BUCKET = 'guide-images';
export const GUIDE_PUBLIC_LINK = 'https://www.handaryeoncamp.space/guide';
export const GUIDE_MAX_LENGTH = 20_000;
export const GUIDE_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function safeGuideUrl(text: string): string | null {
  try {
    const url = new URL(text);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function parseGuide(body: string, storageOrigin = ''): GuideBlock[] {
  const result: GuideBlock[] = [];
  let current = result;
  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    const fold = /^\[\[(.+)\]\]$/.exec(line);
    if (fold?.[1]) {
      current = result;
      if (fold[1] !== '끝') {
        const block: GuideBlock = { kind: 'fold', title: fold[1], blocks: [] };
        result.push(block);
        current = block.blocks;
      }
      continue;
    }
    if (line.startsWith('## ')) current.push({ kind: 'subheading', text: line.slice(3) });
    else if (line.startsWith('# ')) current.push({ kind: 'heading', text: line.slice(2) });
    else if (line.startsWith('> ')) {
      const last = current.at(-1);
      if (last?.kind === 'quote') last.text += '\n' + line.slice(2);
      else current.push({ kind: 'quote', text: line.slice(2) });
    } else if (line.startsWith('! ')) current.push({ kind: 'info', text: line.slice(2) });
    else {
      const url = safeGuideUrl(line.trim());
      if (url) {
        const parsed = new URL(url);
        const ownImage = storageOrigin && parsed.origin === storageOrigin && parsed.pathname.startsWith(`/storage/v1/object/public/${GUIDE_BUCKET}/`);
        current.push({ kind: /\.(jpe?g|png|webp)$/i.test(parsed.pathname) || ownImage ? 'image' : 'link', url });
      } else current.push({ kind: 'paragraph', text: line });
    }
  }
  return result;
}

export function validateGuideBody(body: string): string {
  if (body.length > GUIDE_MAX_LENGTH) throw new Error('안내문은 20,000자 이하로 입력해 주세요.');
  return body;
}

export function validateGuideImage(type: string, bytes: Uint8Array): 'jpg' | 'png' | 'webp' {
  if (!bytes.length || bytes.length > GUIDE_MAX_IMAGE_BYTES) throw new Error('이미지는 5MB 이하만 올릴 수 있습니다.');
  if (type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (type === 'image/png' && [137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n)) return 'png';
  if (type === 'image/webp' && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP') return 'webp';
  throw new Error('jpg·png·webp 이미지 파일만 올릴 수 있습니다.');
}
