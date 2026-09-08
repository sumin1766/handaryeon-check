// 본인확인(교회명+담당자명+담당자 전화번호)으로 사전접수 건 재조회.
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PreRegistrationSelfEditor } from "@/components/pre-registration-self-editor";
import {
  getPreRegistrationByIdentity,
  type PreRegistrationSelfDetail,
} from "@/lib/pre-registration-self.functions";

export const Route = createFileRoute("/apply_/lookup")({
  head: () => ({
    meta: [
      { title: "사전접수 본인확인 — 한다련 캠프" },
      { name: "description", content: "교회명·담당자명·전화번호로 사전접수 건을 다시 조회합니다." },
      { property: "og:title", content: "사전접수 본인확인 — 한다련 캠프" },
      { property: "og:description", content: "교회명·담당자명·전화번호로 사전접수 건을 다시 조회합니다." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LookupPage,
});

function LookupPage() {
  const [churchName, setChurchName] = useState("");
  const [managerName, setManagerName] = useState("");
  const [managerPhone, setManagerPhone] = useState("");
  const [detail, setDetail] = useState<PreRegistrationSelfDetail | null>(null);

  const lookupFn = useServerFn(getPreRegistrationByIdentity);
  const lookup = useMutation({
    mutationFn: () =>
      lookupFn({
        data: {
          churchName: churchName.trim(),
          managerName: managerName.trim(),
          managerPhone: managerPhone.trim(),
        },
      }),
    onSuccess: setDetail,
    onError: (e: Error) => toast.error(e.message || "조회에 실패했습니다."),
  });

  if (detail) return <PreRegistrationSelfEditor initial={detail} />;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold">사전접수 본인확인</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        제출할 때 입력한 교회명·담당자명·담당자 전화번호가 모두 일치해야 조회됩니다.
      </p>
      <Card className="mt-5 space-y-3 p-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">교회명</span>
          <Input value={churchName} onChange={(e) => setChurchName(e.target.value)} maxLength={100} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">담당자명</span>
          <Input value={managerName} onChange={(e) => setManagerName(e.target.value)} maxLength={50} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">담당자 전화번호</span>
          <Input
            value={managerPhone}
            onChange={(e) => setManagerPhone(e.target.value)}
            inputMode="tel"
            maxLength={30}
          />
        </label>
        <Button
          className="w-full"
          disabled={lookup.isPending}
          onClick={() => {
            if (!churchName.trim() || !managerName.trim() || !managerPhone.trim()) {
              toast.error("세 항목을 모두 입력해 주세요.");
              return;
            }
            lookup.mutate();
          }}
        >
          {lookup.isPending ? "조회 중..." : "내 접수 건 조회"}
        </Button>
        <p className="text-xs text-muted-foreground">
          5회 이상 확인에 실패하면 10분 동안 조회가 제한됩니다.
        </p>
      </Card>
    </div>
  );
}
