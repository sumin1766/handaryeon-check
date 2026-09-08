// 공개 사전접수 폼 (로그인/비밀번호 불필요). 제출은 서버 함수만 사용한다.
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_PRE_REG_FEE,
  PRE_REG_FORM_NOTICES,
  calcExpectedFee,
} from "@/lib/pre-registration-config";
import {
  submitPreRegistration,
  type SubmitPreRegistrationResult,
} from "@/lib/pre-registration-public.functions";
import { krw } from "@/lib/format";

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

const EXTERNAL_NOTICE = "외부 숙박 관련 문의는 추후 안내문에 따라 별도로 문의해 주세요.";

type Row = { name: string; phone: string; lodging_type: "church" | "external" };
const emptyRow = (): Row => ({ name: "", phone: "", lodging_type: "church" });

function ApplyPage() {
  const [churchName, setChurchName] = useState("");
  const [managerName, setManagerName] = useState("");
  const [managerPhone, setManagerPhone] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [result, setResult] = useState<SubmitPreRegistrationResult | null>(null);

  const { data: fee = DEFAULT_PRE_REG_FEE } = useQuery({
    queryKey: ["public-pre-reg-fee"],
    queryFn: async () => {
      const { data: season } = await supabase
        .from("seasons")
        .select("id")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!season) return DEFAULT_PRE_REG_FEE;
      const { data } = await supabase
        .from("app_settings")
        .select("*")
        .eq("season_id", season.id)
        .maybeSingle();
      return (data as { pre_reg_fee?: number } | null)?.pre_reg_fee ?? DEFAULT_PRE_REG_FEE;
    },
  });

  const submitFn = useServerFn(submitPreRegistration);
  const submit = useMutation({
    mutationFn: (input: SubmitPreRegistrationInput) => submitFn({ data: input }),
    onSuccess: (res) => {
      setResult(res);
      if (res.duplicateNotice) {
        toast.warning("이미 접수된 건이 있습니다. 중복 접수인지 담당자에게 확인해 주세요.");
      }
    },
    onError: (e: Error) => toast.error(e.message || "제출에 실패했습니다."),
  });

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const onSubmit = () => {
    if (!churchName.trim() || !managerName.trim() || !managerPhone.trim()) {
      toast.error("교회명·담당자명·담당자 전화번호를 모두 입력해 주세요.");
      return;
    }
    const cleaned = rows.map((r) => ({ ...r, name: r.name.trim(), phone: r.phone.trim() }));
    if (cleaned.length === 0) {
      toast.error("참석자를 1명 이상 입력해 주세요.");
      return;
    }
    if (cleaned.some((r) => !r.name || !r.phone)) {
      toast.error("모든 참석자의 이름과 전화번호를 입력해 주세요.");
      return;
    }
    submit.mutate({
      churchName: churchName.trim(),
      managerName: managerName.trim(),
      managerPhone: managerPhone.trim(),
      members: cleaned,
    });
  };

  if (result) return <DoneScreen result={result} />;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold sm:text-3xl">참석자 사전접수</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        결제 완료 후 아래 명단을 작성해 주세요. 제출하면 QR이 발급됩니다.
      </p>

      <Card className="mt-5 space-y-2 p-4 text-sm leading-relaxed">
        <p>• {PRE_REG_FORM_NOTICES.student}</p>
        <p>• {PRE_REG_FORM_NOTICES.phone}</p>
        <p>• {EXTERNAL_NOTICE}</p>
      </Card>

      <Card className="mt-5 space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="text-sm font-medium">교회명</span>
            <Input value={churchName} onChange={(e) => setChurchName(e.target.value)} maxLength={100} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">담당자명</span>
            <Input value={managerName} onChange={(e) => setManagerName(e.target.value)} maxLength={50} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">담당자 전화번호</span>
            <Input
              value={managerPhone}
              onChange={(e) => setManagerPhone(e.target.value)}
              inputMode="tel"
              maxLength={30}
            />
          </label>
        </div>
      </Card>

      <Card className="mt-5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">참석자 명단 ({rows.length}명)</h2>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRows((p) => p.map((r) => ({ ...r, lodging_type: "church" })))}
            >
              전체 교회 숙박
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRows((p) => p.map((r) => ({ ...r, lodging_type: "external" })))}
            >
              전체 외부 숙박
            </Button>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
              <Input
                placeholder="이름"
                value={r.name}
                onChange={(e) => setRow(i, { name: e.target.value })}
              />
              <Input
                placeholder="전화번호"
                inputMode="tel"
                value={r.phone}
                onChange={(e) => setRow(i, { phone: e.target.value })}
              />
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={r.lodging_type === "church" ? "default" : "outline"}
                  onClick={() => setRow(i, { lodging_type: "church" })}
                >
                  교회 숙박
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={r.lodging_type === "external" ? "default" : "outline"}
                  onClick={() => setRow(i, { lodging_type: "external" })}
                >
                  외부 숙박
                </Button>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="행 삭제"
                onClick={() => setRows((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          className="mt-3"
          onClick={() => setRows((p) => [...p, emptyRow()])}
        >
          <Plus className="mr-1 h-4 w-4" /> 참석자 추가
        </Button>
      </Card>

      <Card className="mt-5 flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="text-sm text-muted-foreground">
            예상 회비 (1인 {krw(fee)} × {rows.length}명)
          </div>
          <div className="text-2xl font-bold">{krw(calcExpectedFee(rows.length, fee))}</div>
        </div>
        <Button size="lg" onClick={onSubmit} disabled={submit.isPending}>
          {submit.isPending ? "제출 중..." : "사전접수 제출"}
        </Button>
      </Card>
    </div>
  );
}

function DoneScreen({ result }: { result: SubmitPreRegistrationResult }) {
  const [qr, setQr] = useState<string>("");
  useEffect(() => {
    QRCode.toDataURL(result.accessUrl, { width: 320, margin: 1 }).then(setQr).catch(() => setQr(""));
  }, [result.accessUrl]);

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10 text-center">
      <h1 className="text-2xl font-bold">사전접수가 완료되었습니다</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {result.headCount}명 · 예상 회비 {krw(result.expectedFee)}
      </p>
      <Card className="mt-6 flex flex-col items-center gap-4 p-6">
        {qr ? (
          <img src={qr} alt="사전접수 확인용 QR 코드" className="h-64 w-64" />
        ) : (
          <div className="h-64 w-64 animate-pulse rounded bg-muted" />
        )}
        <p className="text-base font-semibold text-destructive">
          이 QR을 반드시 저장하거나 캡처해 주세요.
        </p>
        <p className="text-sm text-muted-foreground">
          분실하더라도 추후 교회명·담당자명·전화번호로 본인확인 후 다시 조회할 수 있습니다.
          (재조회 기능은 준비 중입니다.)
        </p>
        <p className="break-all text-xs text-muted-foreground">{result.accessUrl}</p>
      </Card>
    </div>
  );
}
