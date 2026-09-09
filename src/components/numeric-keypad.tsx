// 모바일 숫자 키패드 — 접수시트(실접수 인원 입력)와 QR 체크인에서 공용으로 사용.
export function NumericKeypad({
  label, value, onChange, onSubmit, onClose,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const press = (d: string) => {
    if (value.length >= 5) return;
    if (value === "0") onChange(d);
    else onChange(value + d);
  };
  const back = () => onChange(value.slice(0, -1));
  const keys = ["1","2","3","4","5","6","7","8","9"];
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="flex-1 bg-black/30 backdrop-blur-[1px]"
      />
      <div
        className="bg-background border-t shadow-2xl animate-in slide-in-from-bottom duration-200 px-3 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="text-sm font-semibold truncate">{label}</div>
          <div className="text-2xl font-bold tabular-nums min-w-16 text-right">{value || "0"}</div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              className="h-14 min-h-11 rounded-lg border bg-card hover:bg-muted active:bg-muted/70 text-2xl font-semibold tabular-nums"
            >
              {k}
            </button>
          ))}
          <button
            type="button"
            onClick={back}
            className="h-14 min-h-11 rounded-lg border bg-card hover:bg-muted active:bg-muted/70 text-lg font-medium"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => press("0")}
            className="h-14 min-h-11 rounded-lg border bg-card hover:bg-muted active:bg-muted/70 text-2xl font-semibold tabular-nums"
          >
            0
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="h-14 min-h-11 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 text-lg font-semibold"
          >
            입력
          </button>
        </div>
      </div>
    </div>
  );
}
