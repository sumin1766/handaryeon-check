import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Bold, Copy, ExternalLink, ImagePlus, Save, Underline } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getSessionPassword } from '@/lib/session-password';
import { getAdminGuide, saveAdminGuide, uploadGuideImage } from '@/lib/guide.functions';
import { GuideDocument } from '@/components/guide-document';
import { applyGuideBlock, applyGuideColor, GUIDE_COLOR_CLASSES, GUIDE_COLORS, GUIDE_MAX_LENGTH, GUIDE_PUBLIC_LINK, toggleGuideInline, type GuideBlockKind, type GuideColor, type GuideColorTarget, type GuideEditResult } from '@/lib/guide-content';

const BLOCK_OPTIONS: { value: GuideBlockKind; label: string }[] = [
  { value: 'text', label: '텍스트' }, { value: 'heading', label: '제목1' }, { value: 'subheading', label: '제목2' },
  { value: 'heading3', label: '제목3' }, { value: 'quote', label: '인용' }, { value: 'info', label: '콜아웃' },
  { value: 'bullet', label: '글머리 기호' }, { value: 'ordered', label: '번호 목록' }, { value: 'fold', label: '접이식 항목' }, { value: 'divider', label: '구분선' },
];

function ColorSelect({ target, value, disabled, onChange }: { target: GuideColorTarget; value: GuideColor | 'default'; disabled: boolean; onChange: (color: GuideColor | 'default') => void }) {
  const label = target === 'color' ? '글자색' : '배경색';
  return <Select value={value} disabled={disabled} onValueChange={(next) => onChange(next as GuideColor | 'default')}>
    <SelectTrigger aria-label={label} className="w-36"><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value="default"><span className="flex items-center gap-2"><span className="h-4 w-4 rounded-full border border-border bg-transparent" />기본</span></SelectItem>
      {GUIDE_COLORS.map((color) => <SelectItem key={color} value={color}><span className="flex items-center gap-2"><span className={`h-4 w-4 rounded-full border border-border ${GUIDE_COLOR_CLASSES[color].background}`} />{color}</span></SelectItem>)}
    </SelectContent>
  </Select>;
}

