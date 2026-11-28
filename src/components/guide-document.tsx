import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GUIDE_COLOR_CLASSES, parseGuide, parseGuideInline, type GuideBlock, type GuideStyle, type GuideText } from '@/lib/guide-content';

function InlineText({ text }: { text: string }) {
  return parseGuideInline(text).map((part, index) => <span key={index} className={[
    part.bold ? 'font-bold' : '',
    part.underline ? 'underline underline-offset-4' : '',
    part.color ? GUIDE_COLOR_CLASSES[part.color].text : '',
    part.background ? `${GUIDE_COLOR_CLASSES[part.background].background} rounded-sm px-0.5` : '',
    part.background && !part.color ? 'guide-on-tint' : '',
  ].filter(Boolean).join(' ')}>{part.text}</span>);
}

function lineClasses(style: GuideStyle, info = false) {
  return [
    style.color ? GUIDE_COLOR_CLASSES[style.color].text : '',
    style.background ? `${GUIDE_COLOR_CLASSES[style.background].background} rounded-md ${info ? 'p-4' : 'px-3 py-2'}` : info ? 'bg-muted' : '',
    style.background && !style.color ? 'guide-on-tint' : '',
  ].filter(Boolean).join(' ');
}

function GuideFold({ block }: { block: Extract<GuideBlock, { kind: 'fold' }> }) {
  const [open, setOpen] = useState(false);
  return <section className="border-y border-border py-2">
    <Button variant="ghost" className="h-auto w-full justify-start gap-2 whitespace-normal py-3 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
      <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} /><InlineText text={block.title} />
    </Button>
    {open && <div className="space-y-4 pb-4 pl-6"><GuideBlocks blocks={block.blocks} /></div>}
  </section>;
}

function ListItem({ item }: { item: GuideText }) {
  return <li className={`whitespace-pre-wrap break-words leading-7 ${lineClasses(item)}`}><InlineText text={item.text} /></li>;
}

function GuideBlocks({ blocks }: { blocks: GuideBlock[] }) {
  return blocks.map((block, index) => {
    switch (block.kind) {
      case 'heading': return <h1 key={index} className={`pt-4 text-3xl font-bold leading-snug whitespace-pre-wrap break-words ${lineClasses(block)}`}><InlineText text={block.text} /></h1>;
      case 'subheading': return <h2 key={index} className={`pt-3 text-xl font-semibold whitespace-pre-wrap break-words ${lineClasses(block)}`}><InlineText text={block.text} /></h2>;
      case 'heading3': return <h3 key={index} className={`pt-2 text-lg font-semibold whitespace-pre-wrap break-words ${lineClasses(block)}`}><InlineText text={block.text} /></h3>;
      case 'quote': return <blockquote key={index} className={`border-l-4 border-border pl-4 whitespace-pre-wrap break-words ${lineClasses(block)}`}><InlineText text={block.text} /></blockquote>;
      case 'info': return <aside key={index} className={`rounded-md p-4 whitespace-pre-wrap break-words ${lineClasses(block, true)}`}><InlineText text={block.text} /></aside>;
      case 'list': {
        const List = block.ordered ? 'ol' : 'ul';
        return <List key={index} className={`space-y-2 pl-6 ${block.ordered ? 'list-decimal' : 'list-disc'}`}>{block.items.map((item, itemIndex) => <ListItem key={itemIndex} item={item} />)}</List>;
      }
      case 'divider': return <hr key={index} className="border-border" />;
      case 'image': return <div key={index} className={lineClasses(block)}><img src={block.url} alt="안내 이미지" loading="lazy" referrerPolicy="no-referrer" className="h-auto w-full rounded-md" /></div>;
      case 'link': return <div key={index} className={lineClasses(block)}><a href={block.url} target="_blank" rel="noopener noreferrer" className="block break-all underline underline-offset-4">{block.url}</a></div>;
      case 'fold': return <GuideFold key={index} block={block} />;
      case 'paragraph': return <p key={index} className={`min-h-6 whitespace-pre-wrap break-words leading-7 ${lineClasses(block)}`}><InlineText text={block.text} /></p>;
    }
  });
}

export function GuideDocument({ body }: { body: string }) {
  let storageOrigin = '';
  try { storageOrigin = new URL(import.meta.env.VITE_SUPABASE_URL).origin; } catch { /* no configured storage */ }
  return <div className="space-y-4"><GuideBlocks blocks={parseGuide(body, storageOrigin)} /></div>;
}
