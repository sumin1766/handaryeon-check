import { useState } from "react";
import { ChevronDown, ChevronRight, Undo2, ShieldCheck } from "lucide-react";
import type { DismissalRow } from "@/lib/use-duplicate-dismissals";
import type { ChurchLike } from "@/lib/duplicate-check";

export function DismissedPairsPanel({
  rows,
  churchById,
  onRestore,
}: {
  rows: DismissalRow[];
  churchById: Map<string, ChurchLike>;
  onRestore: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-emerald-400/50 bg-emerald-50/60 dark:bg-emerald-900/10 dark:border-emerald-500/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-emerald-900 dark:text-emerald-100"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <ShieldCheck className="h-4 w-4" />
        <span className="font-semibold">중복 아님 표시 {rows.length}건</span>
        <span className="text-xs text-emerald-800/80 dark:text-emerald-200/80">
          — 클릭해 목록을 열고 필요시 복원(무시 해제) 가능
        </span>
      </button>
      {open && (
        <ul className="border-t border-emerald-300/40 dark:border-emerald-500/20 divide-y divide-emerald-200/40 dark:divide-emerald-500/10">
          {rows.map((r) => {
            const a = churchById.get(r.church_a_id);
            const b = churchById.get(r.church_b_id);
            const label = (c?: ChurchLike, fallback = "") =>
              c ? `${c.name ?? ""}${c.denomination ? ` (${c.denomination})` : ""}` : fallback || "(삭제된 교회)";
            return (
              <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                <div className="min-w-0 truncate">
                  <span className="font-medium">{label(a)}</span>
                  <span className="mx-1 text-muted-foreground">↔</span>
                  <span className="font-medium">{label(b)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onRestore(r.id)}
                  className="inline-flex items-center gap-1 rounded border border-emerald-400/60 px-2 py-0.5 text-[11px] hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
                >
                  <Undo2 className="h-3 w-3" /> 무시 해제
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
