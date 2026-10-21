// 접수 데이터 삭제(휴지통 이동) 구역 + 삭제 명단 복구 화면. 전체관리자 전용, 현재 시즌만.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Trash2, Undo2, ShieldAlert } from "lucide-react";
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
import { isSeasonNameConfirmed } from "@/lib/season-reset";
import { TRASH_KIND_DETAIL, TRASH_KIND_LABEL, type TrashKind } from "@/lib/registration-trash";
import { CATEGORY_LABELS } from "@/lib/member-categories";
import { countTrashTargets, listTrash, moveToTrash, restoreFromTrash } from "@/lib/registration-trash.functions";

export function StatusPill({ kind }: { kind: TrashKind }) {
  const cls =
    kind === "confirmed"
      ? "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-200"
      : "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex shrink-0 select-none items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-sm ${cls}`}>
      {TRASH_KIND_LABEL[kind]}
    </span>
  );
}

export function TrashDeleteSection() {
  const { season, isViewingPast } = useActiveSeason();
  const qc = useQueryClient();
  const countFn = useServerFn(countTrashTargets);
  const moveFn = useServerFn(moveToTrash);
  const [target, setTarget] = useState<TrashKind | null>(null);
  const [typed, setTyped] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  const counts = useQuery({
    queryKey: ["trash-targets", season?.id],
    enabled: !!season && !isViewingPast,
    queryFn: () => countFn({ data: { password: getSessionPassword() ?? "", seasonId: season!.id } }),
  });

  if (!season || isViewingPast) return null;
  const c = counts.data;
  const countText = (k: TrashKind) =>
    !c ? "건수 확인 중…" : k === "pending" ? `${c.pending}건 · ${c.pendingPeople}명` : `${c.confirmed}교회 · ${c.confirmedPeople}명`;
  const ready = !!target && isSeasonNameConfirmed(typed, season.name) && pw.length > 0;

  const run = async () => {
    if (!target || !ready) return;
    const password = getSessionPassword();
    if (!password) { toast.error("다시 로그인해 주세요."); return; }
    setBusy(true);
    try {
      const r = await moveFn({ data: { password, seasonId: season.id, kind: target, confirmName: typed, confirmPassword: pw } });
      toast.success(`${r.moved}건을 휴지통으로 옮겼습니다.`);
      setTarget(null);
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "삭제 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border-2 border-destructive/60 bg-destructive/5 p-3">
      <div className="flex items-center gap-2 text-sm font-bold text-destructive">
        <ShieldAlert className="h-4 w-4" /> 접수 데이터 삭제 (휴지통으로 이동)
      </div>
      <p className="text-xs text-muted-foreground">설정값 초기화와 달리 접수 정보를 운영 화면에서 뺍니다. 지운 내용은 "삭제 명단 복구"에서 새 접수로 되살릴 수 있습니다.</p>
      {(["pending", "confirmed"] as TrashKind[]).map((k) => (
        <Card key={k} className="flex flex-col gap-2 border-destructive/40 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold"><StatusPill kind={k} /> {TRASH_KIND_DETAIL[k].title}</div>
            <div className="mt-1 text-xs text-muted-foreground">{TRASH_KIND_DETAIL[k].description}</div>
            <div className="mt-1 text-xs font-medium text-destructive">대상: {countText(k)}</div>
          </div>
          <Button size="sm" variant="destructive" onClick={() => { setTarget(k); setTyped(""); setPw(""); }}>
            <Trash2 className="mr-1 h-3 w-3" /> 휴지통으로
          </Button>
        </Card>
      ))}

      <AlertDialog open={!!target} onOpenChange={(o) => { if (!o && !busy) setTarget(null); }}>
        <AlertDialogContent>
          {target && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2"><StatusPill kind={target} /> {TRASH_KIND_DETAIL[target].title}</AlertDialogTitle>
                <AlertDialogDescription className="font-medium text-destructive">
                  대상 시즌: {season.name} · {countText(target)}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="font-medium">휴지통으로 가는 내용</div>
                  <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                    {TRASH_KIND_DETAIL[target].goes.map((g) => <li key={g}>{g}</li>)}
                  </ul>
                  <p className="mt-1 text-xs text-muted-foreground">운영 화면(대시보드·지역 집계·접수 시트·내보내기 등)에서 바로 빠집니다.</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">확인을 위해 시즌 이름 <b>{season.name}</b> 을(를) 정확히 입력하세요</Label>
                  <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">전체관리자 비밀번호</Label>
                  <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
                </div>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>취소</AlertDialogCancel>
                <Button variant="destructive" disabled={!ready || busy} onClick={run}>
                  {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} 휴지통으로 보내기
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function TrashRestoreSummary() {
  return <div>삭제한 접수를 새 접수(미확정)로 복구</div>;
}

const LODGING: Record<string, string> = { church: "교회 숙박", external: "외부 숙박", none: "비숙박" };

export function TrashRestoreSection() {
  const { season, isViewingPast } = useActiveSeason();
  const qc = useQueryClient();
  const listFn = useServerFn(listTrash);
  const restoreFn = useServerFn(restoreFromTrash);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["registration-trash", season?.id],
    enabled: !!season && !isViewingPast,
    queryFn: () => listFn({ data: { password: getSessionPassword() ?? "", seasonId: season!.id } }),
  });

  if (!season) return <div className="text-sm text-muted-foreground">시즌이 없습니다.</div>;
  if (isViewingPast) return <div className="text-sm text-destructive">현재 시즌으로 돌아온 뒤 사용할 수 있습니다.</div>;

  const restore = async (id: string) => {
    const password = getSessionPassword();
    if (!password) { toast.error("다시 로그인해 주세요."); return; }
    setBusyId(id);
    try {
      await restoreFn({ data: { password, seasonId: season.id, id } });
      toast.success("새 사전접수(미확정)로 복구했습니다. 사전접수 관리에서 검토 후 확정하세요.");
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "복구 실패");
    } finally {
      setBusyId(null);
    }
  };

  const labels = CATEGORY_LABELS as Record<string, string>;
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
        삭제된 접수 정보(교회·담당자 연락처·참석자 명단 등 개인정보)가 이곳에 보관됩니다. 자동으로 지워지지 않습니다. 대상 시즌: <b>{season.name}</b>
      </div>
      <p className="text-xs text-muted-foreground">복구하면 새 QR 토큰을 가진 "미확정" 새 접수로 만들어지고, 체크인은 되살리지 않습니다.</p>
      {q.isLoading && <div className="text-sm text-muted-foreground">불러오는 중…</div>}
      {q.isError && <div className="text-sm text-destructive">{(q.error as Error).message}</div>}
      {q.data?.length === 0 && <div className="text-sm text-muted-foreground">휴지통이 비어 있습니다.</div>}
      {q.data?.map((t) => (
        <Card key={t.id} className="p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <StatusPill kind={t.original_status} /> {t.church_name}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                담당자 {t.manager_name || "-"} · {t.head_count}명 · 삭제 {new Date(t.deleted_at).toLocaleString("ko-KR")}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setOpenId(openId === t.id ? null : t.id)}>
                명단 {openId === t.id ? "닫기" : "보기"}
              </Button>
              <Button size="sm" disabled={busyId === t.id} onClick={() => restore(t.id)}>
                {busyId === t.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Undo2 className="mr-1 h-3 w-3" />} 복구
              </Button>
            </div>
          </div>
          {openId === t.id && (
            <ul className="mt-2 max-h-48 overflow-auto rounded border border-border p-2 text-xs">
              {t.members.length === 0 && <li className="text-muted-foreground">명단 없음</li>}
              {t.members.map((m, i) => (
                <li key={i}>{m.name} · {labels[m.category] ?? m.category} · {LODGING[m.lodging_type] ?? m.lodging_type}</li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}
