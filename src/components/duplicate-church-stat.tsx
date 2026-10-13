import { duplicateSubmissionCount } from "@/lib/pre-registration-display";

export function DuplicateChurchStat({ confirmedCount, churchCount, failed = false }: {
  confirmedCount: number;
  churchCount: number | null;
  failed?: boolean;
}) {
  const duplicates = churchCount === null ? null : duplicateSubmissionCount(confirmedCount, churchCount);
  return (
    <div className="min-w-0 rounded-xl border p-3">
      <div className="text-xs text-muted-foreground">중복교회</div>
      <div className="text-lg font-semibold mt-0.5">{duplicates === null ? "중복 —건" : `중복 ${duplicates}건`}</div>
      <div className="text-xs text-muted-foreground mt-0.5 break-words">
        {duplicates === null ? (failed ? "확정 교회 수 조회 실패" : "확정 교회 수 조회 중…") : `신청(확정) ${confirmedCount}건 · 중복 ${duplicates}건 → 확정 교회 ${churchCount}곳`}
      </div>
    </div>
  );
}