import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useActiveSeason } from "@/lib/use-active-season";
import { useEffect, useMemo, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  parsePreRegistration,
  totalCounts,
  countParsedNames,
  measureSourceLines,
  parsedCategoryCounts,
  CATEGORY_LABELS,
  CATEGORY_META,
  type CategoryKey,
  type CategoryBucket,
  type ParsedRegistration,
} from "@/lib/parsers/pre-registration-parser";
import { parseWithLlmOrFallback, type ParseStage } from "@/lib/parsers/llm-parser";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Save, Trash2, Plus, Pencil, X, Image as ImageIcon, Loader2, ScanText, Sparkles } from "lucide-react";
import { num } from "@/lib/format";
import { useRealtimeInvalidate } from "@/lib/use-realtime";
import { findDuplicateGroups, findDuplicateForInput, type DuplicateGroup } from "@/lib/duplicate-check";
import { DuplicateBanner } from "@/components/duplicate-banner";
import { DuplicateCompareDialog } from "@/components/duplicate-compare-dialog";

export const Route = createFileRoute("/pre-registration")({
  head: () => ({ meta: [{ title: "사전접수 — 한다련 캠프" }] }),
  component: PreRegistrationPage,
});

const SAMPLE = `1. 교회이름(교단) - 광주새순교회(합동)
2. 수련회 관련 계속 연락드릴 담당자(실제인솔자) 이름 및 연락처 - 이에스더 010-3170-3048
3. 교회 총 신청인원 - 숙박 총 0명 / 비숙박 총 4명
4. 신청인원 숫자 및 명단

(1)남학생(초중고청) - 숙박 0명, 비숙박 2명
(1-1)남학생 명단
  숙박자 - 0
  비숙박자 - 이신우(6학년) 이인우(4학년)

(2)여학생(초중고청) - 숙박 0명, 비숙박 0명
(2-1)여학생 명단
  숙박자 - 0
  비숙박자 - 0

(3)남자어른(교역자 교사 등) - 숙박 0명, 비숙박 0명
(3-1)남자어른 명단
  숙박자 - 0
  비숙박자 - 이베드로

(4)여자어른(교역자 교사 등) - 숙박 0명, 비숙박 1명
(4-1)여자어른 명단
  숙박자 - 0
  비숙박자 - 이에스더 본인`;

const KEYS: CategoryKey[] = ["male_student", "female_student", "male_adult", "female_adult"];

function emptyBucket(): CategoryBucket {
  return { lodging_count: 0, non_lodging_count: 0, lodging_names: [], non_lodging_names: [] };
}

function emptyParsed(): ParsedRegistration {
  return {
    church_name: "",
    denomination: "",
    contact_name: "",
    phone: "",
    categories: {
      male_student: emptyBucket(),
      female_student: emptyBucket(),
      male_adult: emptyBucket(),
      female_adult: emptyBucket(),
    },
    warnings: [],
    excluded: [],
  };
}

function metaToKey(gender: string, age: string): CategoryKey | null {
  for (const k of KEYS) {
    if (CATEGORY_META[k].gender === gender && CATEGORY_META[k].age_group === age) return k;
  }
  return null;
}

