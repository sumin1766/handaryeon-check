import { useState } from "react";
import { FileDown, ImageDown, Loader2, List, Copy, Sheet } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRegionStats } from "@/lib/use-region-stats";
import { exportRegionStats, exportRegionChurchList } from "@/lib/region-export";
import { getRegionChurchList } from "@/lib/region-stats.functions";
import { getSessionPassword } from "@/lib/session-password";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { RegionLoadState } from "@/components/region-load-state";
import type { RegionStats } from "@/lib/region-stats";

export function RegionStatsTable() {
  const query = useRegionStats();
  if (query.isViewingPast) return null;
  const stats = query.data;
  if (!stats) return <RegionLoadState query={query} />;
  return <RegionStatsTableView stats={stats} onRefresh={query.refetch} />;
}

export function RegionStatsSummary() {
  const query = useRegionStats();
  if (query.isViewingPast) return <>지난 시즌 조회 중에는 표시하지 않습니다.</>;
  if (query.isError) return <>집계를 불러오지 못했습니다.</>;
  if (!query.data) return <>{query.isLoading ? "불러오는 중…" : "활성 시즌이 없습니다."}</>;
  return <>{query.data.seasonName} · 전국 합계 {query.data.total.toLocaleString()}교회 (확정 기준)</>;
}

export function RegionStatsTableView({ stats, onRefresh }: { stats: RegionStats; onRefresh?: () => unknown }) {
  const [exporting, setExporting] = useState<string | null>(null);
  const readList = useServerFn(getRegionChurchList);
  const saveList = async (format: "pdf" | "xlsx" | "csv") => {
    setExporting(`list-${format}`);
    try {
      const password = getSessionPassword();
      if (!password) throw new Error("다시 로그인해 주세요.");
      const list = await readList({ data: { password } });
      if (list.seasonId !== stats.seasonId || list.rows.length !== stats.total) { onRefresh?.(); throw new Error("집계가 변경되었습니다. 새 집계를 확인한 뒤 다시 내보내 주세요."); }
      await exportRegionChurchList(list, format);
      if (format === "csv") toast.success("지역별 교회 목록을 복사했습니다.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "목록 내보내기에 실패했습니다."); }
    finally { setExporting(null); }
  };
  const save = async (format: "pdf" | "png") => {
    setExporting(format);
    try { await exportRegionStats(stats, format); }
    catch (error) { toast.error(error instanceof Error ? error.message : "내보내기에 실패했습니다."); }
    finally { setExporting(null); }
  };
  return <section className="region-visual space-y-4" aria-labelledby="region-table-title">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="region-table-title" className="text-lg font-semibold">지역별 교회 집계</h2><p className="text-sm text-muted-foreground mt-1">{stats.seasonName} · 전국 합계 {stats.total}교회 · 확정된 사전접수 기준</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!!exporting} onClick={() => save("pdf")}>{exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}PDF</Button>
        <Button variant="outline" disabled={!!exporting} onClick={() => save("png")}>{exporting === "png" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageDown className="h-4 w-4" />}PNG</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" disabled={!!exporting} className="whitespace-normal text-left h-auto min-h-9">{exporting?.startsWith("list-") ? <Loader2 className="h-4 w-4 animate-spin" /> : <List className="h-4 w-4" />}지역별 교회 목록 내보내기</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => saveList("pdf")}><FileDown />PDF</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => saveList("xlsx")}><Sheet />엑셀 (xlsx)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => saveList("csv")}><Copy />CSV 복사</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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