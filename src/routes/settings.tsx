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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEFAULT_LODGINGS } from "@/lib/default-lodgings";
import { useRef, useState, type ReactNode } from "react";
import {
  useReceiptLayout, useSaveReceiptLayout, DEFAULT_LAYOUT, RECEIPT_ELEMENTS,
  type ReceiptLayout,
} from "@/lib/receipt-layout";
import { ReceiptLayoutEditor, type ReceiptData, type ReceiptMode } from "@/components/receipt-document";
import { toast } from "sonner";
import { Plus, Star, Calendar, Building2, Bath, Maximize2, Trash2, FileText, Lock } from "lucide-react";
import { useRealtimeInvalidate } from "@/lib/use-realtime";
import { krw } from "@/lib/format";
import { useAuthRole } from "@/lib/use-auth-role";
import { useAuthConfig, useUpdateAuthConfig } from "@/lib/auth-config";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "설정 — 한다련 캠프" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const role = useAuthRole();
  if (role && role !== "admin") {
    return (
      <AppShell>
        <div className="max-w-md mx-auto mt-16">
          <Card className="p-6 text-center">
            <Lock className="h-8 w-8 mx-auto text-muted-foreground" />
            <h1 className="mt-3 text-lg font-semibold">접근 권한 없음</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              설정 페이지는 전체관리자만 접근할 수 있습니다.
            </p>
          </Card>
        </div>
      </AppShell>
    );
  }
  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold">설정</h1>
          <p className="text-sm text-muted-foreground">카드를 클릭하면 전체 내용을 팝업으로 열어볼 수 있습니다.</p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <SettingsCard
            icon={<Calendar className="h-5 w-5" />}
            title="시즌 관리"
            summary={<SeasonsSummary />}
          >
            <SeasonsSection />
          </SettingsCard>
          <SettingsCard
            icon={<Building2 className="h-5 w-5" />}
            title="숙소 설정"
            summary={<LodgingsSummary />}
          >
            <LodgingsSection />
          </SettingsCard>
          <SettingsCard
            icon={<Bath className="h-5 w-5" />}
            title="목욕쿠폰 단가"
            summary={<BathPriceSummary />}
          >
            <BathPriceSection />
          </SettingsCard>
          <SettingsCard
            icon={<FileText className="h-5 w-5" />}
            title="영수증 서식 설정"
            summary={<ReceiptLayoutSummary />}
          >
            <ReceiptLayoutSection />
          </SettingsCard>
          <SettingsCard
            icon={<Lock className="h-5 w-5" />}
            title="비밀번호 변경"
            summary={<PasswordSummary />}
          >
            <PasswordSection />
          </SettingsCard>
        </div>
      </div>
    </AppShell>
  );
}

function SettingsCard({
  icon, title, summary, children,
}: { icon: ReactNode; title: string; summary: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left w-full"
      >
        <Card className="p-4 transition hover:shadow-md hover:border-primary/50 cursor-pointer h-full">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</div>
              <h2 className="text-base font-semibold">{title}</h2>
            </div>
            <Maximize2 className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-3 text-sm text-muted-foreground">{summary}</div>
          <div className="mt-3 text-xs text-primary font-medium">클릭하여 열기 →</div>
        </Card>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2">
              {icon} {title}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto px-6 py-4">{children}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ----- Summaries -----

function SeasonsSummary() {
  const { data: seasons = [] } = useSeasons();
  const active = seasons.find((s) => s.is_active);
  return (
    <div className="tabular-nums">
      <div>총 <b className="text-foreground">{seasons.length}</b>개 시즌</div>
      <div className="truncate">활성: <b className="text-foreground">{active?.name ?? "—"}</b></div>
    </div>
  );
}

function LodgingsSummary() {
  const { season } = useActiveSeason();
  const { data: lodgings = [] } = useQuery({
    queryKey: ["lodgings-settings", season?.id],
    enabled: !!season?.id,
    queryFn: async () => {
      const { data } = await supabase.from("lodgings").select("id, active, capacity").eq("season_id", season!.id);
      return data ?? [];
    },
  });
  const active = lodgings.filter((l: any) => l.active).length;
  const cap = lodgings.filter((l: any) => l.active).reduce((s: number, l: any) => s + l.capacity, 0);
  return (
    <div className="tabular-nums">
      <div>활성 숙소 <b className="text-foreground">{active}</b> / {lodgings.length}</div>
      <div>총 정원 <b className="text-foreground">{cap}</b>명</div>
    </div>
  );
}

function BathPriceSummary() {
  const { season } = useActiveSeason();
  const { data: settings } = useQuery({
    queryKey: ["app_settings", season?.id],
    enabled: !!season?.id,
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("*").eq("season_id", season!.id).maybeSingle();
      return data;
    },
  });
  return <div>1매 단가 <b className="text-foreground">{krw(settings?.bath_unit_price ?? 5000)}</b></div>;
}

// ----- Full sections -----

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
    <div>
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
    </div>
  );
}

