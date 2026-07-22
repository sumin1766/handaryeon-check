import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useActiveSeason, useSeasons } from "@/lib/use-active-season";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
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
import { Plus, Star, Calendar, Building2, Bath, Maximize2, Trash2, FileText, Lock, ScanText, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useRealtimeInvalidate } from "@/lib/use-realtime";
import { krw } from "@/lib/format";
import { useAuthRole } from "@/lib/use-auth-role";
import { useChangePasswords } from "@/lib/auth-config";

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
          <SettingsCard
            icon={<ScanText className="h-5 w-5" />}
            title="OCR / API 키 설정"
            summary={<OcrSummary />}
          >
            <OcrSection />
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
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</div>
              <h2 className="text-base font-semibold truncate">{title}</h2>
            </div>
            <Maximize2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <div className="mt-3 text-sm text-muted-foreground">{summary}</div>
          <div className="mt-3 text-xs text-primary font-medium">클릭하여 열기 →</div>
        </Card>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-full sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-4 sm:px-6 pt-5 sm:pt-6 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2">
              {icon} {title}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto px-4 sm:px-6 py-4">{children}</div>
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
      const data = await fetchAll<{ lodging_id: string | null }>(
        "people",
        (q) => q.select("lodging_id").not("lodging_id", "is", null),
      );
      const map: Record<string, number> = {};
      for (const p of data) {
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
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-full sm:w-48">
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

// ----- Password change (admin only) -----

function PasswordSummary() {
  return (
    <div>
      <div>전체관리자 / 접수담당자 / 일반 사용자 비밀번호를 변경합니다.</div>
      <div className="text-xs mt-1 text-muted-foreground">
        해시로만 저장됩니다. 변경하려면 현재 관리자 비밀번호가 필요합니다.
      </div>
    </div>
  );
}

function PasswordSection() {
  const change = useChangePasswords();
  const [current, setCurrent] = useState("");
  const [admin, setAdmin] = useState("");
  const [staff, setStaff] = useState("");
  const [user, setUser] = useState("");
  const [show, setShow] = useState(false);

  const cT = current.trim(), aT = admin.trim(), sT = staff.trim(), uT = user.trim();
  const empty = !cT || !aT || !sT || !uT;
  const dup = (aT && (aT === sT || aT === uT)) || (sT && sT === uT);
  const disabled = change.isPending || empty || !!dup;

  const onSave = () => {
    change.mutate(
      { current_admin: current, new_admin: admin, new_staff: staff, new_user: user },
      {
        onSuccess: () => {
          toast.success("비밀번호가 변경되었습니다.");
          setCurrent(""); setAdmin(""); setStaff(""); setUser("");
        },
        onError: (e: any) => toast.error(e?.message ?? "저장 실패"),
      },
    );
  };

  const Field = ({ id, label, value, set, placeholder, auto }: any) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
        autoComplete={auto}
      />
    </div>
  );

  return (
    <div className="space-y-4 w-full max-w-md">
      <Field id="current-pw" label="현재 관리자 비밀번호" value={current} set={setCurrent} placeholder="현재 관리자 비밀번호 확인" auto="current-password" />
      <Field id="admin-pw" label="새 전체관리자 비밀번호 (admin)" value={admin} set={setAdmin} placeholder="예: 031213" auto="new-password" />
      <Field id="staff-pw" label="새 접수담당자 비밀번호 (staff)" value={staff} set={setStaff} placeholder="예: 007123" auto="new-password" />
      <Field id="user-pw" label="새 일반 사용자 비밀번호 (user)" value={user} set={setUser} placeholder="예: 007124" auto="new-password" />
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setShow((v) => !v)}>
          {show ? "비밀번호 숨김" : "비밀번호 표시"}
        </Button>
      </div>
      {empty && <div className="text-xs text-destructive">모든 비밀번호 칸을 채워주세요.</div>}
      {dup && <div className="text-xs text-destructive">세 비밀번호는 모두 달라야 합니다.</div>}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onSave} disabled={disabled}>
          {change.isPending ? "저장 중..." : "저장"}
        </Button>
        <span className="text-xs text-muted-foreground">
          저장 즉시 적용되며, 다음 잠금 해제부터 새 비밀번호가 사용됩니다.
        </span>
      </div>
      <div className="text-xs text-muted-foreground border-t pt-3">
        역할별 권한:<br />
        • <b>admin</b> — 전 메뉴 + 설정 + 모든 수정/삭제<br />
        • <b>staff</b> — 설정 제외 전 메뉴(접수명단 포함), 접수시트 수정/삭제 불가<br />
        • <b>user</b> — 대시보드 · 접수시트 · 현장접수 (수정/삭제 불가)
      </div>
    </div>
  );
}

