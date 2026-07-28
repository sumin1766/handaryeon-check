import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useActiveSeason } from "@/lib/use-active-season";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRealtimeInvalidate } from "@/lib/use-realtime";
import { useAuthRole } from "@/lib/use-auth-role";
import { formatKst } from "@/lib/format";
import { ArrowLeft, ArrowRight, Undo2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/segue-merge")({
  head: () => ({ meta: [{ title: "세계로교회 취합 — 한다련 캠프" }] }),
  component: SegueMergePage,
});

function SegueMergePage() {
  const { season } = useActiveSeason();
  const role = useAuthRole();
  const canEdit = role === "admin" || role === "staff";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  useRealtimeInvalidate(
    ["churches", "people", "segue_merge_log"],
    [["segue-merge", season?.id]],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["segue-merge", season?.id],
    enabled: !!season?.id,
    queryFn: async () => {
      const { data: churches } = await supabase
        .from("churches")
        .select("*")
        .eq("season_id", season!.id)
        .ilike("name", "%세계로%");
      const ids = (churches ?? []).map((c: any) => c.id);
      const people = ids.length
        ? await fetchAll<any>("people", (q) => q.select("*").in("church_id", ids))
        : [];
      const { data: log } = await supabase
        .from("segue_merge_log")
        .select("*")
        .eq("season_id", season!.id)
        .order("moved_at", { ascending: false })
        .limit(200);
      return { churches: churches ?? [], people, log: log ?? [] };
    },
  });

  const churches = data?.churches ?? [];
  const people = data?.people ?? [];
  const log = data?.log ?? [];

  // Integrated record: name === "세계로교회" AND denomination is null/empty
  const target = useMemo(
    () =>
      churches.find(
        (c: any) => c.name === "세계로교회" && (!c.denomination || c.denomination.trim() === ""),
      ),
    [churches],
  );

  const churchById = useMemo(() => new Map(churches.map((c: any) => [c.id, c])), [churches]);

  const trimmed = search.trim();
  const filterName = (n: string) => (!trimmed ? true : (n ?? "").includes(trimmed));

  const leftPeople = useMemo(
    () => (target ? people.filter((p: any) => p.church_id === target.id && filterName(p.name)) : []),
    [people, target, trimmed],
  );

  const rightPeople = useMemo(
    () => (target ? people.filter((p: any) => p.church_id !== target.id && filterName(p.name)) : []),
    [people, target, trimmed],
  );

  const rightByChurch = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const p of rightPeople) {
      const arr = m.get(p.church_id) ?? [];
      arr.push(p);
      m.set(p.church_id, arr);
    }
    return m;
  }, [rightPeople]);

  const moveToTarget = useMutation({
    mutationFn: async (person: any) => {
      if (!target) throw new Error("통합 세계로교회 레코드가 없습니다.");
      if (!season) throw new Error("시즌 없음");
      if (person.church_id === target.id) return;
      const fromChurchId = person.church_id;
      const { error: e1 } = await supabase
        .from("people")
        .update({ church_id: target.id })
        .eq("id", person.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("segue_merge_log").insert({
        season_id: season.id,
        person_id: person.id,
        from_church_id: fromChurchId,
        to_church_id: target.id,
      });
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["segue-merge"] });
      qc.invalidateQueries({ queryKey: ["registry"] });
    },
    onError: (e: any) => toast.error(e.message ?? "이동 실패"),
  });

  const undoMove = useMutation({
    mutationFn: async (entry: any) => {
      const { error: e1 } = await supabase
        .from("people")
        .update({ church_id: entry.from_church_id })
        .eq("id", entry.person_id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("segue_merge_log").delete().eq("id", entry.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["segue-merge"] });
      qc.invalidateQueries({ queryKey: ["registry"] });
      toast.success("되돌리기 완료");
    },
    onError: (e: any) => toast.error(e.message ?? "되돌리기 실패"),
  });

  if (!season) {
    return (
      <AppShell>
        <div className="text-sm text-muted-foreground">시즌이 없습니다.</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">세계로교회 취합</h1>
            <p className="text-sm text-muted-foreground">
              여러 세계로 관련 교회에 흩어진 인원을 통합 세계로교회 레코드로 이동 (소속만 변경, 삭제 아님)
            </p>
          </div>
          <Link to="/registry" className="inline-flex h-9 items-center gap-1 rounded border px-3 text-sm hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />접수 명단
          </Link>
        </header>

        {!target && !isLoading && (
          <Card className="p-4 border-destructive/50 text-sm text-destructive">
            통합 <b>"세계로교회"</b> (교단 없음) 레코드를 찾지 못했습니다. 접수 명단에서 먼저 만들어주세요.
          </Card>
        )}

        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="이름 검색 (양쪽 목록 동시 필터)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            {trimmed && (
              <button onClick={() => setSearch("")} className="text-xs text-muted-foreground hover:text-foreground">
                초기화
              </button>
            )}
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* LEFT: integrated record */}
          <Card className="p-4">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-lg font-bold">통합 세계로교회</h2>
              <span className="text-sm text-muted-foreground tabular-nums">{leftPeople.length}명</span>
            </div>
            {!target ? (
              <div className="text-sm text-muted-foreground">대상 없음</div>
            ) : leftPeople.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">아직 취합된 인원이 없습니다.</div>
            ) : (
              <ul className="divide-y">
                {leftPeople.map((p: any) => (
                  <li key={p.id} className="flex items-center justify-between py-1.5 text-sm">
                    <span>
                      <b>{p.name}</b>
                      {p.note && <span className="ml-1 text-xs text-muted-foreground">({p.note})</span>}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {p.gender} · {p.age_group} · {p.lodging ? "숙박" : "비숙박"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* RIGHT: other 세계로-named churches */}
          <Card className="p-4">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-lg font-bold">다른 세계로 교회 소속</h2>
              <span className="text-sm text-muted-foreground tabular-nums">{rightPeople.length}명</span>
            </div>
            {rightByChurch.size === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">이동할 인원이 없습니다.</div>
            ) : (
              <div className="space-y-4">
                {Array.from(rightByChurch.entries()).map(([cid, ps]) => {
                  const c = churchById.get(cid) as any;
                  return (
                    <div key={cid} className="rounded border p-2">
                      <div className="text-xs font-semibold mb-1.5">
                        {c?.name ?? "(교회 없음)"}
                        {c?.denomination && <span className="ml-1 text-[10px] text-muted-foreground">({c.denomination})</span>}
                        <span className="ml-2 text-[10px] text-muted-foreground">{ps.length}명</span>
                      </div>
                      <ul className="divide-y">
                        {ps.map((p: any) => (
                          <li key={p.id} className="flex items-center justify-between py-1.5 text-sm">
                            <span>
                              <b>{p.name}</b>
                              {p.note && <span className="ml-1 text-xs text-muted-foreground">({p.note})</span>}
                              <span className="ml-2 text-[10px] text-muted-foreground">
                                {p.gender}·{p.age_group}·{p.lodging ? "숙박" : "비숙박"}
                              </span>
                            </span>
                            {canEdit && target && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                disabled={moveToTarget.isPending}
                                onClick={() => moveToTarget.mutate(p)}
                                title="통합 세계로교회로 이동"
                              >
                                <ArrowLeft className="h-3.5 w-3.5 mr-1" />이동
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Recent moves log with undo */}
        <Card className="p-4">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-bold">최근 이동 이력</h2>
            <span className="text-xs text-muted-foreground">되돌리기 시 원래 소속으로 복원</span>
          </div>
          {log.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">이동 이력 없음</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs">
                  <tr>
                    <th className="text-left px-2 py-2">이동시각</th>
                    <th className="text-left px-2 py-2">인원</th>
                    <th className="text-left px-2 py-2">원래 소속</th>
                    <th className="text-center px-2 py-2 w-8"></th>
                    <th className="text-left px-2 py-2">이동 후</th>
                    {canEdit && <th className="w-24"></th>}
                  </tr>
                </thead>
                <tbody>
                  {log.map((e: any) => {
                    const person = people.find((p: any) => p.id === e.person_id);
                    const fromC = churchById.get(e.from_church_id) as any;
                    const toC = churchById.get(e.to_church_id) as any;
                    return (
                      <tr key={e.id} className="border-t">
                        <td className="px-2 py-1.5 text-xs tabular-nums">{formatKst(e.moved_at)}</td>
                        <td className="px-2 py-1.5">{person?.name ?? <span className="text-muted-foreground">(삭제됨)</span>}</td>
                        <td className="px-2 py-1.5 text-xs">{fromC?.name ?? "-"}</td>
                        <td className="px-2 py-1.5 text-center text-muted-foreground"><ArrowRight className="h-3 w-3 inline" /></td>
                        <td className="px-2 py-1.5 text-xs">{toC?.name ?? "-"}</td>
                        {canEdit && (
                          <td className="px-2 py-1.5 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              disabled={undoMove.isPending || !person}
                              onClick={() => undoMove.mutate(e)}
                              title="되돌리기"
                            >
                              <Undo2 className="h-3.5 w-3.5 mr-1" />되돌리기
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
