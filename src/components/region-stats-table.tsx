import { useState } from "react";
import { FileDown, ImageDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRegionStats } from "@/lib/use-region-stats";
import { exportRegionStats } from "@/lib/region-export";
import { RegionLoadState } from "@/components/region-load-state";

export function RegionStatsTable() {
  const query = useRegionStats();
  const [exporting, setExporting] = useState<"pdf" | "png" | null>(null);
  if (query.isViewingPast) return null;
  const stats = query.data;
  if (!stats) return <RegionLoadState query={query} />;
  const save = async (format: "pdf" | "png") => {
    setExporting(format);
    try { await exportRegionStats(stats, format); }
    catch (error) { toast.error(error instanceof Error ? error.message : "내보내기에 실패했습니다."); }
    finally { setExporting(null); }
  };
  return <section className="region-visual space-y-4 border-t border-border pt-6" aria-labelledby="region-table-title">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="region-table-title" className="text-lg font-semibold">지역별 교회 집계</h2><p className="text-sm text-muted-foreground mt-1">{stats.seasonName} · 전국 합계 {stats.total}교회</p></div>
      <div className="flex gap-2">
        <Button variant="outline" disabled={!!exporting} onClick={() => save("pdf")}>{exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}PDF</Button>
        <Button variant="outline" disabled={!!exporting} onClick={() => save("png")}>{exporting === "png" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageDown className="h-4 w-4" />}PNG</Button>
      </div>
    </header>
    <div className="overflow-x-auto">
      <table className="w-full tabular-nums region-stats-table">
        <thead><tr><th className="text-left">시/도</th><th className="text-left">시군구</th><th className="text-right">교회 수</th></tr></thead>
        <tbody>{stats.rows.map((row) => <tr key={`${row.sido}-${row.sigungu}-${row.kind}`} className={`region-row-${row.kind}`}><td>{row.sido}</td><td>{row.sigungu}</td><td className="text-right">{row.count.toLocaleString()}교회</td></tr>)}</tbody>
      </table>
    </div>
  </section>;
}