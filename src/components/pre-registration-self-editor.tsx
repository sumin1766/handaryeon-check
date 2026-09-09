// 교회 본인 재조회·수정 화면 (공개, 비밀번호 불필요).
// 조회/저장은 모두 서버 함수를 통해서만 처리한다.
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { krw } from "@/lib/format";
import { AttendeeExcelBar } from "@/components/attendee-excel-bar";
import { PRE_REG_FORM_NOTICES } from "@/lib/pre-registration-config";
import {
  MEMBER_CATEGORIES,
  CATEGORY_LABELS,
  isPhoneOptional,
  sumCategoryFees,
  type MemberCategory,
} from "@/lib/member-categories";
import {
  updatePreRegistrationSelf,
  type PreRegistrationSelfDetail,
  type SelfMember,
} from "@/lib/pre-registration-self.functions";

const LODGING_OPTIONS: { value: SelfMember["lodging_type"]; label: string }[] = [
  { value: "church", label: "교회 숙박" },
  { value: "external", label: "외부 숙박" },
  { value: "none", label: "비숙박" },
];
const STATUS_LABELS: Record<PreRegistrationSelfDetail["status"], string> = {
  submitted: "검토대기",
  applied: "확정완료",
  needs_review: "수정됨 · 재검토 필요",
};
const phoneOptional = (c: string) => isPhoneOptional(c);
const emptyRow = (): SelfMember => ({
  name: "",
  phone: "",
  lodging_type: "church",
  category: "male_student",
});

export function PreRegistrationSelfEditor({ initial }: { initial: PreRegistrationSelfDetail }) {
  const [detail, setDetail] = useState(initial);
  const [churchName, setChurchName] = useState(initial.churchName);
  const [denomination, setDenomination] = useState(initial.denomination);
  const [managerName, setManagerName] = useState(initial.managerName);
  const [managerPhone, setManagerPhone] = useState(initial.managerPhone);
  const [rows, setRows] = useState<SelfMember[]>(
    initial.members.length ? initial.members : [emptyRow()],
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [qr, setQr] = useState("");

  useEffect(() => {
    QRCode.toDataURL(detail.accessUrl, { width: 320, margin: 1 })
      .then(setQr)
      .catch(() => setQr(""));
  }, [detail.accessUrl]);

  const saveFn = useServerFn(updatePreRegistrationSelf);
  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          token: detail.accessToken,
          churchName: churchName.trim(),
          denomination: denomination.trim(),
          managerName: managerName.trim(),
          managerPhone: managerPhone.trim(),
          members: rows.map((r) => ({ ...r, name: r.name.trim(), phone: r.phone.trim() })),
        },
      }),
    onSuccess: (res) => {
      setDetail(res.detail);
      setRows(res.detail.members.length ? res.detail.members : [emptyRow()]);
      setConfirmOpen(false);
      toast.success(
        res.changeType === "none" ? "변경된 내용이 없습니다." : "수정 내용이 저장되었습니다.",
      );
    },
    onError: (e: Error) => toast.error(e.message || "저장에 실패했습니다."),
  });

  const setRow = (i: number, patch: Partial<SelfMember>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const noneCount = rows.filter((r) => r.lodging_type === "none").length;
  const lodgingCount = rows.length - noneCount;
  const expectedFee = sumCategoryFees(rows.map((r) => r.category), detail.categoryFees ?? {}, detail.unitFee);

  const diff = useMemo(() => {
    const key = (m: SelfMember) => `${m.name.trim()}|${m.phone.trim()}|${m.category}|${m.lodging_type}`;
    const before = detail.members.map(key);
    const after = rows.map((r) => key(r));
    const beforeSet = [...before];
    const added: string[] = [];
    after.forEach((k, i) => {
      const idx = beforeSet.indexOf(k);
      if (idx >= 0) beforeSet.splice(idx, 1);
      else added.push(rows[i]!.name.trim() || "(이름 없음)");
    });
    const removed = beforeSet.map((k) => k.split("|")[0] || "(이름 없음)");
    return {
      added,
      removed,
      countDelta: rows.length - detail.headCount,
      feeDelta: expectedFee - detail.expectedFee,
    };
  }, [detail, rows, expectedFee]);

  const validate = () => {
    if (!churchName.trim() || !managerName.trim() || !managerPhone.trim()) {
      toast.error("교회명·담당자명·담당자 전화번호를 모두 입력해 주세요.");
      return false;
    }
    if (rows.some((r) => !r.name.trim())) {
      toast.error("모든 참석자의 이름을 입력해 주세요.");
      return false;
    }
    if (rows.some((r) => !r.phone.trim() && !phoneOptional(r.category))) {
      toast.error("유아유치를 제외한 모든 참석자는 전화번호가 필수입니다.");
      return false;
    }
    return true;
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold sm:text-3xl">사전접수 조회 · 수정</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        현재 상태: <span className="font-medium text-foreground">{STATUS_LABELS[detail.status]}</span>
      </p>

      <Card className="mt-5 flex flex-col items-center gap-3 p-6 text-center">
        {qr ? (
          <img src={qr} alt="사전접수 확인용 QR 코드" className="h-56 w-56" />
        ) : (
          <div className="h-56 w-56 animate-pulse rounded bg-muted" />
        )}
        <p className="text-base font-semibold text-destructive">
          이 QR을 반드시 저장하거나 캡처해 주세요.
        </p>
        <p className="break-all text-xs text-muted-foreground">{detail.accessUrl}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            navigator.clipboard?.writeText(detail.accessUrl);
            toast.success("링크를 복사했습니다.");
          }}
        >
          링크 복사
        </Button>
      </Card>

      <Card className="mt-5 space-y-2 p-4 text-sm leading-relaxed">
        <p>• {PRE_REG_FORM_NOTICES.student}</p>
        <p>• {PRE_REG_FORM_NOTICES.phone}</p>
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
        <Button
          size="lg"
          disabled={save.isPending}
          onClick={() => {
            if (validate()) setConfirmOpen(true);
          }}
        >
          수정 내용 저장
        </Button>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>변경 내용을 확인해 주세요</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                <p>
                  인원: {detail.headCount}명 → {rows.length}명 (
                  {diff.countDelta > 0 ? `+${diff.countDelta}` : diff.countDelta}명)
                </p>
                <p>
                  예상 회비: {krw(detail.expectedFee)} → {krw(expectedFee)} (
                  {diff.feeDelta > 0
                    ? `추가 징수 ${krw(diff.feeDelta)}`
                    : diff.feeDelta < 0
                      ? `환불 ${krw(-diff.feeDelta)}`
                      : "변동 없음"}
                  )
                </p>
                <p>추가된 참석자: {diff.added.length ? diff.added.join(", ") : "없음"}</p>
                <p>삭제된 참석자: {diff.removed.length ? diff.removed.join(", ") : "없음"}</p>
                {detail.status === "applied" && (
                  <p className="font-medium text-destructive">
                    이미 확정된 건입니다. 저장하면 재검토 대상으로 다시 전환됩니다.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={save.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                save.mutate();
              }}
              disabled={save.isPending}
            >
              {save.isPending ? "저장 중..." : "확인하고 저장"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
