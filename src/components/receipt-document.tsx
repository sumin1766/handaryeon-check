import { Card } from "@/components/ui/card";
import { krw, num, amountToKorean, formatDate } from "@/lib/format";
import {
  RECEIPT_CANVAS,
  RECEIPT_ELEMENTS,
  getPos,
  type ReceiptLayout,
  type ReceiptElementId,
} from "@/lib/receipt-layout";
import { useRef, useState, type ReactNode } from "react";

export type ReceiptMode = "transfer" | "card";
export type ReceiptData = {
  church: string;
  date: string;
  amount: number;
  method: string;
  lodging_count: number;
  non_lodging_count: number;
  content: string;
};

function renderBlock(id: ReceiptElementId, mode: ReceiptMode, f: ReceiptData, total: number): ReactNode {
  switch (id) {
    case "title":
      return (
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-[0.3em]">
            {mode === "transfer" ? "입 금 확 인 서" : "결 제 확 인 서"}
          </h2>
        </div>
      );
    case "recipient":
      return (
        <div className="text-sm">
          수신: <b className="text-base">{f.church || "_______________"}</b> 귀중
        </div>
      );
    case "statement":
      return (
        <p className="leading-relaxed">
          아래와 같이 {mode === "transfer" ? "입금" : "결제"}되었음을 확인합니다.
        </p>
      );
    case "table":
      return (
        <table className="w-full border-collapse border border-black text-sm">
          <tbody>
            <Row label={mode === "transfer" ? "입금일" : "결제일"} value={formatDate(f.date)} />
            <Row label={mode === "transfer" ? "입금금액" : "결제금액"} value={`${krw(f.amount)} (${amountToKorean(f.amount)})`} />
            <Row label={mode === "transfer" ? "입금방법" : "결제방법"} value={f.method} />
            <Row label="인원" value={`숙박 ${num(f.lodging_count)}명 / 비숙박 ${num(f.non_lodging_count)}명 / 합계 ${num(total)}명`} />
            <Row label="내용" value={`${f.content} ${total ? `(${total}명)` : ""}`} />
          </tbody>
        </table>
      );
    case "date_footer":
      return <div className="text-center text-base">{formatDate(f.date)}</div>;
    case "org_footer":
      return (
        <div className="text-center space-y-1">
          <div className="text-lg font-bold">한국다음세대훈련원</div>
          <div className="text-sm">사업자등록번호 504-82-87922</div>
          <div className="text-sm">대표 손현보</div>
        </div>
      );
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <th className="border border-black bg-gray-100 w-32 px-3 py-2 text-left">{label}</th>
      <td className="border border-black px-3 py-2">{value}</td>
    </tr>
  );
}

export function ReceiptDocument({
  mode, f, total, layout, scale = 1,
}: { mode: ReceiptMode; f: ReceiptData; total: number; layout?: ReceiptLayout; scale?: number }) {
  return (
    <Card
      className="bg-white text-black overflow-hidden"
      style={{
        width: RECEIPT_CANVAS.width * scale,
        height: RECEIPT_CANVAS.height * scale,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: RECEIPT_CANVAS.width,
          height: RECEIPT_CANVAS.height,
          transform: scale === 1 ? undefined : `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {RECEIPT_ELEMENTS.map((el) => {
          const pos = getPos(layout, el.id);
          return (
            <div
              key={el.id}
              style={{ position: "absolute", left: pos.x, top: pos.y, width: pos.w }}
            >
              {renderBlock(el.id, mode, f, total)}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function ReceiptLayoutEditor({
  mode, f, total, layout, onChange,
}: {
  mode: ReceiptMode;
  f: ReceiptData;
  total: number;
  layout: ReceiptLayout;
  onChange: (l: ReceiptLayout) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: ReceiptElementId; offX: number; offY: number } | null>(null);

  const onMouseDown = (id: ReceiptElementId) => (e: React.MouseEvent) => {
    e.preventDefault();
    const pos = getPos(layout, id);
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setDrag({ id, offX: e.clientX - rect.left - pos.x, offY: e.clientY - rect.top - pos.y });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(RECEIPT_CANVAS.width - 50, e.clientX - rect.left - drag.offX));
    const y = Math.max(0, Math.min(RECEIPT_CANVAS.height - 30, e.clientY - rect.top - drag.offY));
    const pos = getPos(layout, drag.id);
    onChange({ ...layout, [drag.id]: { ...pos, x: Math.round(x), y: Math.round(y) } });
  };

  const onMouseUp = () => setDrag(null);

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      className="relative bg-white border-2 border-dashed border-primary/40 select-none"
      style={{ width: RECEIPT_CANVAS.width, height: RECEIPT_CANVAS.height }}
    >
      {RECEIPT_ELEMENTS.map((el) => {
        const pos = getPos(layout, el.id);
        const active = drag?.id === el.id;
        return (
          <div
            key={el.id}
            onMouseDown={onMouseDown(el.id)}
            className={`absolute cursor-move group ring-1 ${active ? "ring-2 ring-primary" : "ring-primary/20 hover:ring-primary/60"}`}
            style={{ left: pos.x, top: pos.y, width: pos.w }}
          >
            <div className="absolute -top-5 left-0 text-[10px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded opacity-80 group-hover:opacity-100 pointer-events-none">
              {el.label}
            </div>
            <div className="pointer-events-none">{renderBlock(el.id, mode, f, total)}</div>
          </div>
        );
      })}
    </div>
  );
}
