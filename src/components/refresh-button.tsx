// 화면 공통 수동 새로고침 버튼 (자동 갱신이 놓쳤을 때의 보조 수단)
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RefreshButton({
  onRefresh,
  busy,
  className,
}: {
  onRefresh: () => void | Promise<unknown>;
  busy?: boolean;
  className?: string;
}) {
  return (
    <Button variant="outline" size="sm" onClick={() => onRefresh()} disabled={busy} className={className}>
      <RefreshCw className={`mr-1 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
      새로고침
    </Button>
  );
}
