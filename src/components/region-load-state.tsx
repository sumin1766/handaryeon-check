import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
export function RegionLoadState({ query }: { query: { isError: boolean; error: Error | null; refetch: () => unknown } }) {
  return <div role={query.isError ? "alert" : "status"} className="border-t border-border py-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
    {query.isError ? `지역 집계 조회 실패: ${query.error?.message ?? "다시 조회해 주세요."}` : "지역별 교회 집계를 불러오는 중입니다."}
    {query.isError && <Button variant="outline" size="sm" onClick={() => query.refetch()}><RefreshCw className="h-4 w-4" />다시 조회</Button>}
  </div>;
}