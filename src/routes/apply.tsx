// 공개 사전접수 폼 (로그인/비밀번호 불필요). 제출은 서버 함수만 사용한다.
import { createFileRoute } from "@tanstack/react-router";
import { ApplyForm } from "@/components/apply-form";

export const Route = createFileRoute("/apply")({
  head: () => ({
    meta: [
      { title: "참석자 사전접수 — 한다련 캠프" },
      { name: "description", content: "한다련 캠프 참석자 사전접수 신청 폼입니다." },
      { property: "og:title", content: "참석자 사전접수 — 한다련 캠프" },
      { property: "og:description", content: "한다련 캠프 참석자 사전접수 신청 폼입니다." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApplyPage,
});

function ApplyPage() {
  return <ApplyForm />;
}