// ----- OCR / API key (admin only) -----

function useOcrStatus() {
  return useQuery({
    queryKey: ["ocr_status"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ocr_status" as any);
      if (error) throw error;
      return data as {
        has_key: boolean;
        key_last4: string | null;
        base_url: string;
        has_backup_key?: boolean;
        backup_key_last4?: string | null;
      };
    },
  });
}

function useOcrEnabled() {
  const { season } = useActiveSeason();
  return useQuery({
    queryKey: ["app_settings_ocr", season?.id],
    enabled: !!season?.id,
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("*").eq("season_id", season!.id).maybeSingle();
      return { enabled: !!(data as any)?.ocr_enabled, seasonId: season!.id };
    },
  });
}

function OcrSummary() {
  const { data: status } = useOcrStatus();
  const { data: en } = useOcrEnabled();
  return (
    <div>
      <div>
        {en?.enabled ? <span className="text-emerald-600 font-medium">사용 중</span> : <span className="text-muted-foreground">꺼짐</span>}
        {" · "}
        {status?.has_key
          ? <>키 등록됨 <span className="font-mono">●●●●{status.key_last4}</span></>
          : <span className="text-red-600">키 미등록</span>}
      </div>
      <div className="text-xs mt-1 text-muted-foreground">NVIDIA Nemotron-OCR-v2</div>
    </div>
  );
}

function OcrSection() {
  const qc = useQueryClient();
  const { data: status, refetch: refetchStatus } = useOcrStatus();
  const { data: en } = useOcrEnabled();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<null | { ok: boolean; msg: string }>(null);
  const [editing, setEditing] = useState(false);
  const [pwd, setPwd] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const hasKey = !!status?.has_key;

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("ocr-image", { body: { test: true } });
      if (error) throw error;
      if (data?.ok) setResult({ ok: true, msg: "정상적으로 OCR 서비스에 연결되었습니다." });
      else setResult({ ok: false, msg: data?.detail ? `연결 실패 (${data.status ?? "?"}) — ${String(data.detail).slice(0, 200)}` : "연결 실패" });
    } catch (e: any) {
      setResult({ ok: false, msg: e?.message ?? "연결 실패" });
    } finally {
      setTesting(false);
    }
  };

  const toggle = async (next: boolean) => {
    if (!en?.seasonId) return;
    if (next && !hasKey) {
      toast.error("API 키가 등록되지 않았습니다. 먼저 키를 등록하세요.");
      return;
    }
    const { error } = await supabase.from("app_settings").upsert({ season_id: en.seasonId, ocr_enabled: next } as any);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["app_settings"] });
    qc.invalidateQueries({ queryKey: ["app_settings_ocr"] });
    qc.invalidateQueries({ queryKey: ["ocr_enabled"] });
    toast.success(next ? "OCR 기능이 켜졌습니다" : "OCR 기능이 꺼졌습니다");
  };

  const saveConfig = async () => {
    if (!pwd.trim()) { toast.error("관리자 비밀번호를 입력하세요."); return; }
    if (!newKey.trim() && !newUrl.trim()) { toast.error("변경할 값을 입력하세요."); return; }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("ocr_config_update" as any, {
        current_admin: pwd, new_api_key: newKey || null, new_base_url: newUrl || null,
      });
      if (error) throw error;
      toast.success("저장되었습니다");
      setPwd(""); setNewKey(""); setNewUrl(""); setEditing(false);
      await refetchStatus();
    } catch (e: any) {
      toast.error(e?.message ?? "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 w-full max-w-xl">
      {/* Toggle */}
      <div className="rounded-lg border p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">OCR 기능 사용</div>
          <div className="text-xs text-muted-foreground mt-1">
            끄면 사전접수 화면에서 이미지 첨부/OCR 입력이 숨겨집니다.
          </div>
          {!hasKey && (
            <div className="text-xs text-red-600 mt-1">API 키가 등록되어 있지 않아 켤 수 없습니다.</div>
          )}
        </div>
        <Switch checked={!!en?.enabled} onCheckedChange={toggle} disabled={!hasKey} className="shrink-0" />
      </div>

      {/* Status */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {hasKey ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="h-4 w-4 shrink-0 text-red-600" />}
          {hasKey
            ? <>API 키 등록됨 <span className="font-mono text-muted-foreground">●●●●{status?.key_last4}</span></>
            : <>API 키 미등록</>}
        </div>
        <div className="text-xs text-muted-foreground break-all">
          엔드포인트: <code className="font-mono">{status?.base_url || "https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2"}</code>
        </div>
        <div className="text-xs text-muted-foreground">
          모델: <b>NVIDIA Nemotron-OCR-v2</b> · PNG/JPEG 이미지에서 텍스트 추출
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={runTest} disabled={testing} size="sm">
          {testing ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 테스트 중...</> : "연결 테스트"}
        </Button>
        <Button size="sm" variant={editing ? "secondary" : "outline"} onClick={() => setEditing((v) => !v)}>
          {editing ? "취소" : "키 변경 / 수정"}
        </Button>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="rounded-lg border p-4 space-y-3 bg-background">
          <div className="w-full">
            <Label className="text-xs">관리자 비밀번호 (확인)</Label>
            <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="현재 관리자 비밀번호" className="w-full" />
          </div>
          <div className="w-full">
            <Label className="text-xs">새 API 키 (비워두면 유지)</Label>
            <Input type="password" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="nvapi-..." className="w-full font-mono" />
          </div>
          <div className="w-full">
            <Label className="text-xs">새 엔드포인트 URL (비워두면 유지)</Label>
            <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2" className="w-full font-mono text-xs" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveConfig} disabled={saving} size="sm">
              {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 저장 중...</> : "저장"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setPwd(""); setNewKey(""); setNewUrl(""); }}>취소</Button>
          </div>
          <div className="text-xs text-muted-foreground">
            빈 값은 저장되지 않으며 기존 값이 유지됩니다. 저장된 키는 서버에만 보관되고 마지막 4자리만 표시됩니다.
          </div>
        </div>
      )}

      {result && (
        <div className={`rounded border px-3 py-2 text-sm flex items-start gap-2 ${
          result.ok ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-100" :
                     "border-red-300 bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-100"
        }`}>
          {result.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5" /> : <XCircle className="h-4 w-4 mt-0.5" />}
          <div className="break-all">{result.msg}</div>
        </div>
      )}

      <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
        <div>• API 키/엔드포인트는 서버에만 저장되며, 화면에는 마지막 4자리만 노출됩니다.</div>
        <div>• 사용처: 사전접수 페이지의 이미지 첨부 → 자동 텍스트 추출 → 기존 파서로 명단 추출.</div>
      </div>

      <BackupKeySection status={status} refetchStatus={refetchStatus} />
    </div>
  );
}

