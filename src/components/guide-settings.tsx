import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Copy, ExternalLink, ImagePlus, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getSessionPassword } from '@/lib/session-password';
import { getAdminGuide, saveAdminGuide, uploadGuideImage } from '@/lib/guide.functions';
import { GUIDE_MAX_LENGTH, GUIDE_PUBLIC_LINK } from '@/lib/guide-content';

export function GuideSettings({ seasonId, isActive }: { seasonId: string | undefined; isActive: boolean }) {
  const read = useServerFn(getAdminGuide);
  const save = useServerFn(saveAdminGuide);
  const upload = useServerFn(uploadGuideImage);
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [loaded, setLoaded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
  return <section className="space-y-4 border-t border-border pt-6">
    <h2 className="text-xl font-semibold">안내 페이지</h2>
    {!isActive ? <p className="text-sm text-muted-foreground">현재 활성 시즌에서만 편집할 수 있습니다.</p> : query.isError ? <div className="flex items-center gap-3"><p className="text-sm text-destructive">안내문을 읽지 못했습니다. 편집과 저장이 잠겨 있습니다.</p><Button variant="outline" onClick={() => query.refetch()}>다시 읽기</Button></div> : !loaded ? <p className="text-sm text-muted-foreground">안내문을 불러오는 중입니다.</p> : null}
    <Textarea ref={textarea} aria-label="안내문 본문" className="min-h-80" value={body} maxLength={GUIDE_MAX_LENGTH} disabled={!ready} onChange={(e) => setBody(e.target.value)} onSelect={(e) => { cursor.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; }} />
    <div className="flex flex-wrap gap-2">
      <Button disabled={!ready} onClick={saveBody}><Save className="mr-2 h-4 w-4" />저장</Button>
      <Button variant="outline" asChild><a href="/guide" target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />미리보기</a></Button>
      <Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(GUIDE_PUBLIC_LINK); toast.success('링크를 복사했습니다.'); } catch { toast.error('링크 복사에 실패했습니다.'); } }}><Copy className="mr-2 h-4 w-4" />링크 복사</Button>
      <Button variant="outline" disabled={!ready} onClick={() => input.current?.click()}><ImagePlus className="mr-2 h-4 w-4" />이미지 올리기</Button>
      <input ref={input} type="file" className="hidden" accept="image/jpeg,image/png,image/webp" onChange={(e) => uploadFile(e.target.files?.[0])} />
    </div>
    <details className="text-sm text-muted-foreground"><summary className="cursor-pointer">작성 규칙</summary><div className="mt-3 space-y-1"><p># 큰 제목</p><p>## 소제목</p><p>&gt; 인용문</p><p>! 정보 상자</p><p>[[제목]] 접이식 항목 (끝낼 때 [[끝]])</p><p>https 주소는 자동 링크, 이미지 주소는 이미지로 표시됩니다.</p><p>jpg·png·webp, 5MB 이하 / 안내문 20,000자 이하</p></div></details>
  </section>;
}
