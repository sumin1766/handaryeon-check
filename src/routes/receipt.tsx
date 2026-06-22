import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { krw, num, amountToKorean, formatDate } from "@/lib/format";
import { Printer } from "lucide-react";

export const Route = createFileRoute("/receipt")({
  head: () => ({ meta: [{ title: "영수증 — 한다련 캠프" }] }),
  component: ReceiptPage,
});

type Mode = "transfer" | "card";

function ReceiptPage() {
  const [mode, setMode] = useState<Mode>("transfer");
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    church: "",
    date: today,
    amount: 0,
    method: "계좌이체",
    lodging_count: 0,
    non_lodging_count: 0,
    content: "한다련 여름캠프 회비",
  });
  const total = (f.lodging_count || 0) + (f.non_lodging_count || 0);

  return (
    <AppShell>
      <div className="space-y-4">
        <header className="flex items-end justify-between no-print">
          <div>
            <h1 className="text-2xl font-bold">영수증 / 확인서</h1>
            <p className="text-sm text-muted-foreground">우측에 입력 → 좌측 문서에 실시간 반영 → 인쇄</p>
          </div>
          <Button onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />인쇄</Button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="printable">
            <DocumentPreview mode={mode} f={f} total={total} />
          </div>

          <Card className="p-5 space-y-3 no-print">
            <Tabs value={mode} onValueChange={(v) => {
              const newMode = v as Mode;
              setMode(newMode);
              setF((p) => ({ ...p, method: newMode === "transfer" ? "계좌이체" : "신용카드(홈페이지)" }));
            }}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="transfer">입금확인서 (계좌이체)</TabsTrigger>
                <TabsTrigger value="card">결제확인서 (카드결제)</TabsTrigger>
              </TabsList>
            </Tabs>

            <div>
              <Label className="text-xs">교회이름 (수신처)</Label>
              <Input value={f.church} onChange={(e) => setF({ ...f, church: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{mode === "transfer" ? "입금일" : "결제일"}</Label>
                <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">{mode === "transfer" ? "입금방법" : "결제방법"}</Label>
                <Input value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">숙박 인원</Label>
                <Input type="number" value={f.lodging_count} onChange={(e) => setF({ ...f, lodging_count: parseInt(e.target.value) || 0 })} className="text-right tabular-nums" />
              </div>
              <div>
                <Label className="text-xs">비숙박 인원</Label>
                <Input type="number" value={f.non_lodging_count} onChange={(e) => setF({ ...f, non_lodging_count: parseInt(e.target.value) || 0 })} className="text-right tabular-nums" />
              </div>
              <div>
                <Label className="text-xs">합계</Label>
                <div className="h-9 px-3 flex items-center rounded border bg-muted/40 tabular-nums font-semibold">{num(total)}명</div>
              </div>
            </div>
            <div>
              <Label className="text-xs">내용</Label>
              <Input value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">{mode === "transfer" ? "입금금액" : "결제금액"} (원)</Label>
              <Input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: parseInt(e.target.value) || 0 })} className="text-right tabular-nums" />
              <div className="mt-1 text-xs text-muted-foreground">{amountToKorean(f.amount)}</div>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function DocumentPreview({ mode, f, total }: { mode: Mode; f: any; total: number }) {
  const title = mode === "transfer" ? "입 금 확 인 서" : "결 제 확 인 서";
  return (
    <Card className="p-10 min-h-[850px] bg-white text-black">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold tracking-[0.3em]">{title}</h2>
      </div>

      <div className="mb-8">
        <div className="text-sm">수신: <b className="text-base">{f.church || "_______________"}</b> 귀중</div>
      </div>

      <p className="mb-6 leading-relaxed">
        아래와 같이 {mode === "transfer" ? "입금" : "결제"}되었음을 확인합니다.
      </p>

      <table className="w-full border-collapse border border-black text-sm mb-8">
        <tbody>
          <Row label={mode === "transfer" ? "입금일" : "결제일"} value={formatDate(f.date)} />
          <Row label={mode === "transfer" ? "입금금액" : "결제금액"} value={`${krw(f.amount)} (${amountToKorean(f.amount)})`} />
          <Row label={mode === "transfer" ? "입금방법" : "결제방법"} value={f.method} />
          <Row label="인원" value={`숙박 ${num(f.lodging_count)}명 / 비숙박 ${num(f.non_lodging_count)}명 / 합계 ${num(total)}명`} />
          <Row label="내용" value={`${f.content} ${total ? `(${total}명)` : ""}`} />
        </tbody>
      </table>

      <div className="text-center text-base mt-12">{formatDate(f.date)}</div>

      <div className="mt-16 text-center space-y-1">
        <div className="text-lg font-bold">한국다음세대훈련원</div>
        <div className="text-sm">사업자등록번호 504-82-87922</div>
        <div className="text-sm">대표 손현보</div>
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <th className="border border-black bg-gray-100 w-32 px-3 py-2 text-left">{label}</th>
      <td className="border border-black px-3 py-2">{value}</td>
    </tr>
  );
}
