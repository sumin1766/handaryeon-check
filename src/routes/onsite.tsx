import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useActiveSeason } from "@/lib/use-active-season";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { num } from "@/lib/format";
import { useRealtimeInvalidate } from "@/lib/use-realtime";
import { useAuthRole } from "@/lib/use-auth-role";
import { Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/onsite")({
  head: () => ({ meta: [{ title: "현장접수 — 한다련 캠프" }] }),
  component: OnsitePage,
});

type CatKey = "ms_l" | "fs_l" | "ma_l" | "fa_l" | "ms_n" | "fs_n" | "ma_n" | "fa_n";
const CATS: { key: CatKey; label: string; gender: "M" | "F"; age: "student" | "adult"; lodging: boolean }[] = [
  { key: "ms_l", label: "남학생 (숙박)", gender: "M", age: "student", lodging: true },
  { key: "fs_l", label: "여학생 (숙박)", gender: "F", age: "student", lodging: true },
  { key: "ma_l", label: "남자어른 (숙박)", gender: "M", age: "adult", lodging: true },
  { key: "fa_l", label: "여자어른 (숙박)", gender: "F", age: "adult", lodging: true },
  { key: "ms_n", label: "남학생 (비숙박)", gender: "M", age: "student", lodging: false },
  { key: "fs_n", label: "여학생 (비숙박)", gender: "F", age: "student", lodging: false },
  { key: "ma_n", label: "남자어른 (비숙박)", gender: "M", age: "adult", lodging: false },
  { key: "fa_n", label: "여자어른 (비숙박)", gender: "F", age: "adult", lodging: false },
];

function parseNames(s: string): { name: string; note?: string }[] {
  if (!s) return [];
  const tokens: string[] = [];
  let buf = "", depth = 0;
  for (const ch of s) {
    if (ch === "(") { depth++; buf += ch; }
    else if (ch === ")") { depth = Math.max(0, depth - 1); buf += ch; }
    else if (depth === 0 && /[\s,]/.test(ch)) { if (buf) tokens.push(buf); buf = ""; }
    else buf += ch;
  }
  if (buf) tokens.push(buf);
  return tokens.map((t) => {
    const m = t.match(/^(.+?)\(([^)]*)\)$/);
    return m ? { name: m[1].trim(), note: m[2].trim() } : { name: t.trim() };
  }).filter((p) => p.name);
}

function emptyForm() {
  const obj: Record<string, string> = { church: "", contact: "", phone: "" };
  for (const c of CATS) obj[c.key] = "";
  return obj;
}

