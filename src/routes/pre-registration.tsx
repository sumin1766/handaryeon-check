import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useActiveSeason } from "@/lib/use-active-season";
import { useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  parsePreRegistration,
  totalCounts,
  CATEGORY_LABELS,
  CATEGORY_META,
  type CategoryKey,
  type ParsedRegistration,
} from "@/lib/parsers/pre-registration-parser";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Save, Trash2, Plus } from "lucide-react";
import { num } from "@/lib/format";

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

function PreRegistrationPage() {
  const { season } = useActiveSeason();
  const [text, setText] = useState("");
  const parsedFromText = useMemo(() => parsePreRegistration(text), [text]);
  const [edited, setEdited] = useState<ParsedRegistration | null>(null);

  const current = edited ?? parsedFromText;
  const totals = totalCounts(current);

  const onParse = () => setEdited(parsePreRegistration(text));

  const save = useMutation({
    mutationFn: async () => {
      if (!season) throw new Error("활성 시즌이 없습니다");
      if (!current.church_name.trim()) throw new Error("교회 이름이 필요합니다");
      const { data: church, error: e1 } = await supabase.from("churches").insert({
        season_id: season.id,
        name: current.church_name.trim(),
        denomination: current.denomination || null,
        contact_name: current.contact_name || null,
        phone: current.phone || null,
        source: "pre",
      }).select("id").single();
      if (e1) throw e1;
      const rows: any[] = [];
      for (const k of KEYS) {
        const b = current.categories[k];
        const meta = CATEGORY_META[k];
        for (const p of b.lodging_names) {
          rows.push({ church_id: church.id, name: p.name, note: p.note ?? null,
            gender: meta.gender, age_group: meta.age_group, lodging: true });
        }
        for (const p of b.non_lodging_names) {
          rows.push({ church_id: church.id, name: p.name, note: p.note ?? null,
            gender: meta.gender, age_group: meta.age_group, lodging: false });
        }
      }
      if (rows.length) {
        const { error: e2 } = await supabase.from("people").insert(rows);
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      toast.success("저장 완료");
      setText("");
      setEdited(null);
    },
    onError: (e: any) => toast.error(e.message ?? "저장 실패"),
  });

  if (!season) return <AppShell><div className="text-sm text-muted-foreground">시즌이 없습니다.</div></AppShell>;

  return (
    <AppShell>
      <div className="space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">사전접수 등록</h1>
            <p className="text-sm text-muted-foreground">좌측에 양식을 붙여넣고 파싱 후 우측에서 검토/수정·저장</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">입력 텍스트</h2>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setText(SAMPLE)}>샘플</Button>
                <Button size="sm" variant="outline" onClick={() => { setText(""); setEdited(null); }}>
                  <Trash2 className="h-3 w-3 mr-1" />지우기
                </Button>
                <Button size="sm" onClick={onParse}>파싱 →</Button>
              </div>
            </div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="여기에 사전접수 양식 텍스트를 붙여넣으세요…"
              className="min-h-[600px] font-mono text-xs"
            />
          </Card>

          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">미리보기 / 수정</h2>
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !current.church_name}>
                <Save className="h-3 w-3 mr-1" />저장
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
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

            <div className="rounded border bg-muted/40 px-3 py-2 text-xs flex gap-4 tabular-nums">
              <span>숙박 <b>{num(totals.lodging)}</b></span>
              <span>비숙박 <b>{num(totals.nonLodging)}</b></span>
              <span className="ml-auto">합계 <b className="text-base">{num(totals.total)}</b></span>
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

            <div className="space-y-3">
              {KEYS.map((k) => {
                const b = current.categories[k];
                return (
                  <div key={k} className="rounded border p-2">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-sm">{CATEGORY_LABELS[k]}</div>
                      <div className="flex gap-3 text-xs tabular-nums">
                        <span>숙박 입력 <b>{b.lodging_count}</b> · 명단 <b>{b.lodging_names.length}</b></span>
                        <span>비숙박 입력 <b>{b.non_lodging_count}</b> · 명단 <b>{b.non_lodging_names.length}</b></span>
                      </div>
                    </div>
                    <NameEditor
                      title="숙박자"
                      names={b.lodging_names}
                      onChange={(ns) => {
                        const c = { ...current.categories, [k]: { ...b, lodging_names: ns } };
                        setEdited({ ...current, categories: c });
                      }}
                    />
                    <NameEditor
                      title="비숙박자"
                      names={b.non_lodging_names}
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
      </div>
    </AppShell>
  );
}

function NameEditor({ title, names, onChange }: { title: string; names: { name: string; note?: string }[]; onChange: (ns: any[]) => void }) {
  return (
    <div className="mt-2">
      <div className="text-[11px] text-muted-foreground mb-1">{title}</div>
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
              className="h-6 w-20 px-1.5 text-xs"
            />
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
