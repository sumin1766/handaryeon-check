import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Trash2, Columns } from "lucide-react";
import type { DuplicateGroup } from "@/lib/duplicate-check";
import { formatTime } from "@/lib/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function DuplicateBanner({
  groups,
  onCompareGroup,
  onDelete,
}: {
  groups: DuplicateGroup[];
  onCompareGroup?: (group: DuplicateGroup) => void;
  onDelete?: (churchId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<
    | { id: string; name: string; denomination: string; createdAt?: string | null }
    | null
  >(null);

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
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                  {g.name}
                  {g.denomination && <span className="ml-1 text-xs opacity-70">({g.denomination})</span>}
                </div>
                {onCompareGroup && (
                  <button
                    type="button"
                    onClick={() => onCompareGroup(g)}
                    className="inline-flex items-center gap-1 rounded border border-amber-400/60 px-2 py-0.5 text-[11px] hover:bg-amber-100 dark:hover:bg-amber-900/30"
                  >
                    <Columns className="h-3 w-3" /> 나란히 비교 ({g.churches.length})
                  </button>
                )}
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
                    <div className="flex items-center gap-1 self-start sm:self-auto">
                      {onCompareGroup && (
                        <button
                          type="button"
                          onClick={() => onCompareGroup(g)}
                          className="text-[11px] rounded border border-amber-400/60 px-2 py-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                        >
                          상세/편집
                        </button>
                      )}
                      {onDelete && (
                        <button
                          type="button"
                          onClick={() =>
                            setPendingDelete({
                              id: c.church.id,
                              name: c.church.name ?? "",
                              denomination: c.church.denomination ?? "",
                              createdAt: c.church.created_at,
                            })
                          }
                          className="inline-flex items-center gap-1 text-[11px] rounded border border-red-400/60 px-2 py-0.5 text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/30"
                        >
                          <Trash2 className="h-3 w-3" /> 삭제
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>명단을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && (
                <>
                  <b>{pendingDelete.name}</b>
                  {pendingDelete.denomination && ` (${pendingDelete.denomination})`}
                  {pendingDelete.createdAt && `, 등록 ${formatTime(pendingDelete.createdAt)}`}
                  {" "}명단을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>아니오</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete && onDelete) onDelete(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              예, 삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