function OnsitePage() {
  const { season } = useActiveSeason();
  const qc = useQueryClient();
  const role = useAuthRole();
  const canManage = role === "admin" || role === "staff";
  const [form, setForm] = useState(emptyForm());
  const [pendingLodging, setPendingLodging] = useState<{
    churchName: string;
    M: string[];
    F: string[];
  } | null>(null);

  useRealtimeInvalidate(
    ["churches", "people", "lodgings"],
    [["onsite-list", season?.id], ["onsite-lodgings", season?.id]],
  );

  const counts = CATS.map((c) => ({ ...c, n: parseNames(form[c.key]).length }));
  const lodgingTotal = counts.filter((c) => c.lodging).reduce((s, c) => s + c.n, 0);
  const nonLodgingTotal = counts.filter((c) => !c.lodging).reduce((s, c) => s + c.n, 0);
  const grand = lodgingTotal + nonLodgingTotal;

  const submit = useMutation({
    mutationFn: async () => {
      if (!season) throw new Error("시즌 없음");
      if (!form.church.trim()) throw new Error("교회명 필수");
      const { data: church, error } = await supabase.from("churches").insert({
        season_id: season.id,
        name: form.church.trim(),
        contact_name: form.contact || null,
        phone: form.phone || null,
        source: "onsite",
        is_checked_in: true,
        checked_in_at: new Date().toISOString(),
        actual_count: grand,
      }).select("id").single();
      if (error) throw error;
      const rows: any[] = [];
      for (const c of CATS) {
        for (const p of parseNames(form[c.key])) {
          rows.push({ church_id: church.id, name: p.name, note: p.note ?? null,
            gender: c.gender, age_group: c.age, lodging: c.lodging });
        }
      }
      let inserted: any[] = [];
      if (rows.length) {
        const { data: ins, error: e2 } = await supabase.from("people").insert(rows).select("id, gender, lodging");
        if (e2) throw e2;
        inserted = ins ?? [];
      }
      return { churchName: form.church.trim(), inserted };
    },
    onSuccess: ({ churchName, inserted }) => {
      toast.success("등록 완료");
      const M = inserted.filter((p) => p.lodging && p.gender === "M").map((p) => p.id);
      const F = inserted.filter((p) => p.lodging && p.gender === "F").map((p) => p.id);
      setForm(emptyForm());
      if (M.length || F.length) {
        setPendingLodging({ churchName, M, F });
      } else {
        setPendingLodging(null);
      }
      qc.invalidateQueries({ queryKey: ["onsite-list"] });
      qc.invalidateQueries({ queryKey: ["onsite-lodgings"] });
      qc.invalidateQueries({ queryKey: ["intake"] });
      qc.invalidateQueries({ queryKey: ["registry"] });
      qc.invalidateQueries({ queryKey: ["lodgings"] });
    },
    onError: (e: any) => toast.error(e.message ?? "등록 실패"),
  });

  // Lodgings + occupancy for the assignment UI (only used after save)
  const lodgingsQ = useQuery({
    queryKey: ["onsite-lodgings", season?.id],
    enabled: !!season?.id,
    queryFn: async () => {
      const { data: lodgings, error } = await supabase
        .from("lodgings").select("*").eq("season_id", season!.id).eq("active", true);
      if (error) throw error;
      const assigned = await fetchAll<any>("people", (q) =>
        (q as any).select("id, lodging_id, gender").not("lodging_id", "is", null),
      );
      return { lodgings: lodgings ?? [], assigned };
    },
  });

  const assign = useMutation({
    mutationFn: async (payload: { lodgingId: string; ids: string[] }) => {
      const { error } = await supabase
        .from("people")
        .update({ lodging_id: payload.lodgingId, lodging: true })
        .in("id", payload.ids);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["onsite-lodgings"] });
      qc.invalidateQueries({ queryKey: ["lodgings"] });
      qc.invalidateQueries({ queryKey: ["registry"] });
      qc.invalidateQueries({ queryKey: ["intake"] });
      // Remove assigned ids from pending
      setPendingLodging((prev) => {
        if (!prev) return prev;
        const set = new Set(vars.ids);
        const M = prev.M.filter((x) => !set.has(x));
        const F = prev.F.filter((x) => !set.has(x));
        if (!M.length && !F.length) return null;
        return { ...prev, M, F };
      });
    },
    onError: (e: any) => toast.error(e.message ?? "배치 실패"),
  });

  const list = useQuery({
    queryKey: ["onsite-list", season?.id],
    enabled: !!season?.id,
    queryFn: async () => {
      const { data: churches } = await supabase
        .from("churches").select("*").eq("season_id", season!.id).eq("source", "onsite").order("created_at", { ascending: false });
      const ids = (churches ?? []).map((c: any) => c.id);
      const people = ids.length
        ? await fetchAll<any>("people", (q) => q.select("church_id, lodging").in("church_id", ids))
        : [];
      return { churches: churches ?? [], people };
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("churches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("삭제 완료");
      qc.invalidateQueries({ queryKey: ["onsite-list"] });
      qc.invalidateQueries({ queryKey: ["intake"] });
      qc.invalidateQueries({ queryKey: ["registry"] });
    },
    onError: (e: any) => toast.error(e.message ?? "삭제 실패"),
  });

  if (!season) return <AppShell><div className="text-sm text-muted-foreground">시즌이 없습니다.</div></AppShell>;

  return (
    <AppShell>
      <div className="space-y-4">
        <header>
          <h1 className="text-2xl font-bold">현장접수</h1>
          <p className="text-sm text-muted-foreground">이름 입력 → 인원 자동 카운트. 공백/쉼표/줄바꿈으로 구분.</p>
        </header>

        <Card className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">교회명 *</Label>
              <Input value={form.church} onChange={(e) => setForm({ ...form, church: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">담당자</Label>
              <Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">전화번호</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {CATS.map((c) => {
              const n = parseNames(form[c.key]).length;
              return (
                <div key={c.key}>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs">{c.label}</Label>
                    <span className="text-xs tabular-nums text-muted-foreground">{n}명</span>
                  </div>
                  <Textarea
                    value={form[c.key]}
                    onChange={(e) => setForm({ ...form, [c.key]: e.target.value })}
                    placeholder="이름 (공백/쉼표/줄바꿈)"
                    className="min-h-[100px] text-sm"
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between rounded border bg-muted/40 px-3 py-2 text-sm tabular-nums">
            <div className="flex gap-4">
              <span>숙박 <b className="text-base">{num(lodgingTotal)}</b></span>
              <span>비숙박 <b className="text-base">{num(nonLodgingTotal)}</b></span>
            </div>
            <div className="text-lg font-bold">합계 {num(grand)}명</div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setForm(emptyForm())}>초기화</Button>
            <Button onClick={() => submit.mutate()} disabled={submit.isPending || !form.church.trim()}>등록</Button>
          </div>
        </Card>

        {pendingLodging && (pendingLodging.M.length > 0 || pendingLodging.F.length > 0) && (
          <Card className="p-5 space-y-4 border-primary/40">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">
                  숙소 배치 — <span className="text-primary">{pendingLodging.churchName}</span>
                </h2>
                <p className="text-xs text-muted-foreground">
                  숙박 인원을 성별에 맞는 방에 배치하세요. 빈자리 많은 순으로 표시됩니다.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPendingLodging(null)}>
                나중에
              </Button>
            </div>

            {(["M", "F"] as const).map((g) => {
              const pendingIds = pendingLodging[g];
              if (pendingIds.length === 0) return null;
              const label = g === "M" ? "남성" : "여성";
              const rooms = (lodgingsQ.data?.lodgings ?? [])
                .filter((l: any) => l.gender === g)
                .map((l: any) => {
                  const cur = (lodgingsQ.data?.assigned ?? []).filter(
                    (p: any) => p.lodging_id === l.id,
                  ).length;
                  const remain = Math.max(0, (l.capacity ?? 0) - cur);
                  return { ...l, cur, remain };
                })
                .filter((l: any) => l.remain > 0)
                .sort((a: any, b: any) => b.remain - a.remain);

              return (
                <div key={g} className="space-y-2">
                  <div className="text-sm font-medium">
                    {label} {pendingIds.length}명 · 배치할 방 선택
                  </div>
                  {rooms.length === 0 ? (
                    <div className="text-xs text-muted-foreground px-3 py-4 border rounded bg-muted/30">
                      배치 가능한 {label} 방이 없습니다.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {rooms.map((l: any) => {
                        const take = Math.min(pendingIds.length, l.remain);
                        const disabled = assign.isPending;
                        return (
                          <button
                            key={l.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => {
                              const ids = pendingIds.slice(0, take);
                              assign.mutate({ lodgingId: l.id, ids });
                              toast.success(
                                `${l.name} · ${label} ${ids.length}명 배정${
                                  pendingIds.length > ids.length
                                    ? ` (잔여 ${pendingIds.length - ids.length}명)`
                                    : ""
                                }`,
                              );
                            }}
                            className="text-left rounded-lg border p-3 hover:bg-muted/60 hover:border-primary transition disabled:opacity-50"
                          >
                            <div className="text-sm font-semibold truncate">{l.name}</div>
                            <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                              빈자리 <b className="text-foreground">{l.remain}</b> / 정원 {l.capacity}
                            </div>
                            {take < pendingIds.length && (
                              <div className="text-[11px] text-amber-600 mt-1">
                                {take}명만 배치 가능
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        )}



        <Card className="p-0 overflow-hidden">
          <div className="bg-muted/40 px-4 py-3 border-b">
            <h2 className="text-sm font-semibold">현장접수 등록 명단 ({list.data?.churches.length ?? 0}교회)</h2>
            <p className="text-xs text-muted-foreground">상세 수정은 "접수 명단" 페이지에서 가능합니다.</p>
          </div>
          {(list.data?.churches.length ?? 0) === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">현장접수 내역이 없습니다.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs">
                <tr>
                  <th className="text-left px-3 py-2">교회</th>
                  <th className="text-left px-3 py-2">담당자 / 연락처</th>
                  <th className="text-right px-3 py-2">숙박</th>
                  <th className="text-right px-3 py-2">비숙박</th>
                  <th className="text-right px-3 py-2 bg-primary/5">총인원</th>
                  {canManage && <th className="px-2 py-2 w-28"></th>}
                </tr>
              </thead>
              <tbody>
                {list.data!.churches.map((c: any) => {
                  const ps = list.data!.people.filter((p: any) => p.church_id === c.id);
                  const lo = ps.filter((p: any) => p.lodging).length;
                  const no = ps.length - lo;
                  return (
                    <tr key={c.id} className="border-t">
                      <td className="px-3 py-2 font-medium">
                        {c.name}
                        {c.denomination && <span className="ml-1 text-[11px] text-muted-foreground">({c.denomination})</span>}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div>{c.contact_name ?? "—"}</div>
                        <div className="text-muted-foreground">{c.phone ?? ""}</div>
                      </td>
                      <td className="text-right px-3 py-2 tabular-nums">{lo}</td>
                      <td className="text-right px-3 py-2 tabular-nums">{no}</td>
                      <td className="text-right px-3 py-2 font-semibold tabular-nums bg-primary/5">{ps.length}</td>
                      {canManage && (
                        <td className="px-2 py-2">
                          <div className="flex gap-1 justify-end">
                            <Link to="/registry" className="inline-flex h-7 px-2 items-center rounded border text-xs hover:bg-muted">
                              <Pencil className="h-3 w-3 mr-1" />수정
                            </Link>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`'${c.name}' 현장접수를 삭제하시겠습니까?`)) remove.mutate(c.id);
                              }}
                              className="inline-flex h-7 w-7 items-center justify-center rounded border text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
