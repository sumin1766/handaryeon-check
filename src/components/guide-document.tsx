import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseGuide, type GuideBlock } from '@/lib/guide-content';

function GuideFold({ block }: { block: Extract<GuideBlock, { kind: 'fold' }> }) {
  const [open, setOpen] = useState(false);
  return <section className="border-y border-border py-2">
    <Button variant="ghost" className="h-auto w-full justify-start gap-2 whitespace-normal py-3 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
      <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />{block.title}
    </Button>
    {open && <div className="space-y-4 pb-4 pl-6"><GuideBlocks blocks={block.blocks} /></div>}
  </section>;
}
function GuideBlocks({ blocks }: { blocks: GuideBlock[] }) {
  return blocks.map((b, i) => {
    switch (b.kind) {
      case 'heading': return <h1 key={i} className="pt-4 text-3xl font-bold leading-snug whitespace-pre-wrap break-words">{b.text}</h1>;
      case 'subheading': return <h2 key={i} className="pt-3 text-xl font-semibold whitespace-pre-wrap break-words">{b.text}</h2>;
      case 'quote': return <blockquote key={i} className="border-l-4 border-border pl-4 whitespace-pre-wrap break-words">{b.text}</blockquote>;
      case 'info': return <aside key={i} className="rounded-md bg-muted p-4 whitespace-pre-wrap break-words">{b.text}</aside>;
      case 'image': return <img key={i} src={b.url} alt="안내 이미지" loading="lazy" referrerPolicy="no-referrer" className="h-auto w-full rounded-md" />;
      case 'link': return <a key={i} href={b.url} target="_blank" rel="noopener noreferrer" className="block break-all underline underline-offset-4">{b.url}</a>;
      case 'fold': return <GuideFold key={i} block={b} />;
      case 'paragraph': return <p key={i} className="min-h-6 whitespace-pre-wrap break-words leading-7">{b.text}</p>;
    }
  });
}
export function GuideDocument({ body }: { body: string }) {
  let storageOrigin = '';
  try { storageOrigin = new URL(import.meta.env.VITE_SUPABASE_URL).origin; } catch { /* no configured storage */ }
  return <div className="space-y-4"><GuideBlocks blocks={parseGuide(body, storageOrigin)} /></div>;
}
