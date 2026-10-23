import { krw, num } from "@/lib/format";

export function FeeBreakdown({ lines, total }: { lines: { category: string; label: string; count: number; unit: number; subtotal: number }[]; total: number }) {
  return (
    <div className="space-y-0.5 tabular-nums">
      {lines.map((l) => (
        <div key={l.category}>{l.label} {num(l.count)}명 × {krw(l.unit)} = {krw(l.subtotal)}</div>
      ))}
      <div className="border-t pt-1 mt-1">합계 <strong>{krw(total)}</strong></div>
    </div>
  );
}
