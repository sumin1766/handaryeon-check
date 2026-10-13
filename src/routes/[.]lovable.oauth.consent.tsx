import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "" }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("연결 요청 정보가 없습니다. 에이전트에서 다시 연결해 주세요.");
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error("로그인 상태를 확인하지 못했습니다.");
    if (!data.session) throw redirect({ to: "/agent-login", search: { next: location.pathname + location.searchStr + location.hash } });
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.searchStr).get("authorization_id");
    if (!id) throw new Error("연결 요청 정보가 없습니다.");
    const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
    if (error || !data) throw new Error("요청이 만료되었거나 연결 정보를 불러오지 못했습니다. 에이전트에서 다시 연결해 주세요.");
    if ("redirect_url" in data) throw redirect({ href: data.redirect_url });
    return data;
  },
  head: () => ({ meta: [{ title: "에이전트 연결 승인 · 한다련 캠프" }, { name: "description", content: "에이전트 연결 요청을 확인하고 승인하거나 거절합니다." }, { property: "og:title", content: "에이전트 연결 승인 · 한다련 캠프" }, { property: "og:description", content: "캠프 앱 에이전트 연결 승인 및 거절" }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  errorComponent: ({ error }) => <main className="mx-auto max-w-lg px-6 py-16"><h1 className="text-xl font-semibold">연결 요청을 확인할 수 없습니다</h1><p role="alert" className="mt-4 text-sm text-destructive">{error instanceof Error ? error.message : "연결 요청을 다시 시작해 주세요."}</p></main>,
  component: Consent,
});
function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function decide(approve: boolean) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = approve ? await supabase.auth.oauth.approveAuthorization(authorization_id, { skipBrowserRedirect: true }) : await supabase.auth.oauth.denyAuthorization(authorization_id, { skipBrowserRedirect: true });
      if (result.error || !result.data?.redirect_url) throw new Error("failed");
      window.location.assign(result.data.redirect_url);
    } catch { setError("처리하지 못했습니다. 다시 시도해 주세요."); setBusy(false); }
  }
  return <main className="mx-auto max-w-lg px-6 py-16 text-foreground"><h1 className="text-xl font-semibold">에이전트 연결 승인</h1>
    <p className="mt-4 font-medium">{details.client.name}</p>
    <p className="mt-3 text-sm text-muted-foreground">앱 정보와 지역 참고 목록을 조회합니다. 접수 개인정보, 회비, 데이터 수정 권한은 제공하지 않습니다.</p>
    <p className="mt-3 break-all text-xs text-muted-foreground">돌아갈 주소: {details.redirect_uri}</p>
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    <div className="mt-6 flex gap-3"><Button disabled={busy} onClick={() => decide(true)}>승인</Button><Button variant="outline" disabled={busy} onClick={() => decide(false)}>거절</Button></div>
  </main>;
}