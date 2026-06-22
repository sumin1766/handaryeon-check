import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useActiveSeason } from "@/lib/use-active-season";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/use-realtime";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import { krw, num, weekdayOf, formatTime, WEEKDAYS } from "@/lib/format";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/bath-coupons")({
  head: () => ({ meta: [{ title: "목욕쿠폰 — 한다련 캠프" }] }),
  component: BathPage,
});

function BathPage() {
  const { season } = useActiveSeason();
  const qc = useQueryClient();
  useRealtimeInvalidate(["bath_coupons", "app_settings"], [["bath", season?.id]]);

  const { data } = useQuery({
    queryKey: ["bath", season?.id],
    enabled: !!season?.id,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("bath_coupons").select("*").eq("season_id", season!.id).order("created_at", { ascending: false });
      const { data: settings } = await supabase
        .from("app_settings").select("*").eq("season_id", season!.id).maybeSingle();
      return { rows: rows ?? [], unit: settings?.bath_unit_price ?? 5000 };
    },
  });

  const rows = data?.rows ?? [];
  const unit = data?.unit ?? 5000;

  const [form, setForm] = useState({ name: "", qty: 1 });

  const add = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("이름 필수");
      const qty = form.qty || 1;
      const now = new Date();
      await supabase.from("bath_coupons").insert({
        season_id: season!.id, name: form.name.trim(), qty, amount: qty * unit,
        weekday: WEEKDAYS[now.getDay()],
      });
    },
    onSuccess: () => {
      setForm({ name: "", qty: 1 });
      qc.invalidateQueries({ queryKey: ["bath"] });
      toast.success("추가됨");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (row: any) => {
      const amount = (row.qty || 0) * unit;
      await supabase.from("bath_coupons").update({
        name: row.name, qty: row.qty, amount,
        paid_transfer: row.paid_transfer, transfer_at: row.transfer_at,
        paid_cash: row.paid_cash, cash_at: row.cash_at,
        weekday: row.weekday,
      }).eq("id", row.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bath"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { await supabase.from("bath_coupons").delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bath"] }),
  });

  // weekday aggregation
  const weekdayAgg = WEEKDAYS.map((w) => {
    const r = rows.filter((x: any) => x.weekday === w);
    return {
      w,
      people: r.length,
      qty: r.reduce((s, x: any) => s + x.qty, 0),
      amount: r.reduce((s, x: any) => s + x.amount, 0),
      transfer: r.filter((x: any) => x.paid_transfer).reduce((s, x: any) => s + x.amount, 0),
      cash: r.filter((x: any) => x.paid_cash).reduce((s, x: any) => s + x.amount, 0),
    };
  }).filter((x) => x.people > 0);

  const totals = {
    people: rows.length,
    qty: rows.reduce((s: number, x: any) => s + x.qty, 0),
    amount: rows.reduce((s: number, x: any) => s + x.amount, 0),
    transfer: rows.filter((x: any) => x.paid_transfer).reduce((s: number, x: any) => s + x.amount, 0),
    cash: rows.filter((x: any) => x.paid_cash).reduce((s: number, x: any) => s + x.amount, 0),
  };

  if (!season) return <AppShell><div className="text-sm text-muted-foreground">시즌이 없습니다.</div></AppShell>;

  return (
    <AppShell>
      <div className="space-y-4">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold">목욕쿠폰</h1>
            <p className="text-sm text-muted-foreground">1매 = {krw(unit)} · 설정에서 변경</p>
          </div>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat label="총 인원" v={num(totals.people)} unit="명" />
          <Stat label="총 매수" v={num(totals.qty)} unit="매" />
          <Stat label="총 금액" v={krw(totals.amount)} />
          <Stat label="입금 합계" v={krw(totals.transfer)} />
          <Stat label="현금 합계" v={krw(totals.cash)} />
        </div>

        {weekdayAgg.length > 0 && (
          <Card className="p-3">
            <div className="text-sm font-semibold mb-2">요일별 판매현황</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {weekdayAgg.map((d) => (
                <div key={d.w} className="rounded border p-2 text-xs tabular-nums">
                  <div className="font-semibold text-sm">{d.w}요일</div>
                  <div>인원 {d.people} / 매수 {d.qty}</div>
                  <div>금액 {krw(d.amount)}</div>
                  <div className="text-muted-foreground">입금 {krw(d.transfer)} · 현금 {krw(d.cash)}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card className="p-4">
          <div className="flex items-end gap-2 mb-3">
            <div className="flex-1">
              <label className="text-xs">이름</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="w-24">
              <label className="text-xs">매수</label>
              <Input type="number" min={1} value={form.qty} onChange={(e) => setForm({ ...form, qty: parseInt(e.target.value) || 1 })} className="text-right tabular-nums" />
            </div>
            <div className="w-32">
              <label className="text-xs">금액</label>
              <div className="h-9 flex items-center px-2 text-sm font-semibold rounded border bg-muted/40 tabular-nums">
                {krw((form.qty || 0) * unit)}
              </div>
            </div>
            <Button onClick={() => add.mutate()} disabled={add.isPending}><Plus className="h-4 w-4 mr-1" />추가</Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase">
                <tr>
                  <th className="text-left px-2 py-2">이름</th>
                  <th className="text-right px-2 py-2 w-16">매수</th>
                  <th className="text-center px-2 py-2 w-14">입금</th>
                  <th className="text-left px-2 py-2 w-28">송금시간</th>
                  <th className="text-center px-2 py-2 w-14">현금</th>
                  <th className="text-left px-2 py-2 w-28">납부시간</th>
                  <th className="text-left px-2 py-2 w-16">요일</th>
                  <th className="text-right px-2 py-2 w-28">금액</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-2 py-1"><Input defaultValue={r.name} onBlur={(e) => update.mutate({ ...r, name: e.target.value })} className="h-8" /></td>
                    <td className="px-2 py-1"><Input type="number" defaultValue={r.qty} onBlur={(e) => update.mutate({ ...r, qty: parseInt(e.target.value) || 0 })} className="h-8 text-right tabular-nums" /></td>
                    <td className="text-center">
                      <Checkbox checked={r.paid_transfer} onCheckedChange={(v) => update.mutate({ ...r, paid_transfer: !!v, transfer_at: v ? new Date().toISOString() : null })} />
                    </td>
                    <td className="px-2 py-1 text-xs tabular-nums">{formatTime(r.transfer_at)}</td>
                    <td className="text-center">
                      <Checkbox checked={r.paid_cash} onCheckedChange={(v) => update.mutate({ ...r, paid_cash: !!v, cash_at: v ? new Date().toISOString() : null })} />
                    </td>
                    <td className="px-2 py-1 text-xs tabular-nums">{formatTime(r.cash_at)}</td>
                    <td className="px-2 py-1 text-xs">{r.weekday ?? weekdayOf(r.created_at)}</td>
                    <td className="px-2 py-1 text-right font-semibold tabular-nums">{krw(r.amount)}</td>
                    <td><Button size="icon" variant="ghost" onClick={() => remove.mutate(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-10 text-sm text-muted-foreground">등록 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function Stat({ label, v, unit }: { label: string; v: any; unit?: string }) {
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