function BackupKeySection({
  status,
  refetchStatus,
}: {
  status: { has_backup_key?: boolean; backup_key_last4?: string | null } | undefined;
  refetchStatus: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pwd, setPwd] = useState("");
  const [newKey, setNewKey] = useState("");
  const [saving, setSaving] = useState(false);
  const has = !!status?.has_backup_key;

  const save = async (clear = false) => {
    if (!pwd.trim()) { toast.error("관리자 비밀번호를 입력하세요."); return; }
    if (!clear && !newKey.trim()) { toast.error("새 백업 키를 입력하세요."); return; }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("ocr_backup_key_update" as any, {
        current_admin: pwd,
        new_key: clear ? "" : newKey,
      });
      if (error) throw error;
      toast.success(clear ? "백업 키를 삭제했습니다" : "백업 키를 저장했습니다");
      setPwd(""); setNewKey(""); setEditing(false);
      await refetchStatus();
    } catch (e: any) {
      toast.error(e?.message ?? "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border-2 border-violet-200 dark:border-violet-900/50 bg-violet-50/50 dark:bg-violet-900/10 p-4 space-y-3 mt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">
          대용량 파서 API 키 <span className="text-xs font-normal text-muted-foreground">(3단계 백업)</span>
        </div>
        <div className="text-xs">
          {has
            ? <span className="text-emerald-700 dark:text-emerald-400">등록됨 <span className="font-mono">nvapi-...{status?.backup_key_last4}</span></span>
            : <span className="text-red-600">미등록</span>}
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        기본 AI(2단계)가 토큰 초과·오류로 실패할 때만 대용량 모델(<span className="font-mono">nvidia/nemotron-3-ultra-550b-a55b</span>)로 자동 재시도합니다.
        키 값은 서버에만 저장되며, 화면에는 마지막 4자리만 노출됩니다.
      </div>
      {!editing ? (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            {has ? "백업 키 변경" : "백업 키 등록"}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <Label className="text-xs">관리자 비밀번호</Label>
            <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="현재 관리자 비밀번호" className="w-full" />
          </div>
          <div>
            <Label className="text-xs">새 백업 API 키</Label>
            <Input type="password" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="nvapi-..." className="w-full font-mono" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => save(false)} disabled={saving}>
              {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 저장 중...</> : "저장"}
            </Button>
            {has && (
              <Button size="sm" variant="destructive" onClick={() => save(true)} disabled={saving}>
                삭제
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setPwd(""); setNewKey(""); }}>취소</Button>
          </div>
        </div>
      )}
    </div>
  );
}


