// 공개 사전접수 폼 (로그인/비밀번호 불필요). 제출은 서버 함수만 사용한다.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_PRE_REG_FEE,
  PRE_REG_FORM_NOTICES,
} from "@/lib/pre-registration-config";
import {
  MEMBER_CATEGORIES,
  CATEGORY_LABELS,
  isPhoneOptional,
  parseCategoryFees,
  sumCategoryFees,
  type MemberCategory,
  type CategoryFeeMap,
} from "@/lib/member-categories";
import {
  submitPreRegistration,
  getPublicFeeConfig,
  type SubmitPreRegistrationResult,
  type SubmitPreRegistrationInput,
} from "@/lib/pre-registration-public.functions";

import { krw } from "@/lib/format";
import { AttendeeExcelBar } from "@/components/attendee-excel-bar";

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

type LodgingType = "church" | "external" | "none";
type Row = {
  name: string;
  phone: string;
  lodging_type: LodgingType;
  category: MemberCategory;
};
const emptyRow = (): Row => ({ name: "", phone: "", lodging_type: "church", category: "male_student" });

const phoneOptional = (c: MemberCategory) => isPhoneOptional(c);

const LODGING_OPTIONS: { value: LodgingType; label: string }[] = [
  { value: "church", label: "교회 숙박" },
  { value: "external", label: "외부 숙박" },
  { value: "none", label: "비숙박" },
];


function ApplyPage() {
  const [churchName, setChurchName] = useState("");
  const [denomination, setDenomination] = useState("");
  const [managerName, setManagerName] = useState("");
  const [managerPhone, setManagerPhone] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [result, setResult] = useState<SubmitPreRegistrationResult | null>(null);

  const { data: feeCfg } = useQuery({
    queryKey: ["public-pre-reg-fee"],
    queryFn: async (): Promise<{ preRegFee: number; categoryFees: CategoryFeeMap }> => {
      const cfg = await getPublicFeeConfig();
      return { preRegFee: cfg.preRegFee, categoryFees: cfg.categoryFees as CategoryFeeMap };
    },
  });
  const preRegFee = feeCfg?.preRegFee ?? DEFAULT_PRE_REG_FEE;
  const categoryFees = feeCfg?.categoryFees ?? {};
  const expectedFee = sumCategoryFees(rows.map((r) => r.category), categoryFees, preRegFee);

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

  const noneCount = rows.filter((r) => r.lodging_type === "none").length;
  const lodgingCount = rows.length - noneCount;

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
    if (cleaned.some((r) => !r.name)) {
      toast.error("모든 참석자의 이름을 입력해 주세요.");
      return;
    }
    if (cleaned.some((r) => !r.phone && !phoneOptional(r.category))) {
      toast.error("유아유치를 제외한 모든 참석자는 전화번호가 필수입니다.");
      return;
    }

    submit.mutate({
      churchName: churchName.trim(),
      denomination: denomination.trim(),
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
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium">교회명</span>
            <Input value={churchName} onChange={(e) => setChurchName(e.target.value)} maxLength={100} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">교단명 (선택)</span>
            <Input
              value={denomination}
              onChange={(e) => setDenomination(e.target.value)}
              maxLength={100}
              placeholder="예: 예장합동 (선택 입력)"
            />
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
          <div>
            <h2 className="text-lg font-semibold">참석자 명단 ({rows.length}명)</h2>
            <p className="text-sm text-muted-foreground">
              숙박 {lodgingCount}명 · 비숙박 {noneCount}명 · 합계 {rows.length}명
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {LODGING_OPTIONS.map((o) => (
              <Button
                key={o.value}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRows((p) => p.map((r) => ({ ...r, lodging_type: o.value })))}
              >
                전체 {o.label}
              </Button>
            ))}
          </div>
        </div>

        <AttendeeExcelBar
          onAdd={(list) =>
            setRows((p) => [
              ...p.filter((r) => r.name.trim()),
              ...list.map((m) => ({ ...m, category: m.category as MemberCategory })),
            ])
          }
          onClear={() => setRows([])}
        />

        <div className="mt-3 space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr_auto_auto]">
              <Input
                placeholder="이름"
                value={r.name}
                onChange={(e) => setRow(i, { name: e.target.value })}
              />
              <select
                aria-label="분류"
                className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                value={r.category}
                onChange={(e) => setRow(i, { category: e.target.value as MemberCategory })}
              >
                {MEMBER_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
              <Input
                placeholder={phoneOptional(r.category) ? "전화번호 (선택)" : "전화번호"}
                inputMode="tel"
                value={r.phone}

                onChange={(e) => setRow(i, { phone: e.target.value })}
              />
              <div className="flex flex-wrap gap-1">
                {LODGING_OPTIONS.map((o) => (
                  <Button
                    key={o.value}
                    type="button"
                    size="sm"
                    variant={r.lodging_type === o.value ? "default" : "outline"}
                    onClick={() => setRow(i, { lodging_type: o.value })}
                  >
                    {o.label}
                  </Button>
                ))}
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
            예상 회비 (분류별 설정 합계 · {rows.length}명)
          </div>
          <div className="text-2xl font-bold">{krw(expectedFee)}</div>
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
          분실하더라도 교회명·담당자명·전화번호로 본인확인 후 다시 조회·수정할 수 있습니다.
        </p>
        <p className="break-all text-xs text-muted-foreground">{result.accessUrl}</p>
        <Link className="text-sm underline" to="/apply/lookup">
          본인확인으로 다시 조회하기
        </Link>
      </Card>
    </div>
  );
}