export function GuideSettings({ seasonId, isActive }: { seasonId: string | undefined; isActive: boolean }) {
  const read = useServerFn(getAdminGuide);
  const save = useServerFn(saveAdminGuide);
  const upload = useServerFn(uploadGuideImage);
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [loaded, setLoaded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [blockKind, setBlockKind] = useState<GuideBlockKind>('text');
  const [textColor, setTextColor] = useState<GuideColor | 'default'>('default');
  const [backgroundColor, setBackgroundColor] = useState<GuideColor | 'default'>('default');
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const cursor = useRef({ start: 0, end: 0 });
  const query = useQuery({ queryKey: ['admin-guide', seasonId], enabled: !!seasonId && isActive,
    queryFn: () => { if (!seasonId) throw new Error('활성 시즌이 없습니다.'); return read({ data: { password: getSessionPassword() ?? '', seasonId } }); }, placeholderData: () => undefined, retry: 1, refetchOnWindowFocus: false });
  useEffect(() => {
    setLoaded(null);
    setBody('');
  }, [seasonId]);
  useEffect(() => {
    if (query.isSuccess && seasonId) { setBody(query.data.body); setLoaded(seasonId); }
  }, [query.data, query.isSuccess, seasonId]);
  const ready = !!seasonId && loaded === seasonId && query.isSuccess && isActive && !busy;

  function applyEdit(result: GuideEditResult) {
    if (result.body.length > GUIDE_MAX_LENGTH) { toast.error('안내문은 20,000자 이하로 입력해 주세요.'); return; }
    setBody(result.body);
    cursor.current = { start: result.start, end: result.end };
    requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(result.start, result.end); });
  }
  function changeBlock(kind: GuideBlockKind) {
    setBlockKind(kind);
    applyEdit(applyGuideBlock(body, cursor.current, kind));
  }
  function changeColor(target: GuideColorTarget, color: GuideColor | 'default') {
    if (target === 'color') setTextColor(color); else setBackgroundColor(color);
    applyEdit(applyGuideColor(body, cursor.current, target, color));
  }

  async function saveBody() {
    if (!ready || !seasonId) return;
    setBusy(true);
    try {
      await save({ data: { password: getSessionPassword() ?? '', seasonId, body } });
      toast.success('안내문이 저장되었습니다.');
      await qc.invalidateQueries({ queryKey: ['public-guide'] });
    } catch (e) { toast.error(e instanceof Error ? e.message : '저장 실패'); }
    finally { setBusy(false); }
  }
  async function uploadFile(file: File | undefined) {
    if (!ready || !seasonId || !file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set('password', getSessionPassword() ?? ''); form.set('seasonId', seasonId); form.set('file', file);
      const { url } = await upload({ data: form });
      const { start, end } = cursor.current;
      const prefix = body.slice(0, start), suffix = body.slice(end);
      const insertion = `${prefix && !prefix.endsWith('\n') ? '\n' : ''}${url}${suffix.startsWith('\n') ? '' : '\n'}`;
      if (body.length - (end - start) + insertion.length > GUIDE_MAX_LENGTH) throw new Error('이미지 주소를 넣으면 20,000자를 초과합니다.');
      setBody(prefix + insertion + suffix);
      requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(start + insertion.length, start + insertion.length); });
    } catch (e) { toast.error(e instanceof Error ? e.message : '이미지 올리기 실패'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }

  const editor = <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2" onMouseDownCapture={() => { if (textarea.current) cursor.current = { start: textarea.current.selectionStart, end: textarea.current.selectionEnd }; }}>
      <Select value={blockKind} disabled={!ready} onValueChange={(value) => changeBlock(value as GuideBlockKind)}>
        <SelectTrigger aria-label="블록 종류" className="w-36"><SelectValue /></SelectTrigger>
        <SelectContent>{BLOCK_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
      </Select>
      <ColorSelect target="color" value={textColor} disabled={!ready} onChange={(color) => changeColor('color', color)} />
      <ColorSelect target="background" value={backgroundColor} disabled={!ready} onChange={(color) => changeColor('background', color)} />
      <Button type="button" variant="outline" size="sm" aria-label="굵게" disabled={!ready} onClick={() => applyEdit(toggleGuideInline(body, cursor.current, '**'))}><Bold className="h-4 w-4" /></Button>
      <Button type="button" variant="outline" size="sm" aria-label="밑줄" disabled={!ready} onClick={() => applyEdit(toggleGuideInline(body, cursor.current, '__'))}><Underline className="h-4 w-4" /></Button>
      <Button type="button" variant="outline" size="sm" disabled={!ready} onClick={() => input.current?.click()}><ImagePlus className="mr-2 h-4 w-4" />이미지 올리기</Button>
      <input ref={input} type="file" className="hidden" accept="image/jpeg,image/png,image/webp" onChange={(e) => uploadFile(e.target.files?.[0])} />
    </div>
    <Textarea ref={textarea} aria-label="안내문 본문" className="min-h-[32rem] font-mono text-sm" value={body} maxLength={GUIDE_MAX_LENGTH} disabled={!ready} onChange={(e) => { setBody(e.target.value); cursor.current = { start: e.target.selectionStart, end: e.target.selectionEnd }; }} onSelect={(e) => { if (document.activeElement === e.currentTarget) cursor.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; }} />
  </div>;
  const preview = <div className="min-h-[32rem] rounded-md border border-border bg-background p-4"><GuideDocument body={body} /></div>;

  return <section className="space-y-4 border-t border-border pt-6">
    <h2 className="text-xl font-semibold">안내 페이지</h2>
    {!isActive ? <p className="text-sm text-muted-foreground">현재 활성 시즌에서만 편집할 수 있습니다.</p> : query.isError ? <div className="flex items-center gap-3"><p className="text-sm text-destructive">안내문을 읽지 못했습니다. 편집과 저장이 잠겨 있습니다.</p><Button variant="outline" onClick={() => query.refetch()}>다시 읽기</Button></div> : !loaded ? <p className="text-sm text-muted-foreground">안내문을 불러오는 중입니다.</p> : null}
    <div className="flex gap-2 lg:hidden" role="group" aria-label="편집 화면 전환">
      <Button type="button" variant={mobileView === 'edit' ? 'default' : 'outline'} onClick={() => setMobileView('edit')}>편집</Button>
      <Button type="button" variant={mobileView === 'preview' ? 'default' : 'outline'} onClick={() => setMobileView('preview')}>미리보기</Button>
    </div>
    <div className="grid gap-5 lg:grid-cols-2">
      <div className={mobileView === 'preview' ? 'hidden lg:block' : ''}>{editor}</div>
      <div className={mobileView === 'edit' ? 'hidden lg:block' : ''}><p className="mb-2 text-sm font-medium lg:hidden">실시간 미리보기</p>{preview}</div>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button disabled={!ready} onClick={saveBody}><Save className="mr-2 h-4 w-4" />저장</Button>
      <Button variant="outline" asChild><a href="/guide" target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />미리보기</a></Button>
      <Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(GUIDE_PUBLIC_LINK); toast.success('링크를 복사했습니다.'); } catch { toast.error('링크 복사에 실패했습니다.'); } }}><Copy className="mr-2 h-4 w-4" />링크 복사</Button>
    </div>
    <details className="text-sm text-muted-foreground"><summary className="cursor-pointer">작성 규칙</summary><div className="mt-3 space-y-1">
      <p># 제목1 / ## 제목2 / ### 제목3</p><p>&gt; 인용문 / ! 정보 상자 / --- 구분선</p><p>- 글머리 기호 / 1. 번호 목록</p><p>[[제목]] 접이식 항목 (끝낼 때 [[끝]])</p>
      <p>**굵게** / __밑줄__ / {'{빨강|글자색}'} / {'{배경:노랑|형광펜}'}</p><p>줄 맨 앞의 {'{빨강}'}, {'{배경:분홍}'} 은 줄 전체 색상입니다.</p><p>사용 가능한 색: 회색·갈색·주황·노랑·초록·파랑·보라·분홍·빨강</p>
      <p>https 주소는 자동 링크, 이미지 주소는 이미지로 표시됩니다.</p><p>jpg·png·webp, 5MB 이하 / 안내문 20,000자 이하</p>
    </div></details>
  </section>;
}
