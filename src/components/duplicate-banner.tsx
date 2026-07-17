import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import type { DuplicateGroup } from "@/lib/duplicate-check";
import { formatTime } from "@/lib/format";

export function DuplicateBanner({
  groups,
  onSelect,
}: {
  groups: DuplicateGroup[];
  onSelect?: (churchId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (groups.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-400/60 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-500/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-amber-900 dark:text-amber-100"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <AlertTriangle className="h-4 w-4" />
        <span className="font-semibold">중복 의심 교회 {groups.length}건</span>
        <span className="text-xs text-amber-800/80 dark:text-amber-200/80">
          — 교회명·교단 일치 + 명단 겹침 2명 이상
        </span>
      </button>
      {open && (
        <div className="border-t border-amber-300/50 dark:border-amber-500/30 px-3 py-2 space-y-3">
          {groups.map((g) => (
            <div key={g.key} className="rounded border border-amber-300/60 bg-white/60 dark:bg-black/20 p-2">
              <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                {g.name}
                {g.denomination && <span className="ml-1 text-xs opacity-70">({g.denomination})</span>}
              </div>
              <ul className="mt-1.5 space-y-1">
                {g.churches.map((c) => (
                  <li
                    key={c.church.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 rounded bg-amber-50/60 dark:bg-amber-900/10 px-2 py-1.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${c.church.source === "onsite" ? "bg-amber-200 text-amber-900" : "bg-sky-100 text-sky-800"}`}>
                        {c.church.source === "onsite" ? "현장" : "사전"}
                      </span>
                      <span className="font-medium">명단 {c.peopleCount}명</span>
                      <span className="text-muted-foreground">
                        겹침: {c.overlappingNames.slice(0, 6).join(", ")}
                        {c.overlappingNames.length > 6 ? " …" : ""}
                      </span>
                      <span className="text-muted-foreground">
                        등록 {formatTime(c.church.created_at)}
                      </span>
                    </div>
                    {onSelect && (
                      <button
                        type="button"
                        onClick={() => onSelect(c.church.id)}
                        className="self-start sm:self-auto text-[11px] rounded border border-amber-400/60 px-2 py-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                      >
                        상세/편집
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
