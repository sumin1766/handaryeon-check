import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, GenderBadge } from "@/components/app-shell";
import { useActiveSeason } from "@/lib/use-active-season";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { resilientQueryCache, writeCachedData } from "@/lib/query-session-cache";
import { Card } from "@/components/ui/card";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRealtimeInvalidate } from "@/lib/use-realtime";
import { useAuthRole } from "@/lib/use-auth-role";
import { num, formatTime } from "@/lib/format";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";

function useIsTouchDevice() {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setTouch(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return touch;
}

export const Route = createFileRoute("/intake-sheet")({
  head: () => ({ meta: [{ title: "접수시트 — 한다련 캠프" }] }),
  component: IntakeSheetPage,
});

function IntakeSheetPage() {
  const { season } = useActiveSeason();
  const qc = useQueryClient();
  const role = useAuthRole();
  const isAdmin = role === "admin";
  useRealtimeInvalidate(["churches", "people", "lodgings"], [["intake", season?.id]]);
  const [filter, setFilter] = useState("");
  const isTouch = useIsTouchDevice();
  const [keypad, setKeypad] = useState<{ id: string; name: string; value: string } | null>(null);
  const [uncheckConfirm, setUncheckConfirm] = useState<{ id: string; name: string } | null>(null);
  const intakeKey = ["intake", season?.id] as const;

  const { data } = useQuery({
    queryKey: intakeKey,
    enabled: !!season?.id,
    queryFn: async () => {
      const { data: churches } = await supabase
        .from("churches").select("*").eq("season_id", season!.id).order("name");
      const ids = (churches ?? []).map((c: any) => c.id);
      const people = ids.length
        ? await fetchAll<any>("people", (q) =>
            q.select("church_id, name, lodging, gender, age_group, lodging_id").in("church_id", ids),
          )
        : [];
      const { data: lodgings } = await supabase
        .from("lodgings").select("id, name, gender").eq("season_id", season!.id);
      const result = { churches: churches ?? [], people, lodgings: lodgings ?? [] };
      writeCachedData(intakeKey, result);
      return result;
    },
    ...resilientQueryCache<any>(intakeKey),
  });

  const churches = data?.churches ?? [];
  const people = data?.people ?? [];
  const lodgingMap = new Map((data?.lodgings ?? []).map((l: any) => [l.id, l]));

  const peopleByChurch = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const p of people) {
      const arr = m.get(p.church_id) ?? [];
      arr.push(p);
      m.set(p.church_id, arr);
    }
    return m;
  }, [people]);

  const trimmed = filter.trim();
  const filtered = churches.filter((c: any) => {
    if (!trimmed) return true;
    if (c.name?.includes(trimmed)) return true;
    return (peopleByChurch.get(c.id) ?? []).some((p: any) => p.name?.includes(trimmed));
  });
  const totalChecked = filtered.filter((c: any) => c.is_checked_in).length;
  const totalActual = filtered.reduce((s: number, c: any) => s + (c.actual_count ?? 0), 0);

  const updateCheck = useMutation({
    mutationFn: async ({ id, checked }: any) => {
      await supabase.from("churches").update({
        is_checked_in: checked,
        checked_in_at: checked ? new Date().toISOString() : null,
      }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intake"] }),
  });

  const updateActual = useMutation({
    mutationFn: async ({ id, count }: any) => {
      await supabase.from("churches").update({ actual_count: count }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intake"] }),
  });

  const removeChurch = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("churches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("삭제 완료");
      qc.invalidateQueries({ queryKey: ["intake"] });
    },
    onError: (e: any) => toast.error(e.message ?? "삭제 실패"),
  });

  if (!season) return <AppShell><div className="text-sm text-muted-foreground">시즌이 없습니다.</div></AppShell>;

  return (
    <AppShell>
      <div className="space-y-4">
        <header className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">접수시트</h1>
            <p className="text-sm text-muted-foreground">교회별 접수 체크 및 실접수 인원 기록</p>
          </div>
          <Input placeholder="교회명 / 이름 검색…" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-64" />
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="총 등록 교회" v={churches.length} unit="곳" />
          <Stat label="접수 완료" v={totalChecked} unit="곳" />
          <Stat label="실접수 총인원" v={totalActual} unit="명" />
          <Stat label="사전접수 총인원" v={people.length} unit="명" />
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm whitespace-nowrap">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="text-left px-3 py-2">교회명</th>
                <th className="text-left px-3 py-2">담당자</th>
                <th className="text-right px-3 py-2 w-20">사전</th>
                <th className="text-right px-3 py-2 w-20">숙박</th>
                <th className="text-right px-3 py-2 w-20">비숙박</th>
                <th className="text-left px-3 py-2">배정 숙소</th>
                <th className="text-left px-3 py-2 w-44">체크시각</th>
                <th className="text-center px-3 py-2 w-16">접수</th>
                <th className="text-right px-3 py-2 w-28">실접수</th>
                {isAdmin && <th className="px-2 py-2 w-28">관리</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c: any) => {
                const ps = peopleByChurch.get(c.id) ?? [];
                const lodgingCount = ps.filter((p) => p.lodging).length;
                const nonLodgingCount = ps.filter((p) => !p.lodging).length;
                const lodgingsForChurch = Array.from(new Set(ps.filter((p) => p.lodging_id).map((p) => p.lodging_id))) as string[];
                return (
                  <tr key={c.id} id={`church-row-${c.id}`} className={`border-t hover:bg-muted/30 transition-colors ${c.is_checked_in ? "intake-row-checked" : ""}`}>
                    <td className="px-3 py-2 font-medium">
                      {c.name}
                      {c.denomination && <span className="ml-1 text-[11px] text-muted-foreground">({c.denomination})</span>}
                      {c.source === "onsite" && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">현장</span>}
                      {trimmed && !c.name?.includes(trimmed) && (
                        <div className="text-[11px] text-emerald-600 mt-0.5">
                          매칭: {ps.filter((p: any) => p.name?.includes(trimmed)).map((p: any) => p.name).slice(0, 4).join(", ")}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div>{c.contact_name ?? "-"}</div>
                      <div className="text-muted-foreground">{c.phone ?? ""}</div>
                    </td>
                    <td className="text-right px-3 py-2 tabular-nums">{num(ps.length)}</td>
                    <td className="text-right px-3 py-2 tabular-nums text-sky-700">{num(lodgingCount)}</td>
                    <td className="text-right px-3 py-2 tabular-nums">{num(nonLodgingCount)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {lodgingsForChurch.map((lid: string) => {
                          const l = lodgingMap.get(lid) as any;
                          if (!l) return null;
                          const cls = l.gender === "M" ? "lodging-male" : l.gender === "F" ? "lodging-female" : "lodging-none";
                          return (
                            <span key={lid} className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] ${cls}`}>
                              <GenderBadge gender={l.gender} /> {l.name}
                            </span>
                          );
                        })}
                        {lodgingCount > 0 && lodgingsForChurch.length === 0 && (
                          <span className="text-xs text-muted-foreground">미배정</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{formatTime(c.checked_in_at)}</td>
                    <td className="text-center px-2 py-1">
                      <label className={`flex items-center justify-center h-12 w-full rounded-md cursor-pointer border-2 transition ${c.is_checked_in ? "bg-emerald-500 border-emerald-600" : "bg-background border-input hover:border-emerald-400"}`}>
                        <Checkbox
                          checked={c.is_checked_in}
                          onCheckedChange={(v) => {
                            if (!v && c.is_checked_in) {
                              setUncheckConfirm({ id: c.id, name: c.name ?? "" });
                            } else {
                              updateCheck.mutate({ id: c.id, checked: !!v });
                            }
                          }}
                          className="h-7 w-7 data-[state=checked]:bg-white data-[state=checked]:text-emerald-600 data-[state=checked]:border-white border-2"
                        />
                      </label>
                    </td>
                    <td className="text-right px-2 py-1">
                      {isTouch ? (
                        <Input
                          type="text"
                          inputMode="none"
                          readOnly
                          value={keypad && keypad.id === c.id ? keypad.value : (c.actual_count ?? "")}
                          onFocus={(e) => e.currentTarget.blur()}
                          onClick={() =>
                            setKeypad({
                              id: c.id,
                              name: c.name ?? "",
                              value: c.actual_count != null ? String(c.actual_count) : "",
                            })
                          }
                          className={`h-12 w-24 text-right tabular-nums text-lg font-semibold cursor-pointer ${keypad?.id === c.id ? "ring-2 ring-primary border-primary" : ""}`}
                        />
                      ) : (
                        <Input
                          key={`actual-${c.id}-${c.actual_count ?? "empty"}`}
                          type="number"
                          defaultValue={c.actual_count ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value === "" ? null : parseInt(e.target.value);
                            updateActual.mutate({ id: c.id, count: v });
                          }}
                          className="h-12 w-24 text-right tabular-nums text-lg font-semibold"
                        />

                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-2 py-1">
                        <div className="flex gap-1 justify-end">
                          <Link to="/registry" search={{ openChurch: c.id }} className="inline-flex h-8 w-8 items-center justify-center rounded border hover:bg-muted" title="접수명단에서 수정">
                            <Pencil className="h-3.5 w-3.5" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`'${c.name}' 교회를 삭제하시겠습니까? (연결된 명단도 함께 삭제됩니다)`)) {
                                removeChurch.mutate(c.id);
                              }
                            }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded border text-destructive hover:bg-destructive/10"
                            title="삭제"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={isAdmin ? 10 : 9} className="text-center py-10 text-sm text-muted-foreground">등록된 교회가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </Card>
      </div>
      <AlertDialog open={!!uncheckConfirm} onOpenChange={(o) => { if (!o) setUncheckConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>접수 체크 해제</AlertDialogTitle>
            <AlertDialogDescription>
              접수 체크를 해제하시겠습니까? 입력한 실접수 인원도 함께 초기화됩니다.
              {uncheckConfirm?.name ? ` (${uncheckConfirm.name})` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>아니오</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!uncheckConfirm) return;
                const id = uncheckConfirm.id;
                updateCheck.mutate({ id, checked: false });
                updateActual.mutate({ id, count: null });
                setUncheckConfirm(null);
              }}
            >
              예
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {keypad && (
        <NumericKeypad
          label={`${keypad.name} · 실접수인원`}
          value={keypad.value}
          onChange={(v) => setKeypad((k) => (k ? { ...k, value: v } : k))}
          onClose={() => setKeypad(null)}
          onSubmit={() => {
            const parsed = keypad.value === "" ? null : parseInt(keypad.value, 10);
            updateActual.mutate({ id: keypad.id, count: parsed });
            setKeypad(null);
          }}
        />
      )}
    </AppShell>
  );
}

function NumericKeypad({
  label, value, onChange, onSubmit, onClose,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const press = (d: string) => {
    if (value.length >= 5) return;
    if (value === "0") onChange(d);
    else onChange(value + d);
  };
  const back = () => onChange(value.slice(0, -1));
  const keys = ["1","2","3","4","5","6","7","8","9"];
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="flex-1 bg-black/30 backdrop-blur-[1px]"
      />
      <div
        className="bg-background border-t shadow-2xl animate-in slide-in-from-bottom duration-200 px-3 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="text-sm font-semibold truncate">{label}</div>
          <div className="text-2xl font-bold tabular-nums min-w-16 text-right">{value || "0"}</div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              className="h-14 min-h-11 rounded-lg border bg-card hover:bg-muted active:bg-muted/70 text-2xl font-semibold tabular-nums"
            >
              {k}
            </button>
          ))}
          <button
            type="button"
            onClick={back}
            className="h-14 min-h-11 rounded-lg border bg-card hover:bg-muted active:bg-muted/70 text-lg font-medium"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => press("0")}
            className="h-14 min-h-11 rounded-lg border bg-card hover:bg-muted active:bg-muted/70 text-2xl font-semibold tabular-nums"
          >
            0
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="h-14 min-h-11 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 text-lg font-semibold"
          >
            입력
          </button>
        </div>
      </div>
    </div>
  );
}


function Stat({ label, v, unit }: { label: string; v: number; unit: string }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-xl font-bold tabular-nums">{num(v)}</span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </Card>
  );
}
