import { createFileRoute } from '@tanstack/react-router';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { getPublicGuide } from '@/lib/guide.functions';
import { GuideDocument } from '@/components/guide-document';
const guideQuery = queryOptions({ queryKey: ['public-guide'], queryFn: () => getPublicGuide(), staleTime: 0 });
export const Route = createFileRoute('/guide')({
  head: () => ({ meta: [
    { title: '캠프 안내 — 한다련 캠프' },
    { name: 'description', content: '현재 진행 중인 한다련 캠프의 안내 사항을 확인하세요.' },
    { property: 'og:title', content: '캠프 안내 — 한다련 캠프' },
    { property: 'og:description', content: '한다련 캠프 참가자를 위한 안내 사항입니다.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary' },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(guideQuery),
  component: GuidePage,
  errorComponent: () => <main className="guide-paper min-h-screen px-6 py-16 text-center">안내문을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</main>,
});
function GuidePage() {
  const { data } = useSuspenseQuery(guideQuery);
  return <main className="guide-paper relative min-h-screen px-6 py-12 sm:px-8 sm:py-20">
    <article className="mx-auto w-full max-w-2xl">
      {data.body.trim() ? <>
        <header className="mb-8 text-sm text-muted-foreground">{data.seasonName}</header>
        <GuideDocument body={data.body} />
        {data.updatedAt && <footer className="mt-12 border-t border-border pt-4 text-xs text-muted-foreground">수정 {new Date(data.updatedAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</footer>}
      </> : <p className="text-center text-muted-foreground">안내 사항을 준비 중입니다.</p>}
    </article>
  </main>;
}
