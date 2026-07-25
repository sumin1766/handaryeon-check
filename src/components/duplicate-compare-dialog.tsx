import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, ShieldOff } from "lucide-react";
import type { DuplicateGroup } from "@/lib/duplicate-check";
import { formatTime } from "@/lib/format";

type PersonLite = { church_id: string; name: string | null; note?: string | null };

const normName = (s: string | null | undefined) =>
  (s ?? "").replace(/\s+/g, "").trim();

export function DuplicateCompareDialog({
  group,
  people,
  onClose,
  onEdit,
  onDelete,
  onDismissPair,
  editLabel = "편집",
}: {
  group: DuplicateGroup | null;
  people: PersonLite[];
  onClose: () => void;
  onEdit?: (churchId: string) => void;
  onDelete?: (churchId: string) => void;
  onDismissPair?: (aId: string, bId: string) => void;
  editLabel?: string;
}) {
  const [pendingDelete, setPendingDelete] = useState<
    | { id: string; name: string; denomination: string; createdAt?: string | null }
    | null
  >(null);

  const overlapSet = useMemo(() => {
    if (!group) return new Set<string>();
    // names appearing in >=2 churches within the group
    const perChurch = new Map<string, Set<string>>();
    const ids = new Set(group.churches.map((c) => c.church.id));
    for (const p of people) {
      if (!ids.has(p.church_id)) continue;
      const n = normName(p.name);
      if (!n) continue;
      if (!perChurch.has(p.church_id)) perChurch.set(p.church_id, new Set());
      perChurch.get(p.church_id)!.add(n);
    }
    const counts = new Map<string, number>();
    for (const s of perChurch.values()) {
      for (const n of s) counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    return new Set(Array.from(counts.entries()).filter(([, c]) => c >= 2).map(([n]) => n));
  }, [group, people]);

  const peopleByChurch = useMemo(() => {
    const m = new Map<string, PersonLite[]>();
    for (const p of people) {
      const arr = m.get(p.church_id) ?? [];
      arr.push(p);
      m.set(p.church_id, arr);
    }
    return m;
  }, [people]);

  if (!group) return null;

  const count = group.churches.length;
  const colClass =
    count === 2
      ? "grid grid-cols-1 md:grid-cols-2 gap-3"
      : count === 3
      ? "grid grid-cols-1 md:grid-cols-3 gap-3"
      : "flex gap-3 overflow-x-auto pb-2";

  const columnStyle: React.CSSProperties =
    count >= 4 ? { minWidth: "280px", flex: "0 0 320px" } : {};

  return (
    <>
      <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              중복 의심 나란히 비교 —{" "}
              <span className="font-semibold">{group.name}</span>
              {group.denomination && (
                <span className="ml-1 text-sm text-muted-foreground">({group.denomination})</span>
              )}
              <span className="ml-2 text-sm text-muted-foreground">{count}건</span>
            </DialogTitle>
          </DialogHeader>

          <div className={colClass}>
            {group.churches.map((c, idx) => {
              const ps = peopleByChurch.get(c.church.id) ?? [];
              const others = group.churches.filter((o) => o.church.id !== c.church.id);
              return (
                <div
                  key={c.church.id}
                  className="rounded border p-3 space-y-2 bg-background"
                  style={columnStyle}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                        {idx + 1}
                      </span>
                      <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${c.church.source === "onsite" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>
                        {c.church.source === "onsite" ? "현장" : "사전"}
                      </span>
                      <div className="font-semibold text-sm truncate">{c.church.name}</div>
                    </div>
                    {c.church.denomination && (
                      <div className="text-xs text-muted-foreground">{c.church.denomination}</div>
                    )}
                    <div className="text-xs text-muted-foreground tabular-nums">
                      명단 {ps.length}명 · 등록 {formatTime(c.church.created_at)}
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {onEdit && (
                        <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => onEdit(c.church.id)}>
                          <Pencil className="h-3 w-3 mr-1" /> {editLabel}
                        </Button>
                      )}
                      {onDelete && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-destructive hover:text-destructive"
                          onClick={() =>
                            setPendingDelete({
                              id: c.church.id,
                              name: c.church.name ?? "",
                              denomination: c.church.denomination ?? "",
                              createdAt: c.church.created_at,
                            })
                          }
                        >
                          <Trash2 className="h-3 w-3 mr-1" /> 삭제
                        </Button>
                      )}
                    </div>
                    {onDismissPair && others.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1 border-t mt-1">
                        <span className="text-[10px] text-muted-foreground w-full">중복 아님으로 표시:</span>
                        {others.map((o) => {
                          const otherIdx = group.churches.findIndex((x) => x.church.id === o.church.id) + 1;
                          return (
                            <Button
                              key={o.church.id}
                              size="sm"
                              variant="outline"
                              className="h-6 px-1.5 text-[10px]"
                              onClick={() => onDismissPair(c.church.id, o.church.id)}
                              title={`이 카드(${idx + 1})와 ${otherIdx}번 카드를 서로 다른 교회로 표시`}
                            >
                              <ShieldOff className="h-3 w-3 mr-0.5" />
                              {idx + 1}↔{otherIdx}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-2">
                    {ps.length === 0 ? (
                      <div className="text-xs text-muted-foreground">명단 없음</div>
                    ) : (
                      <ul className="space-y-0.5 text-sm">
                        {ps.map((p, i) => {
                          const isOverlap = overlapSet.has(normName(p.name));
                          return (
                            <li
                              key={i}
                              className={`px-1.5 py-0.5 rounded ${
                                isOverlap
                                  ? "bg-red-100 text-red-900 font-semibold dark:bg-red-900/30 dark:text-red-100"
                                  : ""
                              }`}
                            >
                              {p.name}
                              {p.note && (
                                <span className={`ml-1 text-xs ${isOverlap ? "text-red-800/80 dark:text-red-200/80" : "text-muted-foreground"}`}>
                                  ({p.note})
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-muted-foreground mt-2">
            빨간 배경으로 표시된 이름은 두 개 이상 등록에서 겹친 이름입니다. "중복 아님" 버튼은 서로 다른 교회임을 표시(저장)하며, 다음부터 중복 목록에서 제외됩니다.
          </p>
        </DialogContent>
      </Dialog>

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
    </>
  );
}
