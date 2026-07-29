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
import { num, krw, formatKst, kstDateOf, weekdayOf, weekdayOfDate, eachKstDateBetween, shortDate } from "@/lib/format";
import { useRealtimeInvalidate } from "@/lib/use-realtime";
import { useAuthRole } from "@/lib/use-auth-role";
import { Checkbox } from "@/components/ui/checkbox";
import { Pencil, Trash2 } from "lucide-react";

const ADULT_UNIT = 10000;
const DEFAULT_UNIT = 20000;

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
  const [segueOpen, setSegueOpen] = useState(false);
  const [segueDeptId, setSegueDeptId] = useState<string | null>(null);
  const [segueName, setSegueName] = useState("");
  const [segueGender, setSegueGender] = useState<"M" | "F">("M");
  const [segueLodging, setSegueLodging] = useState<boolean>(false);
  // Adult (어른성도) quick-add — all rows go into the single 세계로교회 record.
  const [adultOpen, setAdultOpen] = useState(false);
  const [adultName, setAdultName] = useState("");
  const [adultGender, setAdultGender] = useState<"M" | "F">("M");
  const [listSearch, setListSearch] = useState("");
  const [segueOnly, setSegueOnly] = useState(false);
  type SortMode = "default" | "latest" | "oldest";
  const SORT_STORAGE_KEY = "onsite-sort-order";
  const [sortMode, setSortModeState] = useState<SortMode>(() => {
    if (typeof window === "undefined") return "default";
    const v = window.localStorage.getItem(SORT_STORAGE_KEY);
    return v === "latest" || v === "oldest" || v === "default" ? v : "default";
  });
  const setSortMode = (v: SortMode) => {
    setSortModeState(v);
    try { window.localStorage.setItem(SORT_STORAGE_KEY, v); } catch {}
  };

  useRealtimeInvalidate(
    ["churches", "people", "lodgings", "church_payments"],
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
        ? await fetchAll<any>("people", (q) => q.select("church_id, lodging, age_group, created_at").in("church_id", ids))
        : [];
      const { data: payments } = await supabase
        .from("church_payments").select("*").eq("season_id", season!.id);
      return { churches: churches ?? [], people, payments: payments ?? [] };
    },
  });

  const upsertPayment = useMutation({
    mutationFn: async (payload: {
      church_id: string;
      patch: Partial<{
        paid_transfer: boolean; transfer_at: string | null;
        paid_cash: boolean; cash_at: string | null;
        amount: number;
      }>;
    }) => {
      const existing = (list.data?.payments ?? []).find((p: any) => p.church_id === payload.church_id);
      if (existing) {
        const { error } = await supabase.from("church_payments")
          .update({ ...payload.patch, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("church_payments").insert({
          church_id: payload.church_id,
          season_id: season!.id,
          paid_transfer: false, paid_cash: false, amount: 0,
          ...payload.patch,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onsite-list"] }),
    onError: (e: any) => toast.error(e.message ?? "결제 저장 실패"),
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

  // Segue (세계로) department churches for quick-add
  const segueDepts = useQuery({
    queryKey: ["onsite-segue-depts", season?.id],
    enabled: !!season?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("churches")
        .select("id, name, denomination, contact_name, phone")
        .eq("season_id", season!.id)
        .ilike("name", "%세계로%")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Single "세계로교회" (no denomination) record used to gather all 어른성도.
  const segueAdultChurch = useQuery({
    queryKey: ["onsite-segue-adult-church", season?.id],
    enabled: !!season?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("churches")
        .select("id, name, created_at")
        .eq("season_id", season!.id)
        .eq("name", "세계로교회")
        .is("denomination", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const quickAdd = useMutation({
    mutationFn: async () => {
      if (!segueDeptId) throw new Error("부서를 선택하세요");
      const nm = segueName.trim();
      if (!nm) throw new Error("이름을 입력하세요");
      const dept = (segueDepts.data ?? []).find((d: any) => d.id === segueDeptId);
      if (!dept) throw new Error("부서 정보 조회 실패");
      // 등록 건마다 새 세계로 계열 교회 레코드를 생성 (수동 취합 대상).
      const perChurchName = `${dept.name}(${nm})`;
      const { data: church, error: cErr } = await supabase.from("churches").insert({
        season_id: season!.id,
        name: perChurchName,
        denomination: dept.denomination ?? null,
        contact_name: dept.contact_name ?? null,
        phone: dept.phone ?? null,
        source: "onsite",
        is_checked_in: true,
        checked_in_at: new Date().toISOString(),
        actual_count: 1,
      }).select("id").single();
      if (cErr) throw cErr;
      const { data, error } = await supabase.from("people").insert({
        church_id: church.id,
        name: nm,
        gender: segueGender,
        age_group: "student",
        lodging: segueLodging,
      }).select("id, gender, lodging").single();
      if (error) throw error;
      return { inserted: data, churchName: perChurchName };
    },
    onSuccess: ({ inserted, churchName }) => {
      toast.success("추가됨");
      setSegueName("");
      if (inserted?.lodging) {
        const id = inserted.id as string;
        const g = inserted.gender as "M" | "F";
        setPendingLodging((prev) => {
          const base = prev && prev.churchName === churchName
            ? prev
            : { churchName, M: [], F: [] };
          return {
            churchName,
            M: g === "M" ? [...base.M, id] : base.M,
            F: g === "F" ? [...base.F, id] : base.F,
          };
        });
      }
      qc.invalidateQueries({ queryKey: ["onsite-list"] });
      qc.invalidateQueries({ queryKey: ["onsite-lodgings"] });
      qc.invalidateQueries({ queryKey: ["intake"] });
      qc.invalidateQueries({ queryKey: ["registry"] });
      qc.invalidateQueries({ queryKey: ["lodgings"] });
    },
    onError: (e: any) => toast.error(e.message ?? "추가 실패"),
  });

  const adultAdd = useMutation({
    mutationFn: async () => {
      const nm = adultName.trim();
      if (!nm) throw new Error("이름을 입력하세요");
      // 등록 건마다 새 "세계로교회(이름)" 레코드를 만든다. 통합은 취합 화면에서 수동 진행.
      const perChurchName = `세계로교회(${nm})`;
      const { data: church, error: cErr } = await supabase.from("churches").insert({
        season_id: season!.id,
        name: perChurchName,
        source: "onsite",
        is_checked_in: true,
        checked_in_at: new Date().toISOString(),
        actual_count: 1,
      }).select("id").single();
      if (cErr) throw cErr;
      const { error } = await supabase.from("people").insert({
        church_id: church.id,
        name: nm,
        gender: adultGender,
        age_group: "adult",
        lodging: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("어른성도 추가됨");
      setAdultName("");
      qc.invalidateQueries({ queryKey: ["onsite-list"] });
      qc.invalidateQueries({ queryKey: ["intake"] });
      qc.invalidateQueries({ queryKey: ["registry"] });
    },
    onError: (e: any) => toast.error(e.message ?? "추가 실패"),
  });

  if (!season) return <AppShell><div className="text-sm text-muted-foreground">시즌이 없습니다.</div></AppShell>;

  return (
    <AppShell>
      <div className="space-y-4">
        <header>
          <h1 className="text-2xl font-bold">현장접수</h1>
          <p className="text-sm text-muted-foreground">이름 입력 → 인원 자동 카운트. 공백/쉼표/줄바꿈으로 구분.</p>
        </header>

        {(() => {
          const churchesAll = list.data?.churches ?? [];
          const peopleAll = list.data?.people ?? [];
          const paymentsAll = list.data?.payments ?? [];
          // 어른 회비(1만원) 판정: 어른 빠른 등록 경로로 생성된 건만.
          // 어른 빠른 등록은 church 이름을 정확히 "세계로교회(이름)" 패턴으로 저장하고 age_group='adult'.
          // 교육부서 건은 부서명이 앞에 붙어 이 접두사와 매칭되지 않으므로 2만원으로 계산됨.
          const adultQuickChurchIds = new Set(
            churchesAll.filter((c: any) => (c.name ?? "").startsWith("세계로교회(")).map((c: any) => c.id),
          );
          const unitFor = (p: any) =>
            p.age_group === "adult" && adultQuickChurchIds.has(p.church_id) ? ADULT_UNIT : DEFAULT_UNIT;
          const totalExpected = peopleAll.reduce((s: number, p: any) => s + unitFor(p), 0);
          const paymentByChurch = new Map<string, any>();
          for (const pay of paymentsAll) paymentByChurch.set(pay.church_id, pay);
          const totalRecorded = paymentsAll.reduce((s: number, p: any) => s + (p.amount ?? 0), 0);
          const totalTransfer = paymentsAll
            .filter((p: any) => p.paid_transfer)
            .reduce((s: number, p: any) => s + (p.amount ?? 0), 0);
          const totalCash = paymentsAll
            .filter((p: any) => p.paid_cash)
            .reduce((s: number, p: any) => s + (p.amount ?? 0), 0);

          const BATH_WEEKDAYS = ["월", "화", "수", "목"] as const;
          const weekdayAgg = BATH_WEEKDAYS.map((w) => {
            const inDay = peopleAll.filter((p: any) => weekdayOf(p.created_at) === w);
            return {
              w,
              people: inDay.length,
              amount: inDay.reduce((s: number, p: any) => s + unitFor(p), 0),
            };
          });

          return (
            <div className="space-y-3">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <SummaryStat label="총 등록 인원" v={num(peopleAll.length)} unit="명" />
                <SummaryStat label="총 교회 수" v={num(churchesAll.length)} unit="교회" />
                <SummaryStat label="예상 회비 합계" v={krw(totalExpected)} />
                <SummaryStat label="실입금 합계" v={krw(totalRecorded)} />
                <SummaryStat label="입금 / 현금" v={`${krw(totalTransfer)} / ${krw(totalCash)}`} />
              </div>

              <Card className="p-3">
                <div className="text-lg font-bold mb-3">요일별 등록현황</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {weekdayAgg.map((d) => (
                    <div key={d.w} className="rounded border p-2 text-xs tabular-nums">
                      <div className="font-semibold text-sm">{d.w}요일</div>
                      <div>인원 {d.people}명</div>
                      <div>회비 {krw(d.amount)}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          );
        })()}


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

        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="text-base font-semibold">세계로 교육부서 빠른 등록</h2>
              <p className="text-xs text-muted-foreground">
                부서 선택 → 이름·성별만 입력. 교회명·교단·연락처는 부서 레코드 값이 유지됩니다.
              </p>
            </div>
            <Button variant={segueOpen ? "secondary" : "default"} onClick={() => setSegueOpen((v) => !v)}>
              {segueOpen ? "닫기" : "세계로 교육부서 신청"}
            </Button>
          </div>

          {segueOpen && (
            <div className="space-y-3">
              {(segueDepts.data?.length ?? 0) === 0 ? (
                <div className="text-xs text-muted-foreground px-3 py-4 border rounded bg-muted/30">
                  등록된 세계로 부서가 없습니다. 먼저 사전접수 또는 현장접수로 부서 레코드를 만들어주세요.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {segueDepts.data!.map((d: any) => {
                      const active = segueDeptId === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setSegueDeptId(d.id)}
                          className={`rounded-lg border px-3 py-2 text-sm transition ${
                            active
                              ? "border-primary bg-primary/10 text-foreground font-semibold"
                              : "hover:bg-muted/60"
                          }`}
                        >
                          {d.name}
                          {d.denomination && (
                            <span className="ml-1 text-[11px] text-muted-foreground">({d.denomination})</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
                    <div>
                      <Label className="text-xs">이름</Label>
                      <Input
                        value={segueName}
                        onChange={(e) => setSegueName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && segueDeptId && segueName.trim()) quickAdd.mutate();
                        }}
                        placeholder="학생 이름"
                        disabled={!segueDeptId}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">성별</Label>
                      <div className="flex gap-1">
                        {(["M", "F"] as const).map((g) => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setSegueGender(g)}
                            className={`h-9 px-4 rounded border text-sm ${
                              segueGender === g
                                ? "border-primary bg-primary/10 font-semibold"
                                : "hover:bg-muted/60"
                            }`}
                          >
                            {g === "M" ? "남" : "여"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">숙박</Label>
                      <div className="flex gap-1">
                        {([false, true] as const).map((v) => (
                          <button
                            key={String(v)}
                            type="button"
                            onClick={() => setSegueLodging(v)}
                            className={`h-9 px-4 rounded border text-sm ${
                              segueLodging === v
                                ? "border-primary bg-primary/10 font-semibold"
                                : "hover:bg-muted/60"
                            }`}
                          >
                            {v ? "숙박" : "비숙박"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Button
                      onClick={() => quickAdd.mutate()}
                      disabled={quickAdd.isPending || !segueDeptId || !segueName.trim()}
                    >
                      추가
                    </Button>
                  </div>
                  {!segueDeptId && (
                    <p className="text-[11px] text-muted-foreground">먼저 부서를 선택해주세요.</p>
                  )}
                </>
              )}
            </div>
          )}
        </Card>

        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="text-base font-semibold">세계로 어른성도 빠른 등록</h2>
              <p className="text-xs text-muted-foreground">
                부서 구분 없이 "세계로교회" 단일 레코드에 모두 모입니다. 전원 비숙박.
              </p>
            </div>
            <Button variant={adultOpen ? "secondary" : "default"} onClick={() => setAdultOpen((v) => !v)}>
              {adultOpen ? "닫기" : "세계로 어른성도 신청"}
            </Button>
          </div>

          {adultOpen && (
            <div className="space-y-3">
              {!segueAdultChurch.data ? (
                <div className="text-xs text-muted-foreground px-3 py-4 border rounded bg-muted/30">
                  "세계로교회" (부서 없음) 통합 레코드를 찾지 못했습니다. 접수명단에서 먼저 만들어주세요.
                </div>
              ) : (
                <>
                  <div className="text-[11px] text-muted-foreground">
                    대상 레코드: <b className="text-foreground">세계로교회</b>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
                    <div>
                      <Label className="text-xs">이름</Label>
                      <Input
                        value={adultName}
                        onChange={(e) => setAdultName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && adultName.trim()) adultAdd.mutate();
                        }}
                        placeholder="어른성도 이름"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">성별</Label>
                      <div className="flex gap-1">
                        {(["M", "F"] as const).map((g) => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setAdultGender(g)}
                            className={`h-9 px-4 rounded border text-sm ${
                              adultGender === g
                                ? "border-primary bg-primary/10 font-semibold"
                                : "hover:bg-muted/60"
                            }`}
                          >
                            {g === "M" ? "남" : "여"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Button
                      onClick={() => adultAdd.mutate()}
                      disabled={adultAdd.isPending || !adultName.trim()}
                    >
                      추가
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
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
          {(() => {
            const peopleAll = list.data?.people ?? [];
            const totalPeople = peopleAll.length;
            const totalLodging = peopleAll.filter((p: any) => p.lodging).length;
            const seasonDates = eachKstDateBetween(season?.start_date, season?.end_date);
            const byDate = new Map<string, number>();
            let unknown = 0;
            for (const p of peopleAll) {
              const d = kstDateOf(p.created_at);
              if (!d || !seasonDates.includes(d)) { unknown++; continue; }
              byDate.set(d, (byDate.get(d) ?? 0) + 1);
            }
            return (
              <>
                <div className="bg-muted/40 px-4 py-3 border-b flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="text-sm font-semibold">
                        현장접수 등록 명단 ({list.data?.churches.length ?? 0}교회 · {totalPeople}명)
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        숙박 {totalLodging}명 · 비숙박 {totalPeople - totalLodging}명 · 상세 수정은 "접수 명단" 페이지에서 가능합니다.
                      </p>
                    </div>
                    <Input
                      value={listSearch}
                      onChange={(e) => setListSearch(e.target.value)}
                      placeholder="교회명 / 담당자 / 전화번호"
                      className="h-8 w-full sm:w-64 text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs cursor-pointer hover:bg-muted/40 transition">
                      <input
                        type="checkbox"
                        checked={segueOnly}
                        onChange={(e) => setSegueOnly(e.target.checked)}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      세계로교회만 보기
                    </label>
                    <div className="flex items-center gap-1">
                      {[
                        { key: "default", label: "기본순" },
                        { key: "latest", label: "최신 등록 순" },
                        { key: "oldest", label: "오래된 등록 순" },
                      ].map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setSortMode(opt.key as typeof sortMode)}
                          className={`rounded border px-2 py-1 text-xs transition ${
                            sortMode === opt.key
                              ? "border-primary bg-primary/10 text-foreground font-semibold"
                              : "hover:bg-muted/40"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="px-4 py-2 border-b bg-background/50 flex flex-wrap gap-1.5">
                  {seasonDates.length === 0 ? (
                    <span className="text-xs text-muted-foreground">시즌 기간이 설정되지 않았습니다.</span>
                  ) : (
                    seasonDates.map((d) => {
                      const n = byDate.get(d) ?? 0;
                      const w = weekdayOfDate(d);
                      return (
                        <span
                          key={d}
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs tabular-nums ${
                            n > 0 ? "bg-primary/10 border-primary/30 font-semibold" : "text-muted-foreground"
                          }`}
                        >
                          {shortDate(d)}({w}) <b className="tabular-nums">{n}</b>명
                        </span>
                      );
                    })
                  )}
                  {unknown > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground">
                      미상 {unknown}명
                    </span>
                  )}
                </div>
              </>
            );
          })()}

          {(() => {
            const churches = list.data?.churches ?? [];
            const peopleAll = list.data?.people ?? [];
            const payments = list.data?.payments ?? [];
            const paymentByChurch = new Map<string, any>();
            for (const p of payments) paymentByChurch.set(p.church_id, p);
            // 어른 회비(1만원) 판정: 어른 빠른 등록으로 생성된 "세계로교회(이름)" 접두사 church만.
            const adultQuickChurchIds = new Set(
              churches.filter((c: any) => (c.name ?? "").startsWith("세계로교회(")).map((c: any) => c.id),
            );
            const feeOf = (churchId: string) => {
              const ps = peopleAll.filter((p: any) => p.church_id === churchId);
              let sum = 0;
              for (const p of ps) {
                const isAdultQuick = adultQuickChurchIds.has(churchId) && p.age_group === "adult";
                sum += isAdultQuick ? ADULT_UNIT : DEFAULT_UNIT;
              }
              return sum;
            };
            const latestByChurch = new Map<string, string | null>();
            for (const p of peopleAll) {
              const cur = latestByChurch.get(p.church_id);
              if (!cur || (p.created_at && p.created_at > cur)) {
                latestByChurch.set(p.church_id, p.created_at ?? cur ?? null);
              }
            }
            const trimmed = listSearch.trim();
            const digitsOnly = (s: string) => (s ?? "").replace(/\D+/g, "");
            const searchDigits = digitsOnly(trimmed);
            const isDigit = trimmed.length > 0 && searchDigits.length > 0 && /^[\d\s-]+$/.test(trimmed);
            const filtered = churches.filter((c: any) => {
              if (segueOnly && !c.name?.includes("세계로")) return false;
              if (!trimmed) return true;
              if (c.name?.includes(trimmed)) return true;
              if (c.contact_name?.includes(trimmed)) return true;
              if (isDigit && c.phone && digitsOnly(c.phone).includes(searchDigits)) return true;
              return false;
            });
            const sorted = [...filtered].sort((a: any, b: any) => {
              if (sortMode === "default") {
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
              }
              const ta = latestByChurch.get(a.id) ?? "";
              const tb = latestByChurch.get(b.id) ?? "";
              return sortMode === "latest" ? tb.localeCompare(ta) : ta.localeCompare(tb);
            });
            if (churches.length === 0) {
              return <div className="px-4 py-10 text-center text-sm text-muted-foreground">현장접수 내역이 없습니다.</div>;
            }
            const colCount = canManage ? 11 : 10;
            return (
              <>
                {(trimmed || segueOnly || sortMode !== "default") && (
                  <div className="px-4 py-2 text-xs text-muted-foreground border-b bg-muted/20 flex flex-wrap items-center gap-2">
                    <span>
                      검색 결과 <b className="text-foreground">{sorted.length}</b>교회
                    </span>
                    {isDigit && <span>· 전화번호는 숫자만 비교</span>}
                    {(segueOnly || sortMode !== "default") && (
                      <span className="text-[11px]">
                        {segueOnly && "세계로교회만"}
                        {segueOnly && sortMode !== "default" && " · "}
                        {sortMode === "latest" && "최신 등록 순"}
                        {sortMode === "oldest" && "오래된 등록 순"}
                      </span>
                    )}
                    <button onClick={() => { setListSearch(""); setSegueOnly(false); setSortMode("default"); }} className="ml-auto underline hover:text-foreground">초기화</button>
                  </div>
                )}
                <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead className="bg-muted/30 text-xs">
                    <tr>
                      <th className="text-left px-3 py-2">교회</th>
                      <th className="text-left px-3 py-2">담당자 / 연락처</th>
                      <th className="text-left px-3 py-2 w-40">등록시각</th>
                      <th className="text-right px-2 py-2">숙박</th>
                      <th className="text-right px-2 py-2">비숙박</th>
                      <th className="text-right px-2 py-2 bg-primary/5">총인원</th>
                      <th className="text-right px-2 py-2 w-24">예상회비</th>
                      <th className="text-right px-2 py-2 w-28">실입금</th>
                      <th className="text-center px-2 py-2 w-32">입금 / 송금시각</th>
                      <th className="text-center px-2 py-2 w-32">현금 / 납부시각</th>
                      {canManage && <th className="px-2 py-2 w-24"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((c: any) => {
                      const ps = peopleAll.filter((p: any) => p.church_id === c.id);
                      const lo = ps.filter((p: any) => p.lodging).length;
                      const no = ps.length - lo;
                      const expected = feeOf(c.id);
                      const pay = paymentByChurch.get(c.id);
                      const amount = pay?.amount ?? 0;
                      const matched = amount === expected && expected > 0;
                      const shortage = amount > 0 && amount < expected;
                      const overpaid = amount > expected && expected > 0;
                      const amountClass = matched
                        ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                        : shortage
                          ? "text-amber-600 dark:text-amber-400 font-semibold"
                          : overpaid
                            ? "text-sky-600 dark:text-sky-400 font-semibold"
                            : "";
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
                          <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                            {formatKst(latestByChurch.get(c.id) ?? null)}
                          </td>
                          <td className="text-right px-2 py-2 tabular-nums">{lo}</td>
                          <td className="text-right px-2 py-2 tabular-nums">{no}</td>
                          <td className="text-right px-2 py-2 font-semibold tabular-nums bg-primary/5">{ps.length}</td>
                          <td className="text-right px-2 py-2 tabular-nums text-xs">{krw(expected)}</td>
                          <td className="text-right px-2 py-2">
                            <Input
                              type="number"
                              defaultValue={amount || ""}
                              key={`${c.id}-${amount}`}
                              onBlur={(e) => {
                                const v = parseInt(e.target.value) || 0;
                                if (v !== amount) upsertPayment.mutate({ church_id: c.id, patch: { amount: v } });
                              }}
                              className={`h-8 w-full text-right tabular-nums ${amountClass}`}
                              placeholder="0"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex flex-col items-center gap-1">
                              <Checkbox
                                checked={!!pay?.paid_transfer}
                                onCheckedChange={(v) => upsertPayment.mutate({
                                  church_id: c.id,
                                  patch: { paid_transfer: !!v, transfer_at: v ? new Date().toISOString() : null },
                                })}
                              />
                              <span className="text-[10px] text-muted-foreground tabular-nums">
                                {formatKst(pay?.transfer_at ?? null)}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex flex-col items-center gap-1">
                              <Checkbox
                                checked={!!pay?.paid_cash}
                                onCheckedChange={(v) => upsertPayment.mutate({
                                  church_id: c.id,
                                  patch: { paid_cash: !!v, cash_at: v ? new Date().toISOString() : null },
                                })}
                              />
                              <span className="text-[10px] text-muted-foreground tabular-nums">
                                {formatKst(pay?.cash_at ?? null)}
                              </span>
                            </div>
                          </td>
                          {canManage && (
                            <td className="px-2 py-2">
                              <div className="flex gap-1.5 justify-end items-center">
                                <Link
                                  to="/registry"
                                  search={{ openChurch: c.id, from: "onsite" }}
                                  className="inline-flex h-8 px-3 items-center rounded border text-xs whitespace-nowrap hover:bg-muted"
                                >
                                  <Pencil className="h-3.5 w-3.5 mr-1" />수정
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(`'${c.name}' 현장접수를 삭제하시겠습니까?`)) remove.mutate(c.id);
                                  }}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded border text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {sorted.length === 0 && (
                      <tr><td colSpan={colCount} className="text-center py-10 text-sm text-muted-foreground">검색 결과가 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
                </div>
              </>
            );
          })()}
        </Card>
      </div>
    </AppShell>
  );
}

function SummaryStat({ label, v, unit }: { label: string; v: any; unit?: string }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-lg font-bold tabular-nums">{v}</span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
    </Card>
  );
}

