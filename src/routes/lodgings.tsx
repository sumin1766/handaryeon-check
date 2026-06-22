import { createFileRoute } from "@tanstack/react-router";
import { AppShell, GenderBadge } from "@/components/app-shell";
import { useActiveSeason } from "@/lib/use-active-season";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/use-realtime";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMemo, useState } from "react";
import { num } from "@/lib/format";
import { AlertTriangle, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/lodgings")({
  head: () => ({ meta: [{ title: "숙소배치 — 한다련 캠프" }] }),
  component: LodgingsPage,
});

function LodgingsPage() {
  const { season } = useActiveSeason();
  const qc = useQueryClient();
  useRealtimeInvalidate(["lodgings", "people", "churches"], [["lodgings-page", season?.id]]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["lodgings-page", season?.id],
    enabled: !!season?.id,
    queryFn: async () => {
      const { data: lodgings } = await supabase.from("lodgings").select("*").eq("season_id", season!.id).order("sort_order");
      const { data: churches } = await supabase.from("churches").select("id, name").eq("season_id", season!.id);
      const ids = (churches ?? []).map((c: any) => c.id);
      const { data: people } = ids.length
        ? await supabase.from("people").select("*").in("church_id", ids)
        : { data: [] };
      return { lodgings: lodgings ?? [], churches: churches ?? [], people: people ?? [] };
    },
  });

  const lodgings = data?.lodgings ?? [];
  const churches = data?.churches ?? [];
  const people = data?.people ?? [];
  const churchMap = new Map(churches.map((c: any) => [c.id, c.name]));

  const peopleByLodging = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const p of people) if (p.lodging_id) {
      const arr = m.get(p.lodging_id) ?? []; arr.push(p); m.set(p.lodging_id, arr);
    }
    return m;
  }, [people]);

  const totalCap = lodgings.filter((l: any) => l.active).reduce((s: number, l: any) => s + l.capacity, 0);
  const totalAssigned = lodgings.reduce((s: number, l: any) => s + (peopleByLodging.get(l.id)?.length ?? 0), 0);

  const groups = useMemo(() => {
    const g: Record<string, Record<string, any[]>> = {};
    for (const l of lodgings) {
      const b = l.building ?? "기타";
      const f = l.floor ?? "-";
      g[b] = g[b] ?? {};
      g[b][f] = g[b][f] ?? [];
      g[b][f].push(l);
    }
    return g;
  }, [lodgings]);

  // search
  const searchHits = useMemo(() => {
    if (!search.trim()) return null;
    const matching = churches.filter((c: any) => c.name.includes(search.trim()));
    const result = matching.map((c: any) => {
      const cp = people.filter((p: any) => p.church_id === c.id && p.lodging);
      const assigned = cp.filter((p: any) => p.lodging_id);
      const unassigned = cp.filter((p: any) => !p.lodging_id);
      return { church: c, assigned, unassigned };
    });
    return result;
  }, [search, churches, people]);

  if (!season) return <AppShell><div className="text-sm text-muted-foreground">시즌이 없습니다.</div></AppShell>;

  const selectedLodging = selected ? lodgings.find((l: any) => l.id === selected) : null;
  const selectedPeople = selected ? (peopleByLodging.get(selected) ?? []) : [];

  return (
    <AppShell>
      <div className="space-y-4">
        <header className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">숙소배치</h1>
            <p className="text-sm text-muted-foreground">카드를 클릭하여 명단 작성</p>
          </div>
          <Input placeholder="교회명 검색…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
        </header>

        <Card className="p-4">
          <div className="flex gap-6 text-sm tabular-nums">
            <span>전체 정원 <b className="text-lg">{num(totalCap)}</b>명</span>
            <span>배정 <b className="text-lg">{num(totalAssigned)}</b>명</span>
            <span>남은 자리 <b className="text-lg text-emerald-600">{num(totalCap - totalAssigned)}</b>명</span>
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {Object.keys(groups).map((building) => {
              const items = lodgings.filter((l: any) => (l.building ?? "기타") === building);
              const cap = items.filter((l: any) => l.active).reduce((s: number, l: any) => s + l.capacity, 0);
              const asg = items.reduce((s: number, l: any) => s + (peopleByLodging.get(l.id)?.length ?? 0), 0);
              return (
                <div key={building} className="rounded border bg-muted/30 px-3 py-2 text-sm tabular-nums">
                  <div className="font-semibold mb-0.5">{building}</div>
                  <div className="text-xs">정원 <b>{num(cap)}</b>명 / 배정 <b>{num(asg)}</b>명 / 남은 자리 <b className="text-emerald-600">{num(cap - asg)}</b>명</div>
                </div>
              );
            })}
          </div>
        </Card>

        {searchHits && (
          <Card className="p-4 space-y-2">
            <div className="text-sm font-semibold">검색 결과: "{search}"</div>
            {searchHits.length === 0 && <div className="text-xs text-muted-foreground">매칭 없음</div>}
            {searchHits.map((h: any) => (
              <div key={h.church.id} className="rounded border p-2 text-sm">
                <div className="font-medium">{h.church.name}</div>
                <div className="mt-1 text-xs">
                  <div>배정 {h.assigned.length}명 / 미배정 {h.unassigned.length}명</div>
                  {h.unassigned.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span className="text-muted-foreground">미배정:</span>
                      {h.unassigned.map((p: any) => (
                        <span key={p.id} className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">
                          <GenderBadge gender={p.gender} /> {p.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </Card>
        )}

        {Object.entries(groups).map(([building, floors]) => (
          <section key={building}>
            <h2 className="text-base font-semibold mb-2">{building}</h2>
            <div className="space-y-3">
              {Object.entries(floors).map(([floor, items]) => (
                <div key={floor}>
                  <div className="text-xs font-semibold text-muted-foreground mb-1.5">{floor}</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {items.map((l: any) => {
                      const ps = peopleByLodging.get(l.id) ?? [];
                      const pct = l.capacity ? Math.min(100, (ps.length / l.capacity) * 100) : 0;
                      const over = l.capacity > 0 && ps.length > l.capacity;
                      const cls = l.gender === "M" ? "lodging-male" : l.gender === "F" ? "lodging-female" : "lodging-none";
                      return (
                        <button
                          key={l.id}
                          onClick={() => setSelected(l.id)}
                          className={`group rounded-md border-2 p-3 text-left transition hover:shadow-md ${cls} ${!l.active ? "opacity-40" : ""}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-semibold text-sm">{l.name}</div>
                            <GenderBadge gender={l.gender} />
                          </div>
                          <div className="mt-1 flex items-baseline gap-1 tabular-nums">
                            <span className={`text-lg font-bold ${over ? "text-destructive" : ""}`}>{ps.length}</span>
                            <span className="text-xs text-muted-foreground">/ {l.capacity}</span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-background/60">
                            <div className={`h-full ${over ? "bg-destructive" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            남은 {Math.max(0, l.capacity - ps.length)}
                            {l.note && <span className="ml-1">· {l.note}</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selectedLodging && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <GenderBadge gender={selectedLodging.gender} /> {selectedLodging.name}
                </SheetTitle>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {selectedLodging.building} · {selectedLodging.floor} · 정원 {selectedLodging.capacity} / 현재 {selectedPeople.length}
                  {selectedPeople.length > selectedLodging.capacity && selectedLodging.capacity > 0 && (
                    <span className="ml-2 text-destructive font-semibold">정원 초과!</span>
                  )}
                </div>
              </SheetHeader>
              <AssignmentPanel
                lodging={selectedLodging}
                people={selectedPeople}
                churchMap={churchMap}
                allPeople={people}
                onChanged={() => qc.invalidateQueries({ queryKey: ["lodgings-page"] })}
                seasonId={season.id}
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function AssignmentPanel({ lodging, people, churchMap, allPeople, onChanged, seasonId }: any) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<any[]>([]);
  const [manualChurch, setManualChurch] = useState("");

  const search = (v: string) => {
    setQuery(v);
    if (!v.trim()) return setCandidates([]);
    const hits = allPeople.filter(
      (p: any) => p.name.includes(v.trim()) && p.lodging && p.lodging_id !== lodging.id,
    );
    setCandidates(hits.slice(0, 8));
  };

  const assign = async (personId: string) => {
    const p = allPeople.find((x: any) => x.id === personId);
    if (!p) return;
    if (lodging.gender && p.gender !== lodging.gender) {
      if (!confirm("성별이 일치하지 않습니다. 그래도 배정하시겠습니까?")) return;
    }
    await supabase.from("people").update({ lodging_id: lodging.id, lodging: true }).eq("id", personId);
    setQuery(""); setCandidates([]);
    toast.success("배정됨");
    onChanged();
  };

  const remove = async (personId: string) => {
    await supabase.from("people").update({ lodging_id: null }).eq("id", personId);
    toast.success("배정 해제");
    onChanged();
  };

  const addNew = async () => {
    if (!query.trim()) return;
    if (!manualChurch.trim()) {
      toast.error("교회명을 입력하세요");
      return;
    }
    const gender = lodging.gender ?? "M";
    // find or create church
    const { data: existing } = await supabase
      .from("churches").select("id").eq("season_id", seasonId).eq("name", manualChurch.trim()).maybeSingle();
    let churchId = existing?.id;
    if (!churchId) {
      const { data: c } = await supabase.from("churches").insert({
        season_id: seasonId, name: manualChurch.trim(), source: "onsite",
      }).select("id").single();
      churchId = c!.id;
    }
    await supabase.from("people").insert({
      church_id: churchId, name: query.trim(), gender, age_group: "student", lodging: true, lodging_id: lodging.id,
    });
    setQuery(""); setManualChurch(""); setCandidates([]);
    toast.success("새로 등록 및 배정");
    onChanged();
  };

  return (
    <div className="space-y-3 mt-4">
      <div className="space-y-2 rounded border p-2 bg-muted/30">
        <Input placeholder="이름으로 검색하여 배정…" value={query} onChange={(e) => search(e.target.value)} />
        {candidates.length > 0 && (
          <div className="space-y-1">
            {candidates.map((p) => {
              const mismatch = lodging.gender && p.gender !== lodging.gender;
              return (
                <button
                  key={p.id}
                  onClick={() => assign(p.id)}
                  className="w-full text-left rounded border px-2 py-1.5 text-sm hover:bg-accent flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <GenderBadge gender={p.gender} />
                    <b>{p.name}</b>
                    <span className="text-xs text-muted-foreground">{churchMap.get(p.church_id)}</span>
                    {mismatch && <AlertTriangle className="h-3 w-3 text-amber-600" />}
                  </span>
                  <Plus className="h-3 w-3" />
                </button>
              );
            })}
          </div>
        )}
        {query.trim() && candidates.length === 0 && (
          <div className="rounded border p-2 text-xs bg-background">
            <div className="text-muted-foreground mb-1">명단에 없습니다. 새로 등록:</div>
            <div className="flex gap-1">
              <Input placeholder="교회명" value={manualChurch} onChange={(e) => setManualChurch(e.target.value)} className="h-8 text-sm" />
              <Button size="sm" onClick={addNew}>등록</Button>
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="text-xs font-semibold text-muted-foreground mb-2">현재 배정 명단 ({people.length})</div>
        <div className="space-y-1">
          {people.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between rounded border bg-background px-2 py-1.5 text-sm">
              <span className="flex items-center gap-2">
                <GenderBadge gender={p.gender} />
                <b>{p.name}</b>
                {p.note && <span className="text-xs text-muted-foreground">({p.note})</span>}
                <span className="text-xs text-muted-foreground">— {churchMap.get(p.church_id)}</span>
              </span>
              <button onClick={() => remove(p.id)} className="text-muted-foreground hover:text-destructive">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          {people.length === 0 && <div className="text-xs text-muted-foreground py-3 text-center">아직 배정된 인원이 없습니다.</div>}
        </div>
      </div>
    </div>
  );
}
