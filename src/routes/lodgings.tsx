import { createFileRoute } from "@tanstack/react-router";
import { AppShell, GenderBadge } from "@/components/app-shell";
import { useActiveSeason } from "@/lib/use-active-season";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { useRealtimeInvalidate } from "@/lib/use-realtime";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useMemo, useRef, useState, useCallback } from "react";
import { num } from "@/lib/format";
import { X, ChevronDown, ChevronUp, Download, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { downloadRowsAsXlsx } from "@/lib/export-xlsx";

// 배치률 1차 목표선 — 필요 시 여기만 조정
const TARGET_PCT = 80;

export const Route = createFileRoute("/lodgings")({
  head: () => ({ meta: [{ title: "숙소배치 — 한다련 캠프" }] }),
  component: LodgingsPage,
});

type DragPayload = { churchId: string; gender: "M" | "F" };
type MultiDragPayload = { multi: true; items: DragPayload[] };

function LodgingsPage() {
  const { season } = useActiveSeason();
  const qc = useQueryClient();
  useRealtimeInvalidate(["lodgings", "people", "churches"], [["lodgings-page", season?.id]]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [flipped, setFlipped] = useState<string | null>(null); // `${churchId}:${gender}`
  const [pickMode, setPickMode] = useState<DragPayload | null>(null);
  const retryRef = useRef<Set<string>>(new Set()); // `${churchId}:${gender}:${lodgingId}` previously warned
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const roomRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [notesOpen, setNotesOpen] = useState(false);
  const [sortMode, setSortMode] = useState<"name" | "count-desc" | "count-asc">("count-desc");
  const [copied, setCopied] = useState(false);
  // 다중 선택 (미배치 교회 카드) — key = `${churchId}:${gender}`
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const lastClickRef = useRef<{ section: "M" | "F"; key: string } | null>(null);
  // 정원 초과 배치 확인 대상
  type PendingAssign =
    | { kind: "single"; payload: DragPayload; lodging: any; incoming: number; remain: number }
    | { kind: "multi"; payloads: DragPayload[]; lodging: any; incoming: number; remain: number };
  const [pending, setPending] = useState<PendingAssign | null>(null);


  const { data } = useQuery({
    queryKey: ["lodgings-page", season?.id],
    enabled: !!season?.id,
    queryFn: async () => {
      const { data: lodgings } = await supabase.from("lodgings").select("*").eq("season_id", season!.id).order("sort_order");
      const { data: churches } = await supabase.from("churches").select("id, name, denomination, memo").eq("season_id", season!.id);
      const ids = (churches ?? []).map((c: any) => c.id);
      const people = ids.length
        ? await fetchAll<any>("people", (q) => q.select("*").in("church_id", ids))
        : [];
      return { lodgings: lodgings ?? [], churches: churches ?? [], people };
    },
  });

  const lodgings = data?.lodgings ?? [];
  const churches = data?.churches ?? [];
  const people = data?.people ?? [];
  const churchMap = useMemo(
    () => new Map(churches.map((c: any) => [c.id, c.denomination ? `${c.name}(${c.denomination})` : c.name])),
    [churches],
  );

  const peopleByLodging = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const p of people) if (p.lodging_id) {
      const arr = m.get(p.lodging_id) ?? []; arr.push(p); m.set(p.lodging_id, arr);
    }
    return m;
  }, [people]);

  // Unassigned (lodging=true && !lodging_id) grouped by church+gender
  const unassignedGroups = useMemo(() => {
    const byKey = new Map<string, { churchId: string; gender: "M" | "F"; persons: any[] }>();
    for (const p of people) {
      if (!p.lodging || p.lodging_id) continue;
      const g = p.gender === "F" ? "F" : "M";
      const key = `${p.church_id}:${g}`;
      const e = byKey.get(key) ?? { churchId: p.church_id, gender: g as "M" | "F", persons: [] as any[] };
      e.persons.push(p);
      byKey.set(key, e);
    }
    return Array.from(byKey.values());
  }, [people]);

  // Sort unassigned groups per selected mode (render-order only; source data unchanged).
  const sortGroups = useCallback(
    (arr: { churchId: string; gender: "M" | "F"; persons: any[] }[]) => {
      const copy = [...arr];
      if (sortMode === "name") {
        copy.sort((a, b) =>
          (churchMap.get(a.churchId) ?? "").localeCompare(churchMap.get(b.churchId) ?? "", "ko"),
        );
      } else if (sortMode === "count-desc") {
        copy.sort((a, b) => b.persons.length - a.persons.length);
      } else {
        copy.sort((a, b) => a.persons.length - b.persons.length);
      }
      return copy;
    },
    [sortMode, churchMap],
  );
  const unassignedM = sortGroups(unassignedGroups.filter((g) => g.gender === "M"));
  const unassignedF = sortGroups(unassignedGroups.filter((g) => g.gender === "F"));
  const unMCount = unassignedM.reduce((s, g) => s + g.persons.length, 0);
  const unFCount = unassignedF.reduce((s, g) => s + g.persons.length, 0);

  // Churches whose registration memo (교회 단위 비고) is non-blank — batch check before placement.
  const notesByChurch = useMemo(() => {
    return churches
      .map((c: any) => ({
        churchId: c.id as string,
        label: (c.denomination ? `${c.name}(${c.denomination})` : c.name) as string,
        memo: (c.memo ?? "").trim(),
      }))
      .filter((c) => c.memo.length > 0)
      .sort((a, b) => a.label.localeCompare(b.label, "ko"));
  }, [churches]);

  const totalCap = lodgings.filter((l: any) => l.active).reduce((s: number, l: any) => s + l.capacity, 0);
  const totalCapM = lodgings.filter((l: any) => l.active && l.gender === "M").reduce((s: number, l: any) => s + l.capacity, 0);
  const totalCapF = lodgings.filter((l: any) => l.active && l.gender === "F").reduce((s: number, l: any) => s + l.capacity, 0);
  const totalAssigned = lodgings.reduce((s: number, l: any) => s + (peopleByLodging.get(l.id)?.length ?? 0), 0);
  const totalAssignedM = people.filter((p: any) => p.lodging_id && p.gender === "M").length;
  const totalAssignedF = people.filter((p: any) => p.lodging_id && p.gender === "F").length;
  const pctAll = totalCap > 0 ? (totalAssigned / totalCap) * 100 : 0;
  const pctM = totalCapM > 0 ? (totalAssignedM / totalCapM) * 100 : 0;
  const pctF = totalCapF > 0 ? (totalAssignedF / totalCapF) * 100 : 0;
  const reachedGoal = pctAll >= TARGET_PCT;

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

  // Person-name search → returns rooms containing matches
  const nameSearchHits = useMemo(() => {
    const q = search.trim();
    if (!q) return null;
    const matches = people.filter((p: any) => p.name && p.name.includes(q) && p.lodging_id);
    const roomIds = new Set(matches.map((p: any) => p.lodging_id));
    return { matches, roomIds };
  }, [search, people]);

  const focusRoom = (id: string) => {
    setHighlightId(id);
    const el = roomRefs.current.get(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => setHighlightId((h) => (h === id ? null : h)), 2500);
  };

  const performAssign = useCallback(async (payload: DragPayload, lodging: any, mode: "ask" | "over" | "split" = "ask") => {
    const group = unassignedGroups.find((g) => g.churchId === payload.churchId && g.gender === payload.gender);
    if (!group || group.persons.length === 0) return;

    // Gender check
    if (lodging.gender && lodging.gender !== payload.gender) {
      const key = `${payload.churchId}:${payload.gender}:${lodging.id}`;
      if (!retryRef.current.has(key)) {
        retryRef.current.add(key);
        toast.warning(`성별이 다른 방입니다 (${lodging.gender === "M" ? "남성" : "여성"} 방). 다시 시도하면 강제 배정됩니다.`);
        return;
      }
      retryRef.current.delete(key);
    }

    // Capacity
    const current = peopleByLodging.get(lodging.id)?.length ?? 0;
    const remain = Math.max(0, (lodging.capacity ?? 0) - current);
    const incoming = group.persons.length;
    const hasCap = lodging.capacity > 0;
    const isOverflow = hasCap && incoming > remain;

    if (isOverflow && mode === "ask") {
      setPending({ kind: "single", payload, lodging, incoming, remain });
      return;
    }

    // Decide slots
    let slots: number;
    if (!hasCap) slots = incoming;
    else if (mode === "over") slots = incoming; // 초과 허용 — 전원 배정
    else slots = Math.min(remain, incoming); // split (또는 초과 아님)

    if (slots === 0) {
      toast.error("남은 자리가 없습니다.");
      return;
    }
    const ids = group.persons.slice(0, slots).map((p) => p.id);
    const { error } = await supabase.from("people").update({ lodging_id: lodging.id, lodging: true }).in("id", ids);
    if (error) return toast.error(error.message);
    const leftover = incoming - slots;
    const overNote = mode === "over" && isOverflow ? ` · 초과 ${incoming - remain}명` : "";
    toast.success(`${churchMap.get(payload.churchId)} · ${payload.gender === "M" ? "남" : "여"} ${slots}명 배정${leftover ? ` (잔여 ${leftover}명)` : ""}${overNote}`);
    qc.invalidateQueries({ queryKey: ["lodgings-page"] });
  }, [unassignedGroups, peopleByLodging, churchMap, qc]);

  const performAssignMulti = useCallback(async (payloads: DragPayload[], lodging: any, mode: "ask" | "over" | "split" = "ask") => {
    // Dedupe payloads by key
    const seen = new Set<string>();
    const uniq = payloads.filter((p) => {
      const k = `${p.churchId}:${p.gender}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    // 성별 방 정책: 성별 지정된 방이면 다른 성별 교회는 제외 (기존 단일 드래그의 정책과 정합)
    let effective = uniq;
    if (lodging.gender) {
      const before = effective.length;
      effective = effective.filter((p) => p.gender === lodging.gender);
      const excluded = before - effective.length;
      if (excluded > 0 && mode === "ask") {
        toast.warning(`${lodging.gender === "M" ? "남성" : "여성"} 방 — 다른 성별 ${excluded}개 교회 제외`);
      }
    }
    if (effective.length === 0) return;

    // Compute totals for overflow decision
    const current = peopleByLodging.get(lodging.id)?.length ?? 0;
    const hasCap = lodging.capacity > 0;
    const remain = hasCap ? Math.max(0, lodging.capacity - current) : Number.POSITIVE_INFINITY;
    let incomingTotal = 0;
    for (const p of effective) {
      const grp = unassignedGroups.find((g) => g.churchId === p.churchId && g.gender === p.gender);
      if (grp) incomingTotal += grp.persons.length;
    }
    const isOverflow = hasCap && incomingTotal > remain;

    if (isOverflow && mode === "ask") {
      setPending({ kind: "multi", payloads: effective, lodging, incoming: incomingTotal, remain: remain as number });
      return;
    }

    let remaining = mode === "over" ? Number.POSITIVE_INFINITY : remain;
    const ids: string[] = [];
    let assignedCount = 0;
    let leftover = 0;
    let assignedGroups = 0;
    for (const p of effective) {
      const grp = unassignedGroups.find((g) => g.churchId === p.churchId && g.gender === p.gender);
      if (!grp || grp.persons.length === 0) continue;
      const take = remaining === Number.POSITIVE_INFINITY ? grp.persons.length : Math.min(remaining, grp.persons.length);
      if (take > 0) {
        ids.push(...grp.persons.slice(0, take).map((x) => x.id));
        assignedCount += take;
        assignedGroups += 1;
        if (remaining !== Number.POSITIVE_INFINITY) remaining -= take;
      }
      leftover += grp.persons.length - take;
      if (remaining === 0 && mode !== "over") break;
    }
    if (ids.length === 0) {
      toast.error("남은 자리가 없습니다.");
      return;
    }
    const { error } = await supabase.from("people").update({ lodging_id: lodging.id, lodging: true }).in("id", ids);
    if (error) return toast.error(error.message);
    const overNote = mode === "over" && isOverflow ? ` · 초과 ${incomingTotal - (remain as number)}명` : "";
    toast.success(`${assignedGroups}개 교회 · ${assignedCount}명 배정${leftover ? ` (잔여 ${leftover}명)` : ""}${overNote}`);
    setSelectedKeys(new Set());
    lastClickRef.current = null;
    qc.invalidateQueries({ queryKey: ["lodgings-page"] });
  }, [unassignedGroups, peopleByLodging, churchMap, qc]);

  // 선택 요약 (선택된 교회 수 / 남·여 인원)
  const selectionSummary = useMemo(() => {
    if (selectedKeys.size === 0) return null;
    let m = 0, f = 0;
    for (const key of selectedKeys) {
      const g = unassignedGroups.find((x) => `${x.churchId}:${x.gender}` === key);
      if (!g) continue;
      if (g.gender === "M") m += g.persons.length;
      else f += g.persons.length;
    }
    return { count: selectedKeys.size, m, f, total: m + f };
  }, [selectedKeys, unassignedGroups]);

  // Prune stale selections when groups change (e.g., after assignment)
  const validKeys = useMemo(
    () => new Set(unassignedGroups.map((g) => `${g.churchId}:${g.gender}`)),
    [unassignedGroups],
  );
  if (selectedKeys.size > 0) {
    let stale = false;
    for (const k of selectedKeys) if (!validKeys.has(k)) { stale = true; break; }
    if (stale) {
      // Defer to avoid setState during render
      queueMicrotask(() => {
        setSelectedKeys((prev) => {
          const next = new Set<string>();
          for (const k of prev) if (validKeys.has(k)) next.add(k);
          return next;
        });
      });
    }
  }

  const handleCardSelect = useCallback((section: "M" | "F", sortedKeys: string[], key: string, e: React.MouseEvent) => {
    const isRange = e.shiftKey && lastClickRef.current && lastClickRef.current.section === section;
    const isMulti = e.ctrlKey || e.metaKey;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (isRange) {
        const anchor = lastClickRef.current!.key;
        const i1 = sortedKeys.indexOf(anchor);
        const i2 = sortedKeys.indexOf(key);
        if (i1 !== -1 && i2 !== -1) {
          const [lo, hi] = i1 < i2 ? [i1, i2] : [i2, i1];
          for (let i = lo; i <= hi; i++) next.add(sortedKeys[i]);
        } else {
          next.has(key) ? next.delete(key) : next.add(key);
        }
      } else if (isMulti) {
        next.has(key) ? next.delete(key) : next.add(key);
      } else {
        // Plain click / touch tap → 토글
        next.has(key) ? next.delete(key) : next.add(key);
      }
      return next;
    });
    if (!isRange) lastClickRef.current = { section, key };
  }, []);


  // 숙소별 교회 그룹핑 → CSV/엑셀 출력용 행
  const exportRows = useMemo(() => {
    const rows: {
      숙소: string;
      건물: string;
      층: string;
      성별: string;
      교회: string;
      남: number;
      여: number;
      인원: number;
    }[] = [];
    const sortedLodgings = [...lodgings].sort((a: any, b: any) => {
      const ab = String(a.building ?? "");
      const bb = String(b.building ?? "");
      if (ab !== bb) return ab.localeCompare(bb, "ko");
      const af = String(a.floor ?? "");
      const bf = String(b.floor ?? "");
      if (af !== bf) return af.localeCompare(bf, "ko");
      return String(a.name ?? "").localeCompare(String(b.name ?? ""), "ko");
    });
    for (const l of sortedLodgings) {
      const ps = peopleByLodging.get(l.id) ?? [];
      if (ps.length === 0) continue;
      const byChurch = new Map<string, any[]>();
      for (const p of ps) {
        const arr = byChurch.get(p.church_id) ?? [];
        arr.push(p);
        byChurch.set(p.church_id, arr);
      }
      const entries = Array.from(byChurch.entries()).sort((a, b) =>
        (churchMap.get(a[0]) ?? "").localeCompare(churchMap.get(b[0]) ?? "", "ko"),
      );
      for (const [cid, arr] of entries) {
        const m = arr.filter((p: any) => p.gender === "M").length;
        const f = arr.filter((p: any) => p.gender === "F").length;
        rows.push({
          숙소: l.name ?? "",
          건물: l.building ?? "",
          층: String(l.floor ?? ""),
          성별: l.gender === "M" ? "남" : l.gender === "F" ? "여" : "",
          교회: churchMap.get(cid) ?? "",
          남: m,
          여: f,
          인원: arr.length,
        });
      }
    }
    return rows;
  }, [lodgings, peopleByLodging, churchMap]);

  const downloadExcel = () => {
    if (exportRows.length === 0) {
      toast.error("배치된 인원이 없습니다.");
      return;
    }
    downloadRowsAsXlsx(exportRows, "숙소별 배치", `${season?.name ?? "숙소"}_숙소배치.xlsx`);
  };

  const copyCsv = async () => {
    if (exportRows.length === 0) {
      toast.error("배치된 인원이 없습니다.");
      return;
    }
    const escape = (v: string | number) =>
      String(v ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
    const headers = ["숙소", "건물", "층", "성별", "교회", "남", "여", "인원"];
    const header = headers.join("\t");
    const body = exportRows
      .map((r) => [r.숙소, r.건물, r.층, r.성별, r.교회, r.남, r.여, r.인원].map(escape).join("\t"))
      .join("\n");
    const text = `${header}\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("복사됨 — 구글 시트에 붙여넣으세요");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        toast.success("복사됨");
        setTimeout(() => setCopied(false), 1800);
      } catch {
        toast.error("복사 실패");
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  if (!season) return <AppShell><div className="text-sm text-muted-foreground">시즌이 없습니다.</div></AppShell>;

  const selectedLodging = selected ? lodgings.find((l: any) => l.id === selected) : null;
  const selectedPeople = selected ? (peopleByLodging.get(selected) ?? []) : [];

  return (
    <AppShell>
      <style>{`
        @keyframes lodging-blink { 0%,100%{box-shadow:0 0 0 0 hsl(var(--primary)/0.6)} 50%{box-shadow:0 0 0 6px hsl(var(--primary)/0.15)} }
        .lodging-blink { animation: lodging-blink 0.9s ease-in-out infinite; }
        .lodging-highlight { box-shadow: 0 0 0 3px hsl(var(--primary)); }
        .flip-card { perspective: 600px; }
        .flip-inner { transition: transform 0.4s; transform-style: preserve-3d; position: relative; }
        .flip-inner.is-flipped { transform: rotateY(180deg); }
        .flip-face { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
        .flip-back { position: absolute; inset: 0; transform: rotateY(180deg); }
      `}</style>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* LEFT 70% */}
        <div className="flex-1 min-w-0 space-y-4">
          {notesByChurch.length > 0 && (
            <Card className="p-0 overflow-hidden border-amber-400/40 bg-amber-50/50 dark:bg-amber-900/10">
              <button
                type="button"
                onClick={() => setNotesOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-amber-100/40 dark:hover:bg-amber-900/20"
              >
                <span className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                  비고 있는 교회 {notesByChurch.length}곳 — 배치 전 확인
                </span>
                {notesOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {notesOpen && (
                <div className="border-t border-amber-400/30 divide-y divide-amber-400/20">
                  {notesByChurch.map(({ churchId, label, memo }) => (
                    <div key={churchId} className="px-4 py-2.5 text-sm">
                      <div className="font-semibold mb-1.5">{label}</div>
                      <div className="rounded bg-amber-200/80 dark:bg-amber-700/50 px-2.5 py-1.5 text-xs font-semibold text-amber-950 dark:text-amber-50 whitespace-pre-wrap break-words">
                        {memo}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold">숙소배치</h1>
              <p className="text-sm text-muted-foreground">우측 카드 드래그 또는 더블클릭 → 방 선택</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input placeholder="이름/교회 검색…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
              <Button variant="outline" size="sm" onClick={copyCsv}>
                {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                {copied ? "복사됨" : "CSV 복사"}
              </Button>
              <Button size="sm" onClick={downloadExcel}>
                <Download className="h-4 w-4 mr-1" />엑셀 다운로드
              </Button>
            </div>
          </header>


          <Card className="p-4">
            <div className="flex gap-6 text-sm tabular-nums flex-wrap">
              <span>전체 정원 <b className="text-lg">{num(totalCap)}</b>명</span>
              <span>배정 <b className="text-lg">{num(totalAssigned)}</b>명</span>
              <span>남은 자리 <b className="text-lg text-emerald-600">{num(totalCap - totalAssigned)}</b>명</span>
            </div>

            {/* 방 배정률 프로그레스 — 목표 {TARGET_PCT}% */}
            <div className="mt-3 space-y-2">
              <ProgressGauge
                label="전체"
                assigned={totalAssigned}
                cap={totalCap}
                pct={pctAll}
                target={TARGET_PCT}
                emphasize
              />
              {(totalCapM > 0 || totalCapF > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {totalCapM > 0 && (
                    <ProgressGauge label="남자" assigned={totalAssignedM} cap={totalCapM} pct={pctM} target={TARGET_PCT} tone="male" />
                  )}
                  {totalCapF > 0 && (
                    <ProgressGauge label="여자" assigned={totalAssignedF} cap={totalCapF} pct={pctF} target={TARGET_PCT} tone="female" />
                  )}
                </div>
              )}
              {!reachedGoal && totalCap > 0 && (
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  목표 {TARGET_PCT}%까지 <b className="text-foreground">{Math.max(0, Math.ceil(totalCap * TARGET_PCT / 100) - totalAssigned)}</b>명 남음
                </div>
              )}
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

          {nameSearchHits && (
            <Card className="p-3 space-y-1.5">
              <div className="text-sm font-semibold">"{search}" 검색 결과 ({nameSearchHits.matches.length})</div>
              {nameSearchHits.matches.length === 0 && <div className="text-xs text-muted-foreground">해당 이름의 배정된 인원이 없습니다.</div>}
              <div className="flex flex-wrap gap-1.5">
                {nameSearchHits.matches.map((p: any) => {
                  const l = lodgings.find((x: any) => x.id === p.lodging_id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => focusRoom(p.lodging_id)}
                      className="rounded border bg-accent/40 px-2 py-1 text-xs hover:bg-accent"
                    >
                      <b>{p.name}</b> → {l?.name ?? "?"} <span className="text-muted-foreground">({churchMap.get(p.church_id)}, {p.gender === "M" ? "남" : "여"})</span>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          {Object.entries(groups).map(([building, floors]) => (
            <section key={building}>
              <h2 className="text-base font-semibold mb-2">{building}</h2>
              <div className="space-y-3">
                {Object.entries(floors).map(([floor, items]) => (
                  <div key={floor}>
                    <div className="text-xs font-semibold text-muted-foreground mb-1.5">{floor}</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                      {items.map((l: any) => {
                        const ps = peopleByLodging.get(l.id) ?? [];
                        const pctRaw = l.capacity ? (ps.length / l.capacity) * 100 : 0;
                        const pct = Math.min(100, pctRaw);
                        const over = l.capacity > 0 && ps.length > l.capacity;
                        const overBy = over ? ps.length - l.capacity : 0;
                        const cls = l.gender === "M" ? "lodging-male" : l.gender === "F" ? "lodging-female" : "lodging-none";
                        const isDragOver = dragOver === l.id;
                        const canPick = pickMode && (l.capacity ?? 0) - ps.length > 0;
                        const blink = pickMode ? canPick ? "lodging-blink" : "" : "";
                        const dim =
                          (nameSearchHits && !nameSearchHits.roomIds.has(l.id)) ||
                          (pickMode && !canPick);
                        const highlight =
                          highlightId === l.id ||
                          (nameSearchHits && nameSearchHits.roomIds.has(l.id))
                            ? "lodging-highlight"
                            : "";
                        return (
                          <button
                            key={l.id}
                            ref={(el) => { if (el) roomRefs.current.set(l.id, el); else roomRefs.current.delete(l.id); }}
                            onClick={() => {
                              if (pickMode) {
                                if (!canPick) return;
                                performAssign(pickMode, l);
                                setPickMode(null);
                                setFlipped(null);
                              } else {
                                setSelected(l.id);
                              }
                            }}
                            onDragOver={(e) => { e.preventDefault(); setDragOver(l.id); }}
                            onDragLeave={() => setDragOver((d) => (d === l.id ? null : d))}
                            onDrop={(e) => {
                              e.preventDefault();
                              setDragOver(null);
                              try {
                                const raw = e.dataTransfer.getData("application/json");
                                if (!raw) return;
                                const parsed = JSON.parse(raw) as DragPayload | MultiDragPayload;
                                if ((parsed as MultiDragPayload).multi) {
                                  performAssignMulti((parsed as MultiDragPayload).items, l);
                                } else {
                                  performAssign(parsed as DragPayload, l);
                                }
                              } catch { /* ignore */ }
                            }}

                            className={`group rounded-md border-2 p-3 text-left transition hover:shadow-md ${cls} ${!l.active ? "opacity-40" : ""} ${isDragOver ? "ring-2 ring-primary" : ""} ${blink} ${highlight} ${dim ? "opacity-40" : ""}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="font-semibold text-sm truncate">{l.name}</div>
                              <GenderBadge gender={l.gender} />
                            </div>
                            <div className="mt-1 flex items-baseline gap-1 tabular-nums">
                              <span className={`text-lg font-bold ${over ? "text-destructive" : ""}`}>{ps.length}</span>
                              <span className="text-xs text-muted-foreground">/ {l.capacity}</span>
                              {l.capacity > 0 ? (
                                <span className={`text-xs font-semibold ${pct >= 100 ? "text-emerald-600" : over ? "text-destructive" : "text-foreground"}`}>
                                  {pct.toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
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

        {/* RIGHT 30% — Unassigned panel */}
        <aside className="w-full lg:w-[340px] lg:sticky lg:top-4 lg:self-start">
          <Card className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">미배치 교회</div>
              <div className="text-xs tabular-nums text-muted-foreground">
                남 <b className="text-foreground">{unMCount}</b> · 여 <b className="text-foreground">{unFCount}</b>
              </div>
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-1 text-[11px]">
              <span className="text-muted-foreground mr-1">정렬:</span>
              {([
                ["count-desc", "미배치 많은 순"],
                ["count-asc", "미배치 적은 순"],
                ["name", "교회 가나다"],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSortMode(mode)}
                  className={`rounded border px-2 py-0.5 ${sortMode === mode ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {pickMode && (
              <div className="mb-2 rounded border border-primary/40 bg-primary/10 px-2 py-1.5 text-xs">
                <b>{churchMap.get(pickMode.churchId)}</b> · {pickMode.gender === "M" ? "남" : "여"} 배치할 방을 클릭하세요.
                <button onClick={() => { setPickMode(null); setFlipped(null); }} className="float-right text-muted-foreground hover:text-foreground">취소</button>
              </div>
            )}
            {selectionSummary && (
              <div className="mb-2 rounded border border-primary/40 bg-primary/10 px-2 py-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    교회 <b>{selectionSummary.count}</b>곳 선택 · 남 <b>{selectionSummary.m}</b> / 여 <b>{selectionSummary.f}</b> · 총 <b>{selectionSummary.total}</b>명
                  </span>
                  <button
                    onClick={() => { setSelectedKeys(new Set()); lastClickRef.current = null; }}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                  >
                    선택 해제
                  </button>
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  선택된 카드 중 하나를 드래그하면 함께 이동합니다. (Ctrl/⌘·Shift 클릭 지원)
                </div>
              </div>
            )}

            <UnassignedSection
              title="남자"
              tone="male"
              groups={unassignedM}
              churchMap={churchMap}
              flipped={flipped}
              setFlipped={setFlipped}
              onPick={(g) => { setPickMode(g); setFlipped(null); }}
              section="M"
              selectedKeys={selectedKeys}
              onCardSelect={handleCardSelect}
              selectionSummary={selectionSummary}
            />
            <div className="my-3 border-t" />
            <UnassignedSection
              title="여자"
              tone="female"
              groups={unassignedF}
              churchMap={churchMap}
              flipped={flipped}
              setFlipped={setFlipped}
              onPick={(g) => { setPickMode(g); setFlipped(null); }}
              section="F"
              selectedKeys={selectedKeys}
              onCardSelect={handleCardSelect}
              selectionSummary={selectionSummary}
            />


            {unassignedGroups.length === 0 && (
              <div className="text-xs text-muted-foreground py-4 text-center">전원 배정 완료 🎉</div>
            )}
          </Card>
        </aside>
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
              <RoomDetail
                lodging={selectedLodging}
                people={selectedPeople}
                churchMap={churchMap}
                onChanged={() => qc.invalidateQueries({ queryKey: ["lodgings-page"] })}
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function UnassignedSection({
  title, tone, groups, churchMap, flipped, setFlipped, onPick,
  section, selectedKeys, onCardSelect, selectionSummary,
}: {
  title: string;
  tone: "male" | "female";
  groups: { churchId: string; gender: "M" | "F"; persons: any[] }[];
  churchMap: Map<string, string>;
  flipped: string | null;
  setFlipped: (v: string | null) => void;
  onPick: (g: DragPayload) => void;
  section: "M" | "F";
  selectedKeys: Set<string>;
  onCardSelect: (section: "M" | "F", sortedKeys: string[], key: string, e: React.MouseEvent) => void;
  selectionSummary: { count: number; m: number; f: number; total: number } | null;
}) {
  const toneCls = tone === "male" ? "lodging-male" : "lodging-female";
  const sortedKeys = groups.map((g) => `${g.churchId}:${g.gender}`);
  return (
    <div>
      <div className="text-xs font-semibold mb-1.5 flex items-center justify-between">
        <span>{title}</span>
        <span className="text-muted-foreground tabular-nums">
          {groups.length} 교회 / {groups.reduce((s, g) => s + g.persons.length, 0)}명
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {groups.map((g) => {
          const key = `${g.churchId}:${g.gender}`;
          const isFlipped = flipped === key;
          const isSelected = selectedKeys.has(key);
          return (
            <div key={key} className="flip-card h-20">
              <div className={`flip-inner h-full ${isFlipped ? "is-flipped" : ""}`}>
                <div
                  draggable
                  onDragStart={(e) => {
                    // 선택된 카드에서 드래그 시작 & 2개 이상 선택 → 다중 페이로드
                    if (isSelected && selectedKeys.size > 1) {
                      const items: DragPayload[] = [];
                      for (const k of selectedKeys) {
                        const [churchId, gender] = k.split(":");
                        items.push({ churchId, gender: gender as "M" | "F" });
                      }
                      e.dataTransfer.setData("application/json", JSON.stringify({ multi: true, items }));
                    } else {
                      e.dataTransfer.setData("application/json", JSON.stringify({ churchId: g.churchId, gender: g.gender }));
                    }
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={(e) => {
                    // 좌클릭 → 선택 토글 (Ctrl/⌘/Shift 지원, 모바일 탭 포함)
                    onCardSelect(section, sortedKeys, key, e);
                  }}
                  onDoubleClick={() => setFlipped(isFlipped ? null : key)}
                  className={`flip-face h-full rounded-md border-2 p-2 cursor-grab active:cursor-grabbing select-none ${toneCls} ${isSelected ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""}`}
                  title="클릭 → 선택 · 드래그 → 방 배치 · 더블클릭 → 방 지정"
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="text-xs font-semibold truncate">{churchMap.get(g.churchId) ?? "?"}</div>
                    {isSelected && (
                      <span className="shrink-0 rounded-full bg-primary text-primary-foreground text-[9px] leading-none px-1.5 py-0.5">✓</span>
                    )}
                  </div>
                  <div className="mt-1 tabular-nums flex items-baseline justify-between">
                    <span>
                      <span className="text-lg font-bold">{g.persons.length}</span>
                      <span className="text-[10px] text-muted-foreground"> 명</span>
                    </span>
                    {isSelected && selectionSummary && selectionSummary.count > 1 && (
                      <span className="text-[9px] text-primary font-semibold">
                        +{selectionSummary.count - 1} 함께
                      </span>
                    )}
                  </div>
                </div>
                <div className={`flip-face flip-back h-full rounded-md border-2 border-primary bg-background p-2 flex flex-col items-center justify-center gap-1`}>
                  <div className="text-[10px] truncate w-full text-center">{churchMap.get(g.churchId)}</div>
                  <Button size="sm" className="h-7 px-2 text-xs" onClick={() => onPick({ churchId: g.churchId, gender: g.gender })}>
                    방 지정
                  </Button>
                  <button className="text-[10px] text-muted-foreground" onClick={() => setFlipped(null)}>닫기</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function RoomDetail({ lodging, people, churchMap, onChanged }: any) {
  const byChurch = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const p of people) {
      const arr = m.get(p.church_id) ?? []; arr.push(p); m.set(p.church_id, arr);
    }
    return Array.from(m.entries());
  }, [people]);

  const unassignOne = async (id: string) => {
    await supabase.from("people").update({ lodging_id: null }).eq("id", id);
    toast.success("배정 해제");
    onChanged();
  };
  const unassignGroup = async (churchId: string) => {
    const ids = people.filter((p: any) => p.church_id === churchId).map((p: any) => p.id);
    if (ids.length === 0) return;
    if (!confirm(`${churchMap.get(churchId)} ${ids.length}명을 모두 해제하시겠습니까?`)) return;
    await supabase.from("people").update({ lodging_id: null }).in("id", ids);
    toast.success(`${ids.length}명 해제`);
    onChanged();
  };
  const unassignAll = async () => {
    if (people.length === 0) return;
    if (!confirm(`방 전체 ${people.length}명을 해제하시겠습니까?`)) return;
    await supabase.from("people").update({ lodging_id: null }).eq("lodging_id", lodging.id);
    toast.success("전체 해제");
    onChanged();
  };

  return (
    <div className="space-y-3 mt-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground">교회별 배정 ({people.length}명)</div>
        {people.length > 0 && (
          <Button size="sm" variant="outline" onClick={unassignAll}>전체 해제</Button>
        )}
      </div>
      {byChurch.length === 0 && <div className="text-xs text-muted-foreground py-3 text-center">아직 배정된 인원이 없습니다.</div>}
      {byChurch.map(([churchId, ps]) => (
        <div key={churchId} className="rounded border bg-background">
          <div className="flex items-center justify-between px-2 py-1.5 border-b bg-muted/30">
            <div className="text-sm font-semibold">{churchMap.get(churchId)} <span className="text-xs text-muted-foreground">({ps.length}명)</span></div>
            <button onClick={() => unassignGroup(churchId)} className="text-xs text-muted-foreground hover:text-destructive">교회 전체 해제</button>
          </div>
          <div className="p-2 space-y-1">
            {ps.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-accent/30">
                <span className="flex items-center gap-2">
                  <GenderBadge gender={p.gender} />
                  <b>{p.name}</b>
                  {p.note && <span className="text-xs text-muted-foreground">({p.note})</span>}
                </span>
                <button onClick={() => unassignOne(p.id)} className="text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProgressGauge({
  label, assigned, cap, pct, target, emphasize, tone,
}: {
  label: string;
  assigned: number;
  cap: number;
  pct: number;
  target: number;
  emphasize?: boolean;
  tone?: "male" | "female";
}) {
  const reached = pct >= target;
  const width = Math.min(100, Math.max(0, pct));
  const barColor = reached
    ? "bg-emerald-500"
    : tone === "male"
      ? "bg-sky-500"
      : tone === "female"
        ? "bg-pink-400"
        : "bg-primary";
  return (
    <div className="space-y-1">
      <div className={`flex items-baseline justify-between gap-2 tabular-nums ${emphasize ? "text-sm" : "text-xs"}`}>
        <span className="font-semibold">
          {label}
          {reached && <span className="ml-1.5 text-[10px] rounded bg-emerald-500 text-white px-1.5 py-0.5 align-middle">목표 달성</span>}
        </span>
        <span className="text-muted-foreground">
          <b className="text-foreground">{num(assigned)}</b> / {num(cap)}명 · <b className={reached ? "text-emerald-600" : "text-foreground"}>{pct.toFixed(1)}%</b>
        </span>
      </div>
      <div className={`relative w-full overflow-hidden rounded bg-muted ${emphasize ? "h-3" : "h-2"}`}>
        <div className={`h-full transition-all duration-300 ${barColor}`} style={{ width: `${width}%` }} />
        {/* 목표선 마커 */}
        <div
          className="absolute top-0 bottom-0 w-px bg-foreground/50"
          style={{ left: `${target}%` }}
          title={`목표 ${target}%`}
        />
      </div>
    </div>
  );
}
