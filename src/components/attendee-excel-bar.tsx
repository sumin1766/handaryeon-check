// 참석자 명단 엑셀 템플릿 다운로드 + 업로드(브라우저 파싱) 바.
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  downloadAttendeeTemplate,
  parseAttendeeWorkbook,
  type ParsedAttendee,
} from "@/lib/attendee-xlsx";

export function AttendeeExcelBar({ onAdd }: { onAdd: (rows: ParsedAttendee[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const onFile = async (file: File) => {
    setBusy(true);
    setErrors([]);
    try {
      const res = await parseAttendeeWorkbook(file);
      setErrors(res.errors);
      if (res.rows.length) {
        onAdd(res.rows);
        toast.success(`${res.rows.length}명을 명단에 추가했습니다.`);
      }
      if (res.skipped) toast.warning(`${res.skipped}개 행은 오류로 제외되었습니다.`);
      if (!res.rows.length && !res.skipped) toast.error("추가할 참석자를 찾지 못했습니다.");
    } catch {
      toast.error("엑셀 파일을 읽지 못했습니다. 템플릿 형식인지 확인해 주세요.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="mt-3 space-y-2 rounded-md border border-dashed p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => downloadAttendeeTemplate()}>
          <Download className="mr-1 h-4 w-4" /> 엑셀 템플릿 다운로드
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
          엑셀 업로드
        </Button>
        <span className="text-xs text-muted-foreground">
          업로드한 명단은 기존 입력 뒤에 추가되며, 이후에도 수정·삭제할 수 있습니다.
        </span>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
      </div>
      {errors.length > 0 && (
        <div className="rounded bg-destructive/10 p-2 text-xs text-destructive">
          <div className="font-medium">확인이 필요한 행 {errors.length}개</div>
          <ul className="mt-1 list-disc pl-4">
            {errors.slice(0, 10).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
            {errors.length > 10 && <li>… 외 {errors.length - 10}건</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
