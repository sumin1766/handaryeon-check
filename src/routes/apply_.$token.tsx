// 접근 링크(/apply/토큰)로 본인 사전접수 건 재조회·수정.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { Card } from "@/components/ui/card";
import { PreRegistrationSelfEditor } from "@/components/pre-registration-self-editor";
import { getPreRegistrationByToken } from "@/lib/pre-registration-self.functions";

export const Route = createFileRoute("/apply_/$token")({
  head: () => ({
    meta: [
      { title: "사전접수 조회·수정 — 한다련 캠프" },
      { name: "description", content: "접근 링크로 사전접수 명단을 다시 조회하고 수정합니다." },
      { property: "og:title", content: "사전접수 조회·수정 — 한다련 캠프" },
      { property: "og:description", content: "접근 링크로 사전접수 명단을 다시 조회하고 수정합니다." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SelfPage,
});

function SelfPage() {
  const { token } = Route.useParams();
  const fetchByToken = useServerFn(getPreRegistrationByToken);
  const { data, isLoading, error } = useQuery({
    queryKey: ["pre-reg-self", token],
    queryFn: () => fetchByToken({ data: { token } }),
    retry: false,
  });

  if (isLoading) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-muted-foreground">불러오는 중...</div>;
  }
  if (error || !data) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-16">
        <Card className="space-y-3 p-6 text-center">
          <h1 className="text-xl font-bold">접수 건을 열 수 없습니다</h1>
          <p className="text-sm text-muted-foreground">
            {(error as Error | null)?.message ?? "유효하지 않은 접근 링크입니다."}
          </p>
          <Link className="text-sm underline" to="/apply/lookup">
            교회명·담당자명·전화번호로 본인확인하기
          </Link>
        </Card>
      </div>
    );
  }
  return <PreRegistrationSelfEditor initial={data} />;
}