function PreRegistrationPage() {
  const { season } = useActiveSeason();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const parsedFromText = useMemo(() => parsePreRegistration(text), [text]);
  const [edited, setEdited] = useState<ParsedRegistration | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseStage, setParseStage] = useState<ParseStage | null>(null);
  const [parseNotice, setParseNotice] = useState<string | null>(null);
  const [compareGroup, setCompareGroup] = useState<DuplicateGroup | null>(null);
  const [nameFilter, setNameFilter] = useState("");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  useRealtimeInvalidate(["churches", "people", "app_settings"], [["pre-list"], ["pre-all"], ["pre_ocr_enabled"]]);

  const { data: ocrEnabled = false } = useQuery({
    queryKey: ["pre_ocr_enabled", season?.id],
    enabled: !!season?.id,
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("*").eq("season_id", season!.id).maybeSingle();
      return !!(data as any)?.ocr_enabled;
    },
  });

  const { data: allData } = useQuery({
    queryKey: ["pre-all", season?.id],
    enabled: !!season?.id,
    queryFn: async () => {
      const { data: churches } = await supabase
        .from("churches").select("*").eq("season_id", season!.id).order("created_at", { ascending: true });
      const ids = (churches ?? []).map((c: any) => c.id);
      const people = ids.length
        ? await fetchAll<any>("people", (q) => q.select("church_id, name").in("church_id", ids))
        : [];
      return { churches: churches ?? [], people };
    },
  });

  const current = edited ?? parsedFromText;
  const totals = totalCounts(current);

  const duplicateGroups = useMemo(
    () => findDuplicateGroups(allData?.churches ?? [], allData?.people ?? []),
    [allData],
  );

  const attemptSave = () => {
    const names: string[] = [];
    for (const k of KEYS) {
      const b = current.categories[k];
      for (const p of b.lodging_names) if (p.name?.trim()) names.push(p.name);
      for (const p of b.non_lodging_names) if (p.name?.trim()) names.push(p.name);
    }
    const dup = findDuplicateForInput({
      editingId,
      formName: current.church_name,
      formDenomination: current.denomination,
      formPersonNames: names,
      churches: allData?.churches ?? [],
      people: allData?.people ?? [],
    });
    if (dup) {
      toast.warning(
        `이미 등록된 교회일 수 있습니다 (${dup.church.name}${dup.church.denomination ? " · " + dup.church.denomination : ""}, 겹치는 명단 ${dup.overlapCount}명)`,
        { duration: 6000 },
      );
    }
    save.mutate();
  };




  const onParse = async () => {
    if (!text.trim() || parsing) return;
    setParsing(true);
    setParseNotice(null);
    try {
      const outcome = await parseWithLlmOrFallback(text);
      setEdited(outcome.parsed);
      setParseStage(outcome.stage);
      if (outcome.stage === "primary") {
        toast.success("기본 AI(2단계)로 파싱 완료 — 결과를 검토·수정 후 저장하세요.");
      } else if (outcome.stage === "backup") {
        toast.success("대용량 AI(3단계 백업)로 파싱 완료 — 결과를 검토·수정 후 저장하세요.");
      } else {
        setParseNotice(outcome.error ? `규칙 파서로 처리됨 — ${outcome.error}` : "규칙 파서로 처리됨 — 확인 필요");
        toast.warning("AI 파싱 실패 — 규칙 파서 결과를 확인하세요.");
      }
    } finally {
      setParsing(false);
    }
  };

  const resetForm = () => {
    setText("");
    setEdited(null);
    setEditingId(null);
    setParseStage(null);
    setParseNotice(null);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!season) throw new Error("활성 시즌이 없습니다");
      if (!current.church_name.trim()) throw new Error("교회 이름이 필요합니다");

      let churchId = editingId;
      if (editingId) {
        const { error: eu } = await supabase.from("churches").update({
          name: current.church_name.trim(),
          denomination: current.denomination || null,
          contact_name: current.contact_name || null,
          phone: current.phone || null,
        }).eq("id", editingId);
        if (eu) throw eu;
        await supabase.from("people").delete().eq("church_id", editingId);
      } else {
        const { data: church, error: e1 } = await supabase.from("churches").insert({
          season_id: season.id,
          name: current.church_name.trim(),
          denomination: current.denomination || null,
          contact_name: current.contact_name || null,
          phone: current.phone || null,
          source: "pre",
        }).select("id").single();
        if (e1) throw e1;
        churchId = church.id;
      }

      const rows: any[] = [];
      for (const k of KEYS) {
        const b = current.categories[k];
        const meta = CATEGORY_META[k];
        for (const p of b.lodging_names) {
          if (!p.name.trim()) continue;
          rows.push({ church_id: churchId, name: p.name, note: p.note ?? null,
            gender: meta.gender, age_group: meta.age_group, lodging: true });
        }
        for (const p of b.non_lodging_names) {
          if (!p.name.trim()) continue;
          rows.push({ church_id: churchId, name: p.name, note: p.note ?? null,
            gender: meta.gender, age_group: meta.age_group, lodging: false });
        }
      }
      console.info("[pre-registration:before-save]", {
        editingId,
        church: current.church_name,
        denomination: current.denomination,
        sourceLines: text ? measureSourceLines(text) : null,
        totals: countParsedNames(current),
        rowCount: rows.length,
        categoryCounts: parsedCategoryCounts(current),
        excludedCount: current.excluded.length,
        excluded: current.excluded,
      });
      if (rows.length) {
        const { error: e2 } = await supabase.from("people").insert(rows);
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "수정 완료" : "저장 완료");
      resetForm();
      qc.invalidateQueries({ queryKey: ["pre-list"] }); qc.invalidateQueries({ queryKey: ["pre-all"] });
    },
    onError: (e: any) => toast.error(e.message ?? "저장 실패"),
  });

  const deleteChurch = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("churches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("삭제 완료");
      qc.invalidateQueries({ queryKey: ["pre-list"] });
      qc.invalidateQueries({ queryKey: ["pre-all"] });
    },
    onError: (e: any) => toast.error(e.message ?? "삭제 실패"),
  });

  const loadForEdit = async (churchId: string) => {
    const { data: church } = await supabase.from("churches").select("*").eq("id", churchId).single();
    const { data: people } = await supabase.from("people").select("*").eq("church_id", churchId);
    if (!church) return;
    const parsed = emptyParsed();
    parsed.church_name = church.name ?? "";
    parsed.denomination = church.denomination ?? "";
    parsed.contact_name = church.contact_name ?? "";
    parsed.phone = church.phone ?? "";
    for (const p of people ?? []) {
      const k = metaToKey(p.gender, p.age_group);
      if (!k) continue;
      const b = parsed.categories[k];
      const entry = { name: p.name, note: p.note ?? undefined };
      if (p.lodging) b.lodging_names.push(entry);
      else b.non_lodging_names.push(entry);
    }
    for (const k of KEYS) {
      const b = parsed.categories[k];
      b.lodging_count = b.lodging_names.length;
      b.non_lodging_count = b.non_lodging_names.length;
    }
    setEditingId(churchId);
    setEdited(parsed);
    setText("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!season) return <AppShell><div className="text-sm text-muted-foreground">시즌이 없습니다.</div></AppShell>;

  return (
    <AppShell>
      <div className="space-y-4">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">사전접수 등록</h1>
            <p className="text-sm text-muted-foreground">
              {editingId ? "수정 모드 — 변경 후 저장하세요." : "좌측에 양식을 붙여넣고 파싱 후 우측에서 검토/수정·저장"}
            </p>
          </div>
          {editingId && (
            <Button size="sm" variant="outline" onClick={resetForm} className="self-start sm:self-auto">
              <X className="h-3 w-3 mr-1" /> 수정 취소
            </Button>
          )}
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">입력 텍스트</h2>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => setText(SAMPLE)} disabled={!!editingId}>샘플</Button>
                <Button size="sm" variant="outline" onClick={() => { setText(""); if (!editingId) setEdited(null); }}>
                  <Trash2 className="h-3 w-3 mr-1" />지우기
                </Button>
                <Button size="sm" onClick={onParse} disabled={!!editingId || parsing || !text.trim()}>
                  {parsing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                  {parsing ? "AI 파싱 중…" : "AI 파싱 →"}
                </Button>
              </div>
            </div>
            {parseStage === "rule" && parseNotice && (
              <div className="rounded border border-amber-400/50 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
                <span className="inline-block rounded bg-amber-500/20 px-1.5 py-0.5 mr-1 font-semibold">1단계 · 규칙</span>
                {parseNotice}
              </div>
            )}
            {parseStage === "primary" && !parsing && (
              <div className="rounded border border-emerald-400/40 bg-emerald-50 px-3 py-1.5 text-[11px] text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-100">
                <span className="inline-block rounded bg-emerald-500/20 px-1.5 py-0.5 mr-1 font-semibold">2단계 · 기본 AI</span>
                결과를 반드시 검토·수정 후 저장하세요.
              </div>
            )}
            {parseStage === "backup" && !parsing && (
              <div className="rounded border border-violet-400/40 bg-violet-50 px-3 py-1.5 text-[11px] text-violet-900 dark:bg-violet-900/20 dark:text-violet-100">
                <span className="inline-block rounded bg-violet-500/20 px-1.5 py-0.5 mr-1 font-semibold">3단계 · 대용량 AI</span>
                큰 명단이라 백업 모델로 처리됐습니다. 결과를 반드시 검토·수정 후 저장하세요.
              </div>
            )}
            {!editingId && ocrEnabled && (
              <>
                <OcrUploader
                  onText={(t) => setText((prev) => (prev ? prev + "\n\n" : "") + t)}
                />
                <p className="text-[11px] text-amber-600 dark:text-amber-400 px-1">
                  ※ 손글씨는 인식 정확도가 낮을 수 있습니다. 결과를 반드시 확인·수정한 후 파싱하세요.
                </p>
              </>
            )}
            <Textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={editingId ? "수정 모드에서는 텍스트 파싱이 비활성화됩니다" : "여기에 사전접수 양식 텍스트를 붙여넣거나, 위의 이미지 OCR을 사용하세요…"}
              className="min-h-[160px] max-h-[70vh] resize-none overflow-hidden overflow-y-auto font-mono text-xs"
              disabled={!!editingId}
            />
          </Card>

          <Card className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{editingId ? "편집" : "미리보기 / 수정"}</h2>
              <Button size="sm" onClick={attemptSave} disabled={save.isPending || !current.church_name}>
                <Save className="h-3 w-3 mr-1" />{editingId ? "수정 저장" : "저장"}
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">교회명</Label>
                <Input value={current.church_name} onChange={(e) => setEdited({ ...current, church_name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">교단</Label>
                <Input value={current.denomination} onChange={(e) => setEdited({ ...current, denomination: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">담당자</Label>
                <Input value={current.contact_name} onChange={(e) => setEdited({ ...current, contact_name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">연락처</Label>
                <Input value={current.phone} onChange={(e) => setEdited({ ...current, phone: e.target.value })} />
              </div>
            </div>

            <div className="rounded border bg-muted/40 px-3 py-2 text-xs flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
              <span>숙박 <b>{num(totals.lodging)}</b></span>
              <span>비숙박 <b>{num(totals.nonLodging)}</b></span>
              <span className="sm:ml-auto">합계 <b className="text-base">{num(totals.total)}</b></span>
            </div>

            {current.warnings.length > 0 && (
              <div className="rounded border border-amber-400/50 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
                <div className="font-semibold flex items-center gap-1 mb-1">
                  <AlertTriangle className="h-3 w-3" /> 불일치 경고
                </div>
                <ul className="list-disc pl-4 space-y-0.5">
                  {current.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}

            {current.excluded.length > 0 && (
              <details className="rounded border bg-muted/30 px-3 py-2 text-xs">
                <summary className="cursor-pointer font-semibold text-muted-foreground">
                  제외됨 ({current.excluded.length}) — 사람이 아니라고 판단된 텍스트
                </summary>
                <ul className="list-disc pl-4 mt-1 space-y-0.5 text-muted-foreground">
                  {current.excluded.map((x, i) => <li key={i} className="break-all">{x}</li>)}
                </ul>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  잘못 제외되었다면 아래 카테고리에서 "추가"로 수동 입력하세요.
                </p>
              </details>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded border bg-muted/30 px-2 py-1.5">
              <Input
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                placeholder="이름 검색 (부분 일치, 표시만 필터)"
                className="h-7 text-xs flex-1"
              />
              <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap px-1">
                <input
                  type="checkbox"
                  checked={sortAsc}
                  onChange={(e) => setSortAsc(e.target.checked)}
                />
                가나다순 정렬 (보기용)
              </label>
              {(nameFilter || sortAsc) && (
                <button
                  onClick={() => { setNameFilter(""); setSortAsc(false); }}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline"
                >
                  초기화
                </button>
              )}
            </div>

            <div className="space-y-3">
              {KEYS.map((k) => {
                const b = current.categories[k];
                return (
                  <div key={k} className="rounded border p-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-2">
                      <div className="font-semibold text-sm">{CATEGORY_LABELS[k]}</div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums">
                        <span>숙박 입력 <b>{b.lodging_count}</b> · 명단 <b>{b.lodging_names.length}</b></span>
                        <span>비숙박 입력 <b>{b.non_lodging_count}</b> · 명단 <b>{b.non_lodging_names.length}</b></span>
                      </div>
                    </div>
                    <NameEditor
                      title="숙박자"
                      names={b.lodging_names}
                      filter={nameFilter}
                      sortAsc={sortAsc}
                      onChange={(ns) => {
                        const c = { ...current.categories, [k]: { ...b, lodging_names: ns } };
                        setEdited({ ...current, categories: c });
                      }}
                    />
                    <NameEditor
                      title="비숙박자"
                      names={b.non_lodging_names}
                      filter={nameFilter}
                      sortAsc={sortAsc}
                      onChange={(ns) => {
                        const c = { ...current.categories, [k]: { ...b, non_lodging_names: ns } };
                        setEdited({ ...current, categories: c });
                      }}
                    />
                  </div>
                );
              })}
            </div>

          </Card>
        </div>

        <DuplicateBanner
          groups={duplicateGroups}
          onCompareGroup={(g) => setCompareGroup(g)}
          onDelete={(id) => deleteChurch.mutate(id)}
        />
        <PreRegistrationList seasonId={season.id} onEdit={loadForEdit} editingId={editingId} />

        <DuplicateCompareDialog
          group={compareGroup}
          people={allData?.people ?? []}
          onClose={() => setCompareGroup(null)}
          onEdit={(id) => { setCompareGroup(null); loadForEdit(id); }}
          onDelete={(id) => deleteChurch.mutate(id)}
          editLabel="편집"
        />

      </div>
    </AppShell>
  );
}

function PreRegistrationList({
  seasonId, onEdit, editingId,
}: { seasonId: string; onEdit: (id: string) => void; editingId: string | null }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["pre-list", seasonId],
    queryFn: async () => {
      const { data: churches } = await supabase
        .from("churches")
        .select("*")
        .eq("season_id", seasonId)
        .eq("source", "pre")
        .order("created_at", { ascending: true });
      const ids = (churches ?? []).map((c: any) => c.id);
      if (ids.length === 0) return { churches: churches ?? [], people: [] as any[] };
      const people = await fetchAll<any>("people", (q) =>
        q.select("church_id, gender, age_group, lodging").in("church_id", ids),
      );
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
      qc.invalidateQueries({ queryKey: ["pre-list"] }); qc.invalidateQueries({ queryKey: ["pre-all"] });
    },
    onError: (e: any) => toast.error(e.message ?? "삭제 실패"),
  });

  const churches = data?.churches ?? [];
  const people = data?.people ?? [];

  const countFor = (cid: string, g: string, a: string, lodging: boolean) =>
    people.filter((p: any) => p.church_id === cid && p.gender === g && p.age_group === a && p.lodging === lodging).length;

  return (
    <Card className="p-0 overflow-hidden">
      <div className="bg-muted/40 px-4 py-3 border-b">
        <h2 className="text-sm font-semibold">사전접수 등록 명단 ({churches.length}교회)</h2>
        <p className="text-xs text-muted-foreground">등록 순서대로 표시 · 수정 시 위 폼에서 편집 후 저장</p>
      </div>
      {churches.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">등록된 사전접수가 없습니다.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs">
              <tr>
                <th className="text-left px-3 py-2 w-10">#</th>
                <th className="text-left px-3 py-2">교회</th>
                <th className="text-left px-3 py-2">담당자 / 연락처</th>
                <th className="text-right px-2 py-2" title="남학생 숙박">남학(숙)</th>
                <th className="text-right px-2 py-2" title="남학생 비숙박">남학(비)</th>
                <th className="text-right px-2 py-2" title="여학생 숙박">여학(숙)</th>
                <th className="text-right px-2 py-2" title="여학생 비숙박">여학(비)</th>
                <th className="text-right px-2 py-2" title="남자어른 숙박">남어(숙)</th>
                <th className="text-right px-2 py-2" title="남자어른 비숙박">남어(비)</th>
                <th className="text-right px-2 py-2" title="여자어른 숙박">여어(숙)</th>
                <th className="text-right px-2 py-2" title="여자어른 비숙박">여어(비)</th>
                <th className="text-right px-2 py-2 bg-primary/5">합계</th>
                <th className="px-2 py-2 w-32"></th>
              </tr>
            </thead>
            <tbody>
              {churches.map((c: any, i: number) => {
                const total = people.filter((p: any) => p.church_id === c.id).length;
                return (
                  <tr key={c.id} className={`border-t ${editingId === c.id ? "bg-amber-50 dark:bg-amber-900/10" : ""}`}>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">
                      {c.name}
                      {c.denomination && <span className="text-muted-foreground">({c.denomination})</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {c.contact_name || "—"} {c.phone && `· ${c.phone}`}
                    </td>
                    <td className="text-right px-2 py-2 tabular-nums">{countFor(c.id, "M", "student", true)}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{countFor(c.id, "M", "student", false)}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{countFor(c.id, "F", "student", true)}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{countFor(c.id, "F", "student", false)}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{countFor(c.id, "M", "adult", true)}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{countFor(c.id, "M", "adult", false)}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{countFor(c.id, "F", "adult", true)}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{countFor(c.id, "F", "adult", false)}</td>
                    <td className="text-right px-2 py-2 font-semibold tabular-nums bg-primary/5">{total}</td>
                    <td className="px-2 py-2">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => onEdit(c.id)}>
                          <Pencil className="h-3 w-3 mr-1" />수정
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`'${c.name}' 사전접수를 삭제하시겠습니까? (연결된 명단 ${total}명도 함께 삭제됩니다)`)) {
                              remove.mutate(c.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function NameEditor({
  title,
  names,
  onChange,
  filter = "",
  sortAsc = false,
}: {
  title: string;
  names: { name: string; note?: string }[];
  onChange: (ns: any[]) => void;
  filter?: string;
  sortAsc?: boolean;
}) {
  // 원본 인덱스를 보존한 채 표시용 필터/정렬만 적용 (실제 데이터/저장 순서는 변경하지 않음)
  const q = filter.trim();
  const view = names
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !q || (p.name ?? "").includes(q) || (p.note ?? "").includes(q));
  if (sortAsc) {
    view.sort((a, b) => (a.p.name ?? "").localeCompare(b.p.name ?? "", "ko"));
  }
  const hiddenCount = names.length - view.length;
  const highlight = (text: string) => {
    if (!q || !text) return text;
    const idx = text.indexOf(q);
    if (idx < 0) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-amber-200 dark:bg-amber-400/40 rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };
  return (
    <div className="mt-2">
      <div className="text-[11px] text-muted-foreground mb-1 flex items-center gap-2">
        <span>{title}</span>
        {hiddenCount > 0 && <span className="text-amber-600">(검색 필터로 {hiddenCount}명 숨김)</span>}
      </div>
      <div className="flex flex-wrap gap-1">
        {view.map(({ p, i }) => (
          <div key={i} className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs" title={q && p.name.includes(q) ? `표시: ${p.name}` : undefined}>
            <div className="relative">
              <Input
                value={p.name}
                onChange={(e) => {
                  const copy = [...names];
                  copy[i] = { ...p, name: e.target.value };
                  onChange(copy);
                }}
                className={`h-6 w-20 px-1.5 text-xs ${q && p.name.includes(q) ? "ring-1 ring-amber-400" : ""}`}
              />
              {q && p.name.includes(q) && (
                <div className="pointer-events-none absolute -top-3 left-0 text-[9px] text-amber-600">
                  {highlight(p.name)}
                </div>
              )}
            </div>
            <Input
              value={p.note ?? ""}
              onChange={(e) => {
                const copy = [...names];
                copy[i] = { ...p, note: e.target.value };
                onChange(copy);
              }}
              placeholder="비고"
              className="h-6 w-16 px-1.5 text-xs"
            />
            <button onClick={() => onChange(names.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...names, { name: "", note: "" }])}
          className="inline-flex items-center gap-1 rounded border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> 추가
        </button>
      </div>
    </div>
  );
}


// ----- OCR Uploader -----

const MAX_W = 2000;

async function fileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  // 가독성 유지를 위해 너무 작은 이미지는 1.5배 업스케일, 큰 이미지는 2000px 제한
  const minW = 1200;
  let scale = Math.min(1, MAX_W / bitmap.width);
  if (bitmap.width * scale < minW) scale = Math.min(MAX_W / bitmap.width, minW / bitmap.width);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  // 그레이스케일 + 대비 강화 (contrast factor ≈ 1.35)
  try {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const c = 1.35;
    const intercept = 128 - 128 * c;
    for (let i = 0; i < d.length; i += 4) {
      // luma (BT.601)
      const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      let v = c * y + intercept;
      if (v < 0) v = 0; else if (v > 255) v = 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
  } catch {
    // CORS-tainted 등 예외 시 전처리 생략하고 원본 사용
  }

  // 텍스트 인식에는 PNG가 일반적으로 더 안정적이므로 PNG 고정
  return canvas.toDataURL("image/png");
}

function OcrUploader({ onText }: { onText: (text: string) => void }) {
  const [items, setItems] = useState<{ id: string; preview: string; status: "pending" | "running" | "done" | "error"; msg?: string }[]>([]);
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => /^image\/(png|jpe?g)$/i.test(f.type));
    if (list.length === 0) {
      toast.error("PNG/JPEG 이미지만 첨부할 수 있습니다.");
      return;
    }
    const newItems = await Promise.all(list.map(async (f) => ({
      id: crypto.randomUUID(),
      preview: await fileToDataUrl(f),
      status: "pending" as const,
    })));
    setItems((prev) => [...prev, ...newItems]);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const files: File[] = [];
    for (const it of Array.from(e.clipboardData.items)) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  };

  const runOcr = async () => {
    const pending = items.filter((i) => i.status === "pending" || i.status === "error");
    if (pending.length === 0) return;
    setRunning(true);
    const collected: string[] = [];
    for (const it of pending) {
      setItems((prev) => prev.map((p) => p.id === it.id ? { ...p, status: "running", msg: undefined } : p));
      try {
        const { data, error } = await supabase.functions.invoke("ocr-image", { body: { imageBase64: it.preview } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const txt: string = (data?.text ?? "").trim();
        if (!txt) {
          setItems((prev) => prev.map((p) => p.id === it.id ? { ...p, status: "error", msg: "텍스트를 인식하지 못했습니다." } : p));
        } else {
          collected.push(txt);
          setItems((prev) => prev.map((p) => p.id === it.id ? { ...p, status: "done" } : p));
        }
      } catch (e: any) {
        setItems((prev) => prev.map((p) => p.id === it.id ? { ...p, status: "error", msg: e?.message ?? "OCR 실패" } : p));
      }
    }
    setRunning(false);
    if (collected.length) {
      onText(collected.join("\n\n"));
      toast.success(`${collected.length}장의 이미지에서 텍스트를 추출했습니다.`);
    } else {
      toast.error("이미지 인식에 실패했습니다. 텍스트를 직접 붙여넣어 주세요.");
    }
  };

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2"
      onPaste={onPaste}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setDragOver(false);
        if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ScanText className="h-4 w-4 text-primary" /> 이미지에서 자동 텍스트 추출 (OCR)
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
          />
          <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={running}>
            <ImageIcon className="h-3 w-3 mr-1" /> 이미지 선택
          </Button>
          <Button size="sm" onClick={runOcr} disabled={running || items.every((i) => i.status === "done")}>
            {running ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> 인식 중...</> : "OCR 실행"}
          </Button>
        </div>
      </div>

      <div
        className={`min-h-[80px] rounded border border-dashed px-3 py-2 text-xs transition ${
          dragOver ? "border-primary bg-primary/5" : "border-border text-muted-foreground"
        }`}
      >
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full py-4 text-center">
            파일 선택 · 드래그앤드롭 · 클립보드 붙여넣기(Ctrl+V) · 다중 이미지 지원 (PNG/JPEG)
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {items.map((it) => (
              <div key={it.id} className="relative w-24 h-24 rounded overflow-hidden border bg-background">
                <img src={it.preview} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((p) => p.id !== it.id))}
                  className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                  aria-label="삭제"
                >
                  <X className="h-3 w-3" />
                </button>
                <div className="absolute bottom-0 inset-x-0 text-[10px] px-1 py-0.5 text-center text-white"
                  style={{
                    background:
                      it.status === "done" ? "rgba(16,185,129,0.85)" :
                      it.status === "running" ? "rgba(59,130,246,0.85)" :
                      it.status === "error" ? "rgba(220,38,38,0.85)" : "rgba(0,0,0,0.55)",
                  }}
                  title={it.msg}
                >
                  {it.status === "done" ? "완료" :
                   it.status === "running" ? "인식 중..." :
                   it.status === "error" ? "실패" : "대기"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {items.some((i) => i.status === "error") && (
        <div className="text-xs text-destructive">
          일부 이미지 인식에 실패했습니다. 다시 시도하거나 텍스트를 직접 입력해 주세요.
        </div>
      )}
    </div>
  );
}