function LodgingsSection() {
  const { season } = useActiveSeason();
  const qc = useQueryClient();
  useRealtimeInvalidate(["lodgings", "people"], [["lodgings-settings"], ["lodgings-settings-full"]]);
  const { data: lodgings = [] } = useQuery({
    queryKey: ["lodgings-settings-full", season?.id],
    enabled: !!season?.id,
    queryFn: async () => {
      const { data } = await supabase.from("lodgings").select("*").eq("season_id", season!.id).order("sort_order");
      return data ?? [];
    },
  });
  const { data: assignedMap = {} } = useQuery({
    queryKey: ["lodgings-assigned-count", season?.id],
    enabled: !!season?.id,
    queryFn: async () => {
      const { data } = await supabase.from("people").select("lodging_id").not("lodging_id", "is", null);
      const map: Record<string, number> = {};
      for (const p of data ?? []) {
        if (p.lodging_id) map[p.lodging_id] = (map[p.lodging_id] ?? 0) + 1;
      }
      return map;
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lodgings-settings-full"] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lodgings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("숙소 삭제됨");
      qc.invalidateQueries({ queryKey: ["lodgings-settings-full"] });
      qc.invalidateQueries({ queryKey: ["lodgings-assigned-count"] });
    },
    onError: (e: any) => toast.error(e.message ?? "삭제 실패"),
  });

  const [form, setForm] = useState({
    name: "", building: "교육관", floor: "", capacity: 0, gender: "none" as "M" | "F" | "none", active: true,
  });
  const add = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("숙소명을 입력하세요");
      const maxSort = lodgings.reduce((m: number, l: any) => Math.max(m, l.sort_order ?? 0), 0);
      const { error } = await supabase.from("lodgings").insert({
        season_id: season!.id,
        name: form.name.trim(),
        building: form.building,
        floor: form.floor || null,
        capacity: form.capacity || 0,
        gender: form.gender === "none" ? null : form.gender,
        active: form.active,
        sort_order: maxSort + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("숙소 추가됨");
      setForm({ name: "", building: "교육관", floor: "", capacity: 0, gender: "none", active: true });
      qc.invalidateQueries({ queryKey: ["lodgings-settings-full"] });
    },
    onError: (e: any) => toast.error(e.message ?? "추가 실패"),
  });

  if (!season) return <div className="text-sm text-muted-foreground">시즌이 없습니다.</div>;
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">성별(남=하늘색, 여=분홍색, 미지정=회색)은 숙소배치·접수시트에 동일하게 표시됩니다.</p>

      <Card className="p-3 mb-4 bg-muted/30">
        <div className="text-xs font-semibold mb-2">숙소 추가</div>
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2 items-end">
          <div className="col-span-2">
            <Label className="text-[11px]">숙소명</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-8" placeholder="예: 305호" />
          </div>
          <div>
            <Label className="text-[11px]">건물</Label>
            <Select value={form.building} onValueChange={(v) => setForm({ ...form, building: v })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="교육관">교육관</SelectItem>
                <SelectItem value="본당">본당</SelectItem>
                <SelectItem value="기타">기타</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px]">층</Label>
            <Input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} className="h-8" placeholder="3층" />
          </div>
          <div>
            <Label className="text-[11px]">정원</Label>
            <Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value) || 0 })} className="h-8 text-right tabular-nums" />
          </div>
          <div>
            <Label className="text-[11px]">성별</Label>
            <Select value={form.gender} onValueChange={(v: any) => setForm({ ...form, gender: v })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="M">남</SelectItem>
                <SelectItem value="F">여</SelectItem>
                <SelectItem value="none">미지정</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col items-start gap-1">
            <Label className="text-[11px]">활성</Label>
            <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
          </div>
        </div>
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending}>
            <Plus className="h-3 w-3 mr-1" /> 숙소 추가
          </Button>
        </div>
      </Card>

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
              <TableHead className="text-right">배정</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lodgings.map((l: any) => {
              const assigned = (assignedMap as Record<string, number>)[l.id] ?? 0;
              return (
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
                  <TableCell className="text-right tabular-nums text-xs">{assigned}명</TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        const warn = assigned > 0
                          ? `'${l.name}'에 ${assigned}명이 배정되어 있습니다. 정말 삭제할까요? (배정은 해제됩니다)`
                          : `'${l.name}'을(를) 삭제할까요?`;
                        if (confirm(warn)) remove.mutate(l.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
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
  if (!season) return <div className="text-sm text-muted-foreground">시즌이 없습니다.</div>;
  return (
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
  );
}

// ----- Receipt layout -----
function ReceiptLayoutSummary() {
  const { data: layout } = useReceiptLayout();
  const count = layout ? Object.keys(layout).length : 0;
  return (
    <div>
      <div>편집 가능한 요소 <b className="text-foreground">{RECEIPT_ELEMENTS.length}</b>개</div>
      <div className="text-xs">{count > 0 ? "사용자 정의 레이아웃 적용 중" : "기본 레이아웃"}</div>
    </div>
  );
}

function ReceiptLayoutSection() {
  const { data: saved } = useReceiptLayout();
  const save = useSaveReceiptLayout();
  const [layout, setLayout] = useState<ReceiptLayout>({});
  const [mode, setMode] = useState<ReceiptMode>("transfer");
  const initialized = useRef(false);
  if (!initialized.current && saved !== undefined) {
    initialized.current = true;
    setLayout({ ...DEFAULT_LAYOUT, ...saved });
  }
  const sample: ReceiptData = {
    church: "샘플교회",
    date: new Date().toISOString().slice(0, 10),
    amount: 500000,
    method: mode === "transfer" ? "계좌이체" : "신용카드(홈페이지)",
    lodging_count: 10,
    non_lodging_count: 5,
    content: "한다련 여름캠프 회비",
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground flex-1">각 요소를 드래그해서 위치를 조정하세요. 저장 시 영수증 페이지 미리보기·인쇄에 반영됩니다.</p>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as ReceiptMode)}
          className="h-8 rounded border bg-background px-2 text-xs"
        >
          <option value="transfer">입금확인서</option>
          <option value="card">결제확인서</option>
        </select>
        <Button size="sm" variant="outline" onClick={() => setLayout({ ...DEFAULT_LAYOUT })}>
          기본값으로 초기화
        </Button>
        <Button size="sm" onClick={() => save.mutate(layout, { onSuccess: () => toast.success("레이아웃 저장됨") })} disabled={save.isPending}>
          저장
        </Button>
      </div>
      <div className="overflow-auto">
        <ReceiptLayoutEditor mode={mode} f={sample} total={15} layout={layout} onChange={setLayout} />
      </div>
    </div>
  );
}
