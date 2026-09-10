// QR 체크인 — 스태프가 교회 QR(토큰)을 스캔해 사전접수 상세를 보고 현장 체크인을 저장한다.
// 활성 시즌 전용. 조회·저장 모두 서버 함수에서 권한 재확인 후 처리(방식 B).
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { NumericKeypad } from "@/components/numeric-keypad";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useAuthRole } from "@/lib/use-auth-role";
import { getSessionPassword, setSessionPassword } from "@/lib/session-password";
import { verifyPassword } from "@/lib/auth-config";
import { notifyDataChanged } from "@/lib/use-realtime";
import { RefreshButton } from "@/components/refresh-button";
import { num, krw } from "@/lib/format";
import {
  getCheckinByToken,
  saveCheckin,
  CHECKIN_CAT_KEYS,
  CHECKIN_CAT_LABELS,
  type CheckinDetail,
} from "@/lib/qr-checkin.functions";

export const Route = createFileRoute("/qr-checkin")({
  head: () => ({
    meta: [
      { title: "QR 체크인 — 한다련 캠프" },
      { name: "description", content: "교회 QR을 스캔해 현장 체크인과 실접수 인원을 기록합니다." },
      { property: "og:title", content: "QR 체크인 — 한다련 캠프" },
      { property: "og:description", content: "교회 QR을 스캔해 현장 체크인과 실접수 인원을 기록합니다." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QrCheckinPage,
});

function QrCheckinPage() {
  const role = useAuthRole();
  const [pw, setPw] = useState<string | null>(null);
  useEffect(() => setPw(getSessionPassword()), []);

  if (role !== "admin" && role !== "staff") {
    return (
      <AppShell>
        <div className="text-sm text-muted-foreground">접근 권한이 없습니다.</div>
      </AppShell>
    );
  }
  if (!pw) return <AppShell><ReAuth onDone={setPw} /></AppShell>;
  return <AppShell><CheckinContent password={pw} /></AppShell>;
}

function ReAuth({ onDone }: { onDone: (pw: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <Card className="max-w-md p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">비밀번호 확인</h1>
        <p className="mt-1 text-sm text-muted-foreground">체크인은 보호된 기능입니다. 비밀번호를 다시 입력해 주세요.</p>
      </div>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError(null);
          try {
            const r = await verifyPassword(value);
            if (r !== "admin" && r !== "staff") {
              setError("권한이 없거나 비밀번호가 올바르지 않습니다.");
              return;
            }
            setSessionPassword(value);
            onDone(value);
          } catch {
            setError("확인 중 오류가 발생했습니다.");
          } finally {
            setLoading(false);
          }
        }}
      >
        <Label htmlFor="qrpw">비밀번호</Label>
        <Input id="qrpw" type="password" value={value} onChange={(e) => setValue(e.target.value)} />
        {error && <div className="text-sm text-destructive">{error}</div>}
        <Button type="submit" disabled={loading || !value.trim()}>확인</Button>
      </form>
    </Card>
  );
}

function CheckinContent({ password }: { password: string }) {
  const lookup = useServerFn(getCheckinByToken);
  const save = useServerFn(saveCheckin);

  const [detail, setDetail] = useState<CheckinDetail | null>(null);
  const [token, setToken] = useState("");
  const [manual, setManual] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const open = async (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const d = await lookup({ data: { password, token: t } });
      setDetail(d);
      setToken(t);
    } catch (e: any) {
      setError(e?.message ?? "해당 접수를 찾을 수 없습니다.");
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      setDetail(await lookup({ data: { password, token } }));
    } catch {
      /* 조회 실패 시 기존 화면 유지 */
    } finally {
      setRefreshing(false);
    }
  };

  if (detail) {
    return (
      <CheckinDetailView
        key={token}
        detail={detail}
        onRefresh={refresh}
        refreshing={refreshing}
        onSave={async (checkedIn, actualCount) => {
          await save({ data: { password, token, checkedIn, actualCount } });
          notifyDataChanged();
          const fresh = await lookup({ data: { password, token } });
          setDetail(fresh);
          toast.success("체크인이 저장되었습니다.");
        }}
        onRescan={() => {
          setDetail(null);
          setManual("");
          setError(null);
        }}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <header>
        <h1 className="text-2xl font-bold">QR 체크인</h1>
        <p className="text-sm text-muted-foreground">교회 QR을 스캔하면 사전접수 상세가 열립니다.</p>
      </header>

      <QrScanner onResult={open} disabled={loading} />

      <Card className="space-y-2 p-4">
        <Label htmlFor="manual-token">접근 코드 직접 입력</Label>
        <div className="flex gap-2">
          <Input
            id="manual-token"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="QR 대신 코드 입력"
            onKeyDown={(e) => { if (e.key === "Enter") open(manual); }}
          />
          <Button onClick={() => open(manual)} disabled={loading || !manual.trim()}>조회</Button>
        </div>
        <p className="text-xs text-muted-foreground">카메라 사용이 어려운 경우 접근 링크 또는 코드를 붙여넣으세요.</p>
      </Card>

      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
    </div>
  );
}

function QrScanner({ onResult, disabled }: { onResult: (t: string) => void; disabled?: boolean }) {
  // 기기 분기: 카메라가 있는 기기에서만 자동 시작. PC 등 카메라가 없으면 비활성 안내만 표시.
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  const [active, setActive] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const instRef = useRef<any>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
        if (!md || !md.enumerateDevices || !md.getUserMedia) throw new Error("no camera");
        const devices = await md.enumerateDevices();
        const found = devices.some((d) => d.kind === "videoinput");
        if (cancelled) return;
        setHasCamera(found);
        setActive(found);
      } catch {
        if (!cancelled) setHasCamera(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    doneRef.current = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled || !ref.current) return;
        const inst = new Html5Qrcode(ref.current.id);
        instRef.current = inst;
        await inst.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (text: string) => {
            if (doneRef.current) return;
            doneRef.current = true;
            onResult(text);
            setActive(false);
          },
          () => {},
        );
      } catch (e: any) {
        if (!cancelled) {
          setCamError(e?.message ?? "카메라를 사용할 수 없습니다. 아래에서 코드를 직접 입력해 주세요.");
          setActive(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      const inst = instRef.current;
      instRef.current = null;
      if (inst) inst.stop().then(() => inst.clear()).catch(() => {});
    };
  }, [active, onResult]);

  return (
    <Card className="space-y-3 p-4">
      <div id="qr-reader-box" ref={ref} className={active ? "overflow-hidden rounded-lg" : "hidden"} />
      {!active && (
        <Button className="h-14 w-full text-base" onClick={() => { setCamError(null); setActive(true); }} disabled={disabled}>
          카메라 시작
        </Button>
      )}
      {active && (
        <Button variant="outline" className="w-full" onClick={() => setActive(false)}>
          스캔 중지
        </Button>
      )}
      {camError && <div className="text-sm text-destructive">{camError}</div>}
    </Card>
  );
}

function CheckinDetailView({
  detail,
  onSave,
  onRescan,
  onRefresh,
  refreshing,
}: {
  detail: CheckinDetail;
  onSave: (checkedIn: boolean, actualCount: number | null) => Promise<void>;
  onRescan: () => void;
  onRefresh: () => void | Promise<unknown>;
  refreshing?: boolean;
}) {
  const [checked, setChecked] = useState(detail.isCheckedIn);
  const [actual, setActual] = useState<string>(detail.actualCount != null ? String(detail.actualCount) : String(detail.headCount ?? ""));
  const [keypad, setKeypad] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <div className="mx-auto w-full max-w-md space-y-4 pb-6">
      <Card className="space-y-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-bold leading-tight">{detail.churchName}</h1>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{detail.headCount}명</Badge>
            <RefreshButton onRefresh={onRefresh} busy={refreshing} />
          </div>
        </div>
        {detail.denomination && <div className="text-xs text-muted-foreground">{detail.denomination}</div>}
        <div className="pt-1 text-sm">담당자 · {detail.managerName}</div>
        <a className="text-sm text-primary underline" href={`tel:${detail.managerPhone}`}>{detail.managerPhone}</a>
      </Card>

      <Card className="p-3">
        <div className="mb-2 text-sm font-semibold">분류별 인원</div>
        <div className="grid grid-cols-4 gap-2">
          {CHECKIN_CAT_KEYS.map((k) => (
            <div key={k} className="rounded-lg border p-2 text-center">
              <div className="text-[11px] text-muted-foreground">{CHECKIN_CAT_LABELS[k]}</div>
              <div className="text-lg font-bold tabular-nums">{num(detail.counts[k])}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-2 p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">회비 납부</span>
          {detail.paid ? (
            <Badge className="bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200" variant="secondary">납부</Badge>
          ) : (
            <Badge className="bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-200" variant="secondary">미납</Badge>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">예상 회비</span>
          <span className="font-semibold tabular-nums">{krw(detail.expectedFee)}</span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <span className="text-muted-foreground">숙소 배치</span>
          <span className="text-right font-medium">
            {detail.lodgings.length ? detail.lodgings.join(", ") : "미배치"}
          </span>
        </div>
      </Card>

      <Card className="space-y-4 p-4">
        <label className="flex h-16 cursor-pointer items-center justify-between gap-3 rounded-lg border-2 px-4 transition hover:border-emerald-400">
          <span className="text-base font-semibold">총인원 확인 완료</span>
          <Checkbox
            checked={checked}
            onCheckedChange={(v) => setChecked(!!v)}
            className="h-8 w-8 border-2 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-600"
          />
        </label>

        <div>
          <Label className="text-base font-semibold">실접수 인원</Label>
          <Input
            type="text"
            inputMode="none"
            readOnly
            value={actual}
            onFocus={(e) => e.currentTarget.blur()}
            onClick={() => setKeypad(true)}
            className="mt-2 h-16 w-full cursor-pointer text-right text-2xl font-bold tabular-nums"
          />
        </div>

        <Button
          className="h-14 w-full text-base"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(checked, actual === "" ? null : parseInt(actual, 10));
            } catch (e: any) {
              toast.error(e?.message ?? "저장에 실패했습니다.");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "저장 중…" : "체크인 저장"}
        </Button>
      </Card>

      <Button variant="outline" className="h-14 w-full text-base" onClick={onRescan}>
        다시 스캔하기
      </Button>

      {keypad && (
        <NumericKeypad
          label={`${detail.churchName} · 실접수인원`}
          value={actual}
          onChange={setActual}
          onClose={() => setKeypad(false)}
          onSubmit={() => setKeypad(false)}
        />
      )}
    </div>
  );
}
