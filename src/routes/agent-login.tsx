import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { oauthReturnPath } from "@/lib/oauth-return-path";
export const Route = createFileRoute("/agent-login")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ next: oauthReturnPath(s.next) }),
  head: () => ({ meta: [{ title: "에이전트 연동 로그인 · 한다련 캠프" }, { name: "description", content: "기존 계정으로 캠프 에이전트 연결을 승인합니다." }, { property: "og:title", content: "에이전트 연동 로그인 · 한다련 캠프" }, { property: "og:description", content: "기존 계정으로 에이전트 연결 승인" }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AgentLogin,
});
function AgentLogin() {
  const { next } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <main className="mx-auto max-w-sm px-6 py-16 text-foreground">
    <h1 className="text-xl font-semibold">에이전트 연동 로그인</h1>
    <p className="mt-3 text-sm text-muted-foreground">기존 계정으로 로그인해 주세요. 캠프 접수용 공용 비밀번호와는 별개입니다.</p>
    <form className="mt-6 space-y-4" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError("");
      const form = new FormData(event.currentTarget);
      try {
        const { error: failure } = await supabase.auth.signInWithPassword({ email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") });
        if (failure) throw failure;
        window.location.assign(next);
      } catch { setError("로그인하지 못했습니다. 계정 정보와 연결 상태를 확인해 주세요."); setBusy(false); }
    }}>
      <div className="space-y-2"><Label htmlFor="agent-email">이메일</Label><Input id="agent-email" name="email" type="email" autoComplete="username" required disabled={busy} /></div>
      <div className="space-y-2"><Label htmlFor="agent-password">계정 비밀번호</Label><Input id="agent-password" name="password" type="password" autoComplete="current-password" required disabled={busy} /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? "로그인 중…" : "로그인"}</Button>
    </form>
  </main>;
}