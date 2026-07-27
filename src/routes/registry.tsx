import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useActiveSeason } from "@/lib/use-active-season";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { resilientQueryCache, writeCachedData } from "@/lib/query-session-cache";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useRealtimeInvalidate } from "@/lib/use-realtime";
import { useAuthRole } from "@/lib/use-auth-role";
import { num } from "@/lib/format";
import { Plus, Trash2, Pencil, X, Save, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { findDuplicateGroups, type DuplicateGroup } from "@/lib/duplicate-check";
import { DuplicateBanner } from "@/components/duplicate-banner";
import { DuplicateCompareDialog } from "@/components/duplicate-compare-dialog";
import { DismissedPairsPanel } from "@/components/dismissed-pairs-panel";
import { useDuplicateDismissals } from "@/lib/use-duplicate-dismissals";

export const Route = createFileRoute("/registry")({
  head: () => ({ meta: [{ title: "접수 명단 — 한다련 캠프" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    openChurch: typeof s.openChurch === "string" ? s.openChurch : undefined,
  }),
  component: RegistryPage,
});

type CatKey = "ms_l" | "fs_l" | "ma_l" | "fa_l" | "ms_n" | "fs_n" | "ma_n" | "fa_n";
const CATS: { key: CatKey; label: string; short: string; gender: "M" | "F"; age: "student" | "adult"; lodging: boolean }[] = [
  { key: "ms_l", label: "남학생 (숙박)", short: "남학(숙)", gender: "M", age: "student", lodging: true },
  { key: "ms_n", label: "남학생 (비숙박)", short: "남학(비)", gender: "M", age: "student", lodging: false },
  { key: "fs_l", label: "여학생 (숙박)", short: "여학(숙)", gender: "F", age: "student", lodging: true },
  { key: "fs_n", label: "여학생 (비숙박)", short: "여학(비)", gender: "F", age: "student", lodging: false },
  { key: "ma_l", label: "남자어른 (숙박)", short: "남어(숙)", gender: "M", age: "adult", lodging: true },
  { key: "ma_n", label: "남자어른 (비숙박)", short: "남어(비)", gender: "M", age: "adult", lodging: false },
  { key: "fa_l", label: "여자어른 (숙박)", short: "여어(숙)", gender: "F", age: "adult", lodging: true },
  { key: "fa_n", label: "여자어른 (비숙박)", short: "여어(비)", gender: "F", age: "adult", lodging: false },
];

function catKeyOf(p: { gender: string; age_group: string; lodging: boolean }): CatKey | null {
  const found = CATS.find((c) => c.gender === p.gender && c.age === p.age_group && c.lodging === p.lodging);
  return found?.key ?? null;
}

type Person = { id?: string; name: string; note: string };

function RegistryPage() {
  const { season } = useActiveSeason();
  const role = useAuthRole();
  const canEdit = role === "admin" || role === "staff";
  const { openChurch } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [search, setSearch] = useState("");
  const [segueOnly, setSegueOnly] = useState(false);
  const [sortByName, setSortByName] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [compareGroup, setCompareGroup] = useState<DuplicateGroup | null>(null);
  const qc = useQueryClient();
  const registryKey = ["registry", season?.id] as const;


  const deleteChurch = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("churches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("삭제 완료");
      qc.invalidateQueries({ queryKey: ["registry"] });
      qc.invalidateQueries({ queryKey: ["pre-list"] });
      qc.invalidateQueries({ queryKey: ["intake"] });
    },
    onError: (e: any) => toast.error(e.message ?? "삭제 실패"),
  });

  useRealtimeInvalidate(["churches", "people"], [["registry", season?.id]]);

  const { data } = useQuery({
    queryKey: registryKey,
    enabled: !!season?.id,
    queryFn: async () => {
      const { data: churches } = await supabase
        .from("churches").select("*").eq("season_id", season!.id).order("created_at");
      const ids = (churches ?? []).map((c: any) => c.id);
      const people = ids.length
        ? await fetchAll<any>("people", (q) => q.select("*").in("church_id", ids))
        : [];
      const result = { churches: churches ?? [], people };
      writeCachedData(registryKey, result);
      return result;
    },
    ...resilientQueryCache<any>(registryKey),
  });

  const churches = data?.churches ?? [];
  const people = data?.people ?? [];

  const peopleByChurch = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const p of people) {
      const arr = m.get(p.church_id) ?? [];
      arr.push(p);
      m.set(p.church_id, arr);
    }
    return m;
  }, [people]);

  const churchById = useMemo(() => new Map(churches.map((c: any) => [c.id, c])), [churches]);

  useEffect(() => {
    if (openChurch && churchById.has(openChurch)) setOpenId(openChurch);
  }, [openChurch, churchById]);

  const dismissals = useDuplicateDismissals(season?.id);

  const duplicateGroups = useMemo(
    () => findDuplicateGroups(churches as any, people as any, dismissals.set),
    [churches, people, dismissals.set],
  );

  // Extended search: name / affiliation (church name + denomination) / phone (digits only)
  const trimmed = search.trim();
  const digitsOnly = (s: string) => (s ?? "").replace(/\D+/g, "");
  const searchDigits = digitsOnly(trimmed);
  const isDigitQuery = trimmed.length > 0 && searchDigits.length > 0 && /^[\d\s-]+$/.test(trimmed);

  const personMatches = (p: any, c: any) => {
    if (!trimmed) return false;
    if (p.name && p.name.includes(trimmed)) return true;
    if (c?.name && c.name.includes(trimmed)) return true;
    if (c?.denomination && c.denomination.includes(trimmed)) return true;
    if (c?.contact_name && c.contact_name.includes(trimmed)) return true;
    if (isDigitQuery && c?.phone && digitsOnly(c.phone).includes(searchDigits)) return true;
    return false;
  };

  const churchMatches = (c: any) => {
    if (!trimmed) return true;
    if (c.name && c.name.includes(trimmed)) return true;
    if (c.denomination && c.denomination.includes(trimmed)) return true;
    if (c.contact_name && c.contact_name.includes(trimmed)) return true;
    if (isDigitQuery && c.phone && digitsOnly(c.phone).includes(searchDigits)) return true;
    const ps = peopleByChurch.get(c.id) ?? [];
    if (ps.some((p: any) => p.name?.includes(trimmed))) return true;
    return false;
  };

  const nameMatches = trimmed
    ? people.filter((p: any) => personMatches(p, churchById.get(p.church_id)))
    : [];


  return (
    <AppShell>
      <div className="space-y-4">
        <header>
          <h1 className="text-2xl font-bold">접수 명단</h1>
          <p className="text-sm text-muted-foreground">
            사전접수 · 현장접수 통합 명단 · 이름 검색으로 소속 교회/담당자 확인
          </p>
        </header>

        <DuplicateBanner
          groups={duplicateGroups}
          onCompareGroup={(g) => setCompareGroup(g)}
          onDelete={canEdit ? (id) => deleteChurch.mutate(id) : undefined}
        />
        <DismissedPairsPanel
          rows={dismissals.rows}
          churchById={churchById as any}
          onRestore={(id) => dismissals.restore.mutate(id)}
        />

        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="이름 / 교회 / 교단 / 담당자 / 전화번호"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Button
              type="button"
              variant={sortByName ? "default" : "outline"}
              size="sm"
              onClick={() => setSortByName((v) => !v)}
              className="whitespace-nowrap"
              title="교회명 가나다순 정렬 (렌더 순서만 변경)"
            >
              {sortByName ? "원래 순서" : "가나다순"}
            </Button>
            <Button
              type="button"
              variant={segueOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setSegueOnly((v) => !v)}
              className="whitespace-nowrap"
            >
              {segueOnly ? (
                <>
                  <span className="hidden sm:inline">전체 교회 보기</span>
                  <span className="sm:hidden">전체 보기</span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">세계로교회만 보기</span>
                  <span className="sm:hidden">세계로만</span>
                </>
              )}
            </Button>
            {trimmed && (
              <button onClick={() => setSearch("")} className="text-xs text-muted-foreground hover:text-foreground">초기화</button>
            )}
          </div>
          {trimmed && (
            <div className="text-xs text-muted-foreground px-1">
              검색어 <b className="text-foreground">"{search}"</b> · 인원 매칭 {nameMatches.length}명
              {isDigitQuery && <span className="ml-1">· 전화번호는 숫자만 비교</span>}
            </div>
          )}
          {trimmed && nameMatches.length > 0 && (
            <div className="rounded border bg-muted/30 p-2 space-y-1">
              <div className="text-[11px] text-muted-foreground px-1">이름 검색 결과 ({nameMatches.length}명)</div>
              {nameMatches.slice(0, 30).map((p: any) => {
                const c = churchById.get(p.church_id) as any;
                if (!c) return null;
                return (
                  <button
                    key={p.id}
                    onClick={() => setOpenId(c.id)}
                    className="flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-sm hover:bg-background"
                  >
                    <span className="font-medium">
                      {p.name}
                      {p.note && <span className="ml-1 text-xs text-muted-foreground">({p.note})</span>}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {c.name}
                      {c.contact_name && ` · ${c.contact_name}`}
                      {c.phone && ` · ${c.phone}`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="text-left px-3 py-2">교회</th>
                <th className="text-left px-3 py-2">담당자 / 연락처</th>
                <th className="text-center px-2 py-2">출처</th>
                {CATS.map((c) => (
                  <th key={c.key} className="text-right px-1.5 py-2">{c.short}</th>
                ))}
                <th className="text-right px-2 py-2 bg-primary/5">총인원</th>
                {canEdit && <th className="px-2 py-2 w-28"></th>}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const filtered = churches.filter((c: any) => {
                  const matchesSegue = !segueOnly || (c.name && c.name.includes("세계로"));
                  return churchMatches(c) && matchesSegue;
                });
                const ordered = sortByName
                  ? [...filtered].sort((a: any, b: any) => (a.name ?? "").localeCompare(b.name ?? "", "ko"))
                  : filtered;
                return ordered;
              })()
                .map((c: any) => {

                  const ps = peopleByChurch.get(c.id) ?? [];
                  const counts: Record<CatKey, number> = {
                    ms_l: 0, ms_n: 0, fs_l: 0, fs_n: 0, ma_l: 0, ma_n: 0, fa_l: 0, fa_n: 0,
                  };
                  for (const p of ps) {
                    const k = catKeyOf(p);
                    if (k) counts[k]++;
                  }
                  const matchedNames = trimmed
                    ? ps.filter((p: any) => p.name?.includes(trimmed)).map((p: any) => p.name)
                    : [];
                  return (
                    <tr
                      key={c.id}
                      className="border-t hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setOpenId(c.id)}
                    >
                      <td className="px-3 py-2 font-medium">
                        {c.name}
                        {c.denomination && <span className="ml-1 text-[11px] text-muted-foreground">({c.denomination})</span>}
                        {matchedNames.length > 0 && (
                          <div className="text-[11px] text-emerald-600 mt-0.5">
                            매칭: {matchedNames.slice(0, 4).join(", ")}{matchedNames.length > 4 ? "…" : ""}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div>{c.contact_name ?? "—"}</div>
                        <div className="text-muted-foreground">{c.phone ?? ""}</div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${c.source === "onsite" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>
                          {c.source === "onsite" ? "현장" : "사전"}
                        </span>
                      </td>
                      {CATS.map((cc) => (
                        <td key={cc.key} className="text-right px-1.5 py-2 tabular-nums">{counts[cc.key] || ""}</td>
                      ))}
                      <td className="text-right px-2 py-2 font-semibold tabular-nums bg-primary/5">{ps.length}</td>
                      {canEdit && (
                        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setOpenId(c.id)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              {churches.length === 0 && (
                <tr><td colSpan={canEdit ? 13 : 12} className="text-center py-10 text-sm text-muted-foreground">등록된 교회가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      {openId && churchById.has(openId) && (
        <ChurchDialog
          church={churchById.get(openId) as any}
          people={peopleByChurch.get(openId) ?? []}
          canEdit={canEdit}
          onClose={() => {
            setOpenId(null);
            if (openChurch) navigate({ search: {}, replace: true });
          }}
        />
      )}

      <DuplicateCompareDialog
        group={compareGroup}
        people={people as any}
        onClose={() => setCompareGroup(null)}
        onEdit={(id) => { setCompareGroup(null); setOpenId(id); }}
        onDelete={canEdit ? (id) => deleteChurch.mutate(id) : undefined}
        onDismissPair={(a, b) => dismissals.dismiss.mutate({ a, b })}
        editLabel="상세"
      />
    </AppShell>
  );
}

function ChurchDialog({
  church, people, canEdit, onClose,
}: { church: any; people: any[]; canEdit: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(church.name ?? "");
  const [denom, setDenom] = useState(church.denomination ?? "");
  const [contact, setContact] = useState(church.contact_name ?? "");
  const [phone, setPhone] = useState(church.phone ?? "");
  const [memo, setMemo] = useState(church.memo ?? "");

  const initial: Record<CatKey, Person[]> = {
    ms_l: [], ms_n: [], fs_l: [], fs_n: [], ma_l: [], ma_n: [], fa_l: [], fa_n: [],
  };
  for (const p of people) {
    const k = catKeyOf(p);
    if (k) initial[k].push({ id: p.id, name: p.name ?? "", note: p.note ?? "" });
  }
  const [cats, setCats] = useState<Record<CatKey, Person[]>>(initial);

  const total = (Object.values(cats) as Person[][]).reduce((s, arr) => s + arr.filter((p) => p.name.trim()).length, 0);

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("교회명 필수");
      const { error: eU } = await supabase.from("churches").update({
        name: name.trim(),
        denomination: denom || null,
        contact_name: contact || null,
        phone: phone || null,
        memo: memo || null,
      }).eq("id", church.id);
      if (eU) throw eU;

      // Replace people: delete all then re-insert
      const { error: eD } = await supabase.from("people").delete().eq("church_id", church.id);
      if (eD) throw eD;
      const rows: any[] = [];
      for (const c of CATS) {
        for (const p of cats[c.key]) {
          if (!p.name.trim()) continue;
          rows.push({
            church_id: church.id, name: p.name.trim(), note: p.note || null,
            gender: c.gender, age_group: c.age, lodging: c.lodging,
          });
        }
      }
      if (rows.length) {
        const { error: eI } = await supabase.from("people").insert(rows);
        if (eI) throw eI;
      }
    },
    onSuccess: () => {
      toast.success("저장 완료");
      qc.invalidateQueries({ queryKey: ["registry"] });
      qc.invalidateQueries({ queryKey: ["pre-list"] });
      qc.invalidateQueries({ queryKey: ["intake"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "저장 실패"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("churches").delete().eq("id", church.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("삭제 완료");
      qc.invalidateQueries({ queryKey: ["registry"] });
      qc.invalidateQueries({ queryKey: ["pre-list"] });
      qc.invalidateQueries({ queryKey: ["intake"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "삭제 실패"),
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {church.name}
            <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${church.source === "onsite" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>
              {church.source === "onsite" ? "현장" : "사전"}
            </span>
            <span className="ml-auto text-sm font-normal text-muted-foreground tabular-nums">총 {num(total)}명</span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">교회명</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
          </div>
          <div>
            <Label className="text-xs">교단</Label>
            <Input value={denom} onChange={(e) => setDenom(e.target.value)} disabled={!canEdit} />
          </div>
          <div>
            <Label className="text-xs">담당자</Label>
            <Input value={contact} onChange={(e) => setContact(e.target.value)} disabled={!canEdit} />
          </div>
          <div>
            <Label className="text-xs">전화번호</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">비고</Label>
            <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} disabled={!canEdit} className="min-h-[60px]" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          {CATS.map((c) => {
            const oppositeKey = CATS.find((x) => x.gender === c.gender && x.age === c.age && x.lodging !== c.lodging)!.key;
            const count = cats[c.key].filter((p) => p.name.trim()).length;
            const canMove = canEdit && count > 0;
            const moveLabel = c.lodging ? "→ 비숙박" : "→ 숙박";
            return (
              <div key={c.key} className="rounded border p-2">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="font-semibold text-sm">{c.label}</div>
                  <div className="flex items-center gap-2">
                    {canEdit && (
                      <button
                        type="button"
                        disabled={!canMove}
                        onClick={() => {
                          const moving = cats[c.key].filter((p) => p.name.trim());
                          if (moving.length === 0) return;
                          setCats({
                            ...cats,
                            [c.key]: [],
                            [oppositeKey]: [...cats[oppositeKey], ...moving],
                          });
                        }}
                        className="rounded border px-2 py-0.5 text-[11px] font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                        title={`${c.label} 전체를 ${moveLabel.replace("→ ", "")}으로 이동`}
                      >
                        {moveLabel}
                      </button>
                    )}
                    <span className="text-xs text-muted-foreground tabular-nums">{count}명</span>
                  </div>
                </div>
                <NameEditor
                  names={cats[c.key]}
                  canEdit={canEdit}
                  onChange={(ns) => setCats({ ...cats, [c.key]: ns })}
                />
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2 mt-3">
          {canEdit && (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive mr-auto"
              onClick={() => {
                if (confirm(`'${church.name}' 교회와 연결된 명단을 모두 삭제할까요?`)) remove.mutate();
              }}
              disabled={remove.isPending}
            >
              <Trash2 className="h-4 w-4 mr-1" /> 교회 삭제
            </Button>
          )}
          <Button variant="outline" onClick={onClose}><X className="h-4 w-4 mr-1" />닫기</Button>
          {canEdit && (
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="h-4 w-4 mr-1" />저장
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NameEditor({ names, onChange, canEdit }: { names: Person[]; onChange: (ns: Person[]) => void; canEdit: boolean }) {
  return (
    <div className="flex flex-wrap gap-1">
      {names.map((p, i) => (
        <div key={i} className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs">
          <Input
            value={p.name}
            onChange={(e) => {
              const copy = [...names];
              copy[i] = { ...p, name: e.target.value };
              onChange(copy);
            }}
            disabled={!canEdit}
            className="h-7 w-24 px-1.5 text-xs"
            placeholder="이름"
          />
          <Input
            value={p.note ?? ""}
            onChange={(e) => {
              const copy = [...names];
              copy[i] = { ...p, note: e.target.value };
              onChange(copy);
            }}
            disabled={!canEdit}
            className="h-7 w-20 px-1.5 text-xs"
            placeholder="학년/비고"
          />
          {canEdit && (
            <button
              type="button"
              onClick={() => onChange(names.filter((_, j) => j !== i))}
              className="text-muted-foreground hover:text-destructive"
              title="삭제"
            >
              ×
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <button
          type="button"
          onClick={() => onChange([...names, { name: "", note: "" }])}
          className="inline-flex items-center gap-1 rounded border border-dashed px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> 추가
        </button>
      )}
    </div>
  );
}
