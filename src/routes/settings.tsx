import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useActiveSeason, useSeasons } from "@/lib/use-active-season";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DEFAULT_LODGINGS } from "@/lib/default-lodgings";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Download, Star } from "lucide-react";
import * as XLSX from "xlsx";
import { useRealtimeInvalidate } from "@/lib/use-realtime";
import { krw } from "@/lib/format";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "설정 — 한다련 캠프" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold">설정</h1>
          <p className="text-sm text-muted-foreground">시즌·숙소·목욕쿠폰 단가·이름표 출력</p>
        </header>
        <SeasonsSection />
        <LodgingsSection />
        <BathPriceSection />
        <NametagExportSection />
      </div>
    </AppShell>
  );
}

function SeasonsSection() {
  const { data: seasons = [] } = useSeasons();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", start_date: "", end_date: "" });

  const createSeason = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("시즌 이름을 입력하세요");
      const { data, error } = await supabase
        .from("seasons")
        .insert({
          name: form.name.trim(),
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          is_active: seasons.length === 0,
        })
        .select("id")
        .single();
      if (error) throw error;
      // seed lodgings
      const rows = DEFAULT_LODGINGS.map((l) => ({
        season_id: data.id,
        name: l.name,
        building: l.building,
        floor: l.floor,
        capacity: l.capacity,
        note: l.note ?? null,
        sort_order: l.sort_order,
      }));
      await supabase.from("lodgings").insert(rows);
      await supabase.from("app_settings").insert({ season_id: data.id, bath_unit_price: 5000 });
      return data.id;
    },
    onSuccess: () => {
      toast.success("시즌 생성 완료 (기본 숙소 자동 추가)");
      setForm({ name: "", start_date: "", end_date: "" });
      qc.invalidateQueries({ queryKey: ["seasons"] });
    },
    onError: (e: any) => toast.error(e.message ?? "생성 실패"),
  });

  const activate = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("seasons").update({ is_active: false }).neq("id", id);
      const { error } = await supabase.from("seasons").update({ is_active: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("활성 시즌 변경");
      qc.invalidateQueries({ queryKey: ["seasons"] });
    },
  });

  const updateSeason = useMutation({
    mutationFn: async (s: any) => {
      const { error } = await supabase
        .from("seasons")
        .update({ name: s.name, start_date: s.start_date, end_date: s.end_date })
        .eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seasons"] }),
  });

  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold mb-4">시즌 관리</h2>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_180px_auto] gap-2 mb-4">
        <div>
          <Label className="text-xs">시즌 이름</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 2026 여름캠프" />
        </div>
        <div>
          <Label className="text-xs">시작일</Label>
          <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">종료일</Label>
          <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
        </div>
        <div className="flex items-end">
          <Button onClick={() => createSeason.mutate()} disabled={createSeason.isPending}>
            <Plus className="h-4 w-4 mr-1" /> 시즌 생성
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>활성</TableHead>
            <TableHead>이름</TableHead>
            <TableHead>시작일</TableHead>
            <TableHead>종료일</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {seasons.map((s) => (
            <TableRow key={s.id}>
              <TableCell>
                {s.is_active ? (
                  <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    <Star className="h-3 w-3" /> 활성
                  </span>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => activate.mutate(s.id)}>활성화</Button>
                )}
              </TableCell>
              <TableCell>
                <Input defaultValue={s.name} onBlur={(e) => updateSeason.mutate({ ...s, name: e.target.value })} className="h-8" />
              </TableCell>
              <TableCell>
                <Input type="date" defaultValue={s.start_date ?? ""} onBlur={(e) => updateSeason.mutate({ ...s, start_date: e.target.value || null })} className="h-8 w-40" />
              </TableCell>
              <TableCell>
                <Input type="date" defaultValue={s.end_date ?? ""} onBlur={(e) => updateSeason.mutate({ ...s, end_date: e.target.value || null })} className="h-8 w-40" />
              </TableCell>
              <TableCell></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function LodgingsSection() {
  const { season } = useActiveSeason();
  const qc = useQueryClient();
  useRealtimeInvalidate(["lodgings"], [["lodgings-settings"]]);
  const { data: lodgings = [] } = useQuery({
    queryKey: ["lodgings-settings", season?.id],
    enabled: !!season?.id,
    queryFn: async () => {
      const { data } = await supabase.from("lodgings").select("*").eq("season_id", season!.id).order("sort_order");
      return data ?? [];
    },
  });
  const update = useMutation({
    mutationFn: async (row: any) => {
      const { error } = await supabase.from("lodgings").update({
        name: row.name, building: row.building, floor: row.floor,
        capacity: row.capacity, gender: row.gender, active: row.active, note: row.note,
      }).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lodgings-settings"] }),
  });
  if (!season) return null;
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold mb-3">숙소 설정</h2>
      <p className="text-xs text-muted-foreground mb-3">성별(남=하늘색, 여=분홍색, 미지정=회색)은 숙소배치·접수시트에 동일하게 표시됩니다.</p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>숙소명</TableHead>
              <TableHead>건물</TableHead>
              <TableHead>층</TableHead>
              <TableHead className="text-right">정원</TableHead>
              <TableHead>성별</TableHead>
              <TableHead>활성</TableHead>
              <TableHead>비고</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lodgings.map((l: any) => (
              <TableRow key={l.id}>
                <TableCell><Input defaultValue={l.name} onBlur={(e) => update.mutate({ ...l, name: e.target.value })} className="h-8" /></TableCell>
                <TableCell>
                  <Select defaultValue={l.building} onValueChange={(v) => update.mutate({ ...l, building: v })}>
                    <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="교육관">교육관</SelectItem>
                      <SelectItem value="본당">본당</SelectItem>
                      <SelectItem value="기타">기타</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell><Input defaultValue={l.floor ?? ""} onBlur={(e) => update.mutate({ ...l, floor: e.target.value })} className="h-8 w-20" /></TableCell>
                <TableCell className="text-right">
                  <Input type="number" defaultValue={l.capacity} onBlur={(e) => update.mutate({ ...l, capacity: parseInt(e.target.value) || 0 })} className="h-8 w-20 text-right tabular-nums" />
                </TableCell>
                <TableCell>
                  <Select defaultValue={l.gender ?? "none"} onValueChange={(v) => update.mutate({ ...l, gender: v === "none" ? null : v })}>
                    <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">남</SelectItem>
                      <SelectItem value="F">여</SelectItem>
                      <SelectItem value="none">미지정</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Switch checked={l.active} onCheckedChange={(v) => update.mutate({ ...l, active: v })} />
                </TableCell>
                <TableCell><Input defaultValue={l.note ?? ""} onBlur={(e) => update.mutate({ ...l, note: e.target.value || null })} className="h-8" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function BathPriceSection() {
  const { season } = useActiveSeason();
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["app_settings", season?.id],
    enabled: !!season?.id,
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("*").eq("season_id", season!.id).maybeSingle();
      return data;
    },
  });
  const [price, setPrice] = useState<number>(settings?.bath_unit_price ?? 5000);
  if (!season) return null;
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold mb-3">목욕쿠폰 단가</h2>
      <div className="flex items-end gap-3">
        <div className="w-48">
          <Label className="text-xs">단가 (원/매)</Label>
          <Input type="number" value={price} onChange={(e) => setPrice(parseInt(e.target.value) || 0)} className="tabular-nums" />
        </div>
        <Button onClick={async () => {
          await supabase.from("app_settings").upsert({ season_id: season.id, bath_unit_price: price });
          qc.invalidateQueries({ queryKey: ["app_settings"] });
          toast.success("저장됨");
        }}>저장</Button>
        <span className="text-sm text-muted-foreground">현재: {krw(settings?.bath_unit_price ?? 5000)}</span>
      </div>
    </Card>
  );
}

function NametagExportSection() {
  const { season } = useActiveSeason();
  if (!season) return null;
  const download = async () => {
    const { data: churches } = await supabase
      .from("churches").select("id, name").eq("season_id", season.id);
    const churchMap = new Map((churches ?? []).map((c: any) => [c.id, c.name]));
    const { data: people } = await supabase
      .from("people").select("church_id, name, note")
      .in("church_id", (churches ?? []).map((c: any) => c.id));
    const rows = (people ?? []).map((p: any) => ({
      교회명: churchMap.get(p.church_id) ?? "",
      이름: p.name,
      비고: p.note ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "이름표");
    XLSX.writeFile(wb, `${season.name}_이름표.xlsx`);
  };
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold mb-3">이름표 출력</h2>
      <p className="text-xs text-muted-foreground mb-3">사전접수·현장접수 등록자 전체의 교회명+이름 엑셀 다운로드.</p>
      <Button onClick={download} variant="outline"><Download className="h-4 w-4 mr-1" />엑셀 다운로드</Button>
    </Card>
  );
}
