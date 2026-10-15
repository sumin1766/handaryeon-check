// "지난 시즌 정보 가져오기" — 원본 시즌을 고르는 창. 원본은 읽기만 하고, 쓰기는 호출한 쪽(현재 시즌)에서 저장 시에만 한다.
import { useState } from "react";
import { History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSeasons } from "@/lib/use-active-season";
import { isTestSeasonName } from "@/lib/test-season";
import { cn } from "@/lib/utils";

export function SeasonImportButton({
  currentSeasonId,
  what,
  hasCurrentData,
  disabled,
  onLoad,
}: {
  currentSeasonId: string;
  what: string;
  hasCurrentData: boolean;
  disabled?: boolean;
  onLoad: (sourceSeasonId: string) => Promise<number>;
}) {
  const { data: seasons = [] } = useSeasons();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sources = seasons.filter((s) => s.id !== currentSeasonId);
  const ordered = [...sources.filter((s) => !isTestSeasonName(s.name)), ...sources.filter((s) => isTestSeasonName(s.name))];

  return (
    <>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => { setPicked(null); setOpen(true); }}>
        <History className="mr-1 h-4 w-4" /> 지난 시즌 정보 가져오기
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>지난 시즌 {what} 가져오기</DialogTitle>
            <DialogDescription>
              선택한 시즌의 {what}을(를) 읽어와 입력란에 채웁니다. 원본 시즌은 바뀌지 않으며, 저장을 눌러야 현재 시즌에 반영됩니다.
            </DialogDescription>
          </DialogHeader>
          {hasCurrentData && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
              불러오면 현재 입력 내용이 교체됩니다. (저장 전까지는 취소할 수 있습니다)
            </div>
          )}
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {ordered.length === 0 && <p className="text-sm text-muted-foreground">가져올 수 있는 다른 시즌이 없습니다.</p>}
            {ordered.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setPicked(s.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm",
                  picked === s.id ? "border-primary bg-primary/10" : "hover:bg-muted",
                )}
              >
                {isTestSeasonName(s.name) && (
                  <span className="shrink-0 rounded bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
                    [테스트]
                  </span>
                )}
                <span className="truncate">{s.name}</span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
            <Button
              disabled={!picked || busy}
              onClick={async () => {
                if (!picked) return;
                setBusy(true);
                try {
                  await onLoad(picked);
                  setOpen(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}불러오기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
