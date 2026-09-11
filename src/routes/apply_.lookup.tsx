// 본인확인(교회명+담당자명+담당자 전화번호)으로 사전접수 건 재조회.
// 3값이 일치하는 제출 건이 여러 개면 전부 목록으로 보여주고, 각 건을 따로 연다.
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { krw } from "@/lib/format";
import { PreRegistrationSelfEditor } from "@/components/pre-registration-self-editor";
import {
  listPreRegistrationsByIdentity,
  openPreRegistrationByIdentity,
  type PreRegistrationSelfDetail,
  type SelfSummary,
} from "@/lib/pre-registration-self.functions";

const STATUS_LABELS: Record<SelfSummary["status"], string> = {
  submitted: "검토대기",
  applied: "확정완료",
  needs_review: "수정됨 · 재검토 필요",
};

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
  const [list, setList] = useState<SelfSummary[] | null>(null);
  const [detail, setDetail] = useState<PreRegistrationSelfDetail | null>(null);

  const identity = () => ({
    churchName: churchName.trim(),
    managerName: managerName.trim(),
    managerPhone: managerPhone.trim(),
  });

  const listFn = useServerFn(listPreRegistrationsByIdentity);
  const openFn = useServerFn(openPreRegistrationByIdentity);

  const lookup = useMutation({
    mutationFn: () => listFn({ data: identity() }),
    onSuccess: (rows) => {
      if (rows.length === 1) {
        open.mutate(rows[0]!.id);
        return;
      }
      setList(rows);
    },
    onError: (e: Error) => toast.error(e.message || "조회에 실패했습니다."),
  });

  const open = useMutation({
    mutationFn: (id: string) => openFn({ data: { ...identity(), id } }),
    onSuccess: setDetail,
    onError: (e: Error) => toast.error(e.message || "조회에 실패했습니다."),
  });

  if (detail) {
    return (
      <div className="space-y-3">
        {(list?.length ?? 0) > 1 && (
          <div className="mx-auto w-full max-w-3xl px-4 pt-6">
            <Button variant="outline" size="sm" onClick={() => setDetail(null)}>
              ← 다른 접수 건 선택
            </Button>
          </div>
        )}
        <PreRegistrationSelfEditor initial={detail} />
      </div>
    );
  }

  if (list) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-12">
        <h1 className="text-2xl font-bold">내 접수 건 {list.length}건</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          같은 담당자 이름·전화번호로 제출한 접수 건입니다. 수정할 건을 선택해 주세요.
        </p>
        <div className="mt-5 space-y-2">
          {list.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{r.churchName}</div>
                  <div className="text-xs text-muted-foreground">
                    {STATUS_LABELS[r.status]} · {r.headCount}명 · {krw(r.expectedFee)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    제출 {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                  </div>
                </div>
                <Button size="sm" disabled={open.isPending} onClick={() => open.mutate(r.id)}>
                  명단 보기
                </Button>
              </div>
            </Card>
          ))}
        </div>
        <Button variant="outline" className="mt-4 w-full" onClick={() => setList(null)}>
          본인확인 다시 하기
        </Button>
      </div>
    );
  }

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
          disabled={lookup.isPending || open.isPending}
          onClick={() => {
            if (!churchName.trim() || !managerName.trim() || !managerPhone.trim()) {
              toast.error("세 항목을 모두 입력해 주세요.");
              return;
            }
            lookup.mutate();
          }}
        >
          {lookup.isPending || open.isPending ? "조회 중..." : "내 접수 건 조회"}
        </Button>
        <p className="text-xs text-muted-foreground">
          5회 이상 확인에 실패하면 10분 동안 조회가 제한됩니다.
        </p>
      </Card>
    </div>
  );
}

