// 화면 공통 수동 새로고침 버튼 (자동 갱신이 놓쳤을 때의 보조 수단).
// 누르면 이 화면뿐 아니라 같은 브라우저의 다른 탭도 최신 데이터로 갱신된다.
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notifyDataChanged } from "@/lib/use-realtime";

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
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        onRefresh();
        notifyDataChanged();
      }}
      disabled={busy}
      className={className}
    >
      <RefreshCw className={`mr-1 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
      새로고침
    </Button>
  );
}
