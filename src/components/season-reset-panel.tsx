// 설정 → 데이터 초기화 (전체관리자 전용). 항상 현재 시즌만 대상으로 한다 — 시즌 선택 창 없음, 시즌 삭제 없음.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useActiveSeason } from "@/lib/use-active-season";
import { getSessionPassword } from "@/lib/session-password";
import { resetSeasonItem } from "@/lib/season-reset.functions";
import { RESET_ITEMS, RESET_ALL_DETAIL, canRunReset, type ResetItemKey } from "@/lib/season-reset";

export function SeasonResetSummary() {
  const { season } = useActiveSeason();
  return (
    <div>
      <div>초기화 대상: <b className="text-foreground">{season?.name ?? "-"}</b></div>
      <div>항목별 초기화 · 시즌 전체 초기화</div>
    </div>
  );
}

export function SeasonResetSection() {
  const { season, isViewingPast } = useActiveSeason();
  const qc = useQueryClient();
  const resetFn = useServerFn(resetSeasonItem);
  const [target, setTarget] = useState<ResetItemKey | null>(null);
  const [typedName, setTypedName] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  if (!season) return <div className="text-sm text-muted-foreground">시즌이 없습니다.</div>;
  if (isViewingPast) {
    return <div className="text-sm text-destructive">지난 시즌을 조회 중입니다. 현재 시즌으로 돌아온 뒤 초기화할 수 있습니다.</div>;
  }

  const open = (k: ResetItemKey) => { setTarget(k); setTypedName(""); setPw(""); };
  const item = RESET_ITEMS.find((i) => i.key === target);
  const isAll = target === "all";
  const ready = !!target && canRunReset({ item: target, typedName, seasonName: season.name, password: pw });

  const run = async () => {
    if (!target || !ready) return;
    const password = getSessionPassword();
    if (!password) { toast.error("다시 로그인해 주세요."); return; }
    setBusy(true);
    try {
      await resetFn({ data: { password, seasonId: season.id, item: target, confirmName: typedName, confirmPassword: isAll ? pw : undefined } });
      toast.success(isAll ? "이 시즌 전체를 초기화했습니다." : `${item?.label} 초기화 완료`);
      setTarget(null);
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "초기화 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border-2 border-destructive bg-destructive/5 p-3">
        <div className="text-sm text-muted-foreground">지금 초기화 대상</div>
        <div className="text-xl font-bold text-destructive">{season.name}</div>
        <p className="mt-1 text-xs text-muted-foreground">
          초기화는 이 시즌에만 적용되며 다른 시즌에는 영향을 주지 않습니다. 시즌 자체는 삭제되지 않고 내용만 비워집니다.
        </p>
      </div>

      <Button variant="destructive" size="lg" className="h-14 w-full text-base" onClick={() => open("all")}>
        <AlertTriangle className="mr-2 h-5 w-5" /> 이 시즌 전체 초기화
      </Button>

      <div className="grid gap-2 sm:grid-cols-2">
        {RESET_ITEMS.map((i) => (
          <Card key={i.key} className="flex items-start justify-between gap-2 p-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">{i.label}</div>
              <div className="text-xs text-muted-foreground">{i.detail}</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => open(i.key)}>
              <RotateCcw className="mr-1 h-3 w-3" /> 초기화
            </Button>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        비밀번호·영수증 서식·OCR 키는 모든 시즌이 함께 쓰는 설정이라 시즌별 초기화 대상에서 제외됩니다.
      </p>

      <AlertDialog open={!!target} onOpenChange={(o) => { if (!o && !busy) setTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isAll ? "이 시즌 전체 초기화" : `${item?.label} 초기화`}</AlertDialogTitle>
            <AlertDialogDescription className="text-destructive font-medium">
              대상 시즌: {season.name} — 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <div className="font-medium">지워지는 항목</div>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {isAll ? RESET_ALL_DETAIL.map((d) => <li key={d}>{d}</li>) : <li>{item?.detail}</li>}
              </ul>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">확인을 위해 시즌 이름 <b>{season.name}</b> 을(를) 정확히 입력하세요</Label>
              <Input value={typedName} onChange={(e) => setTypedName(e.target.value)} autoFocus />
            </div>
            {isAll && (
              <div className="space-y-1">
                <Label className="text-xs">전체관리자 비밀번호</Label>
                <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" />
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>취소</AlertDialogCancel>
            <Button variant="destructive" disabled={!ready || busy} onClick={run}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}초기화 실행
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
