// 앱 내부 "사전접수 폼" 탭 — 공개 폼을 페이지 안에 그대로 렌더링한다.
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { ApplyForm } from "@/components/apply-form";

export const Route = createFileRoute("/apply-form")({
  head: () => ({
    meta: [
      { title: "사전접수 폼 — 한다련 캠프" },
      { name: "description", content: "앱 안에서 공개 사전접수 폼을 그대로 확인하고 작성합니다." },
      { property: "og:title", content: "사전접수 폼 — 한다련 캠프" },
      { property: "og:description", content: "앱 안에서 공개 사전접수 폼을 그대로 확인합니다." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApplyFormPage,
});

function ApplyFormPage() {
  return (
    <AppShell>
      <ApplyForm showLookupLink={false} />
    </AppShell>
  );
}
