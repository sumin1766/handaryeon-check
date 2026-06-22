import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useActiveSeason } from "@/lib/use-active-season";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { num } from "@/lib/format";

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
  const [form, setForm] = useState(emptyForm());

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
      if (rows.length) {
        const { error: e2 } = await supabase.from("people").insert(rows);
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      toast.success("등록 완료");
      setForm(emptyForm());
    },
    onError: (e: any) => toast.error(e.message ?? "등록 실패"),
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
      </div>
    </AppShell>
  );
}
