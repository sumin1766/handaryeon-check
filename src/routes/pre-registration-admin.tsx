// 사전접수 관리 — 조회 전용 (3단계).
// 교회가 /apply 로 직접 제출한 활성 시즌 사전접수 건을 목록/상세로 확인한다.
// 상태 변경·확정·이관·삭제 기능은 이 화면에 없다(4단계).
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { krw, formatKst } from "@/lib/format";
import { useAuthRole } from "@/lib/use-auth-role";
import { getSessionPassword, setSessionPassword } from "@/lib/session-password";
import { verifyPassword } from "@/lib/auth-config";
import {
  listPreRegistrations,
  getPreRegistrationChanges,
  type AdminPreRegistration,
} from "@/lib/pre-registration-admin.functions";

export const Route = createFileRoute("/pre-registration-admin")({
  head: () => ({
    meta: [
      { title: "사전접수 관리 — 한다련 캠프" },
      { name: "description", content: "교회가 직접 제출한 사전접수 건을 목록과 상세로 검토합니다." },
      { property: "og:title", content: "사전접수 관리 — 한다련 캠프" },
      { property: "og:description", content: "활성 시즌 사전접수 목록·명단·회비·변경 이력 조회." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PreRegAdminPage,
});

const CATEGORY_LABEL: Record<string, string> = {
  male_student: "남학생",
  male_adult: "남자어른",
  female_student: "여학생",
  female_adult: "여자어른",
  male_child: "남자유아초등",
  female_child: "여자유아초등",
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABEL);

const LODGING_LABEL: Record<string, string> = {
  church: "교회 숙박",
  external: "외부 숙박",
  none: "비숙박",
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  submitted: { label: "검토대기", className: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200" },
  applied: { label: "확정완료", className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200" },
  needs_review: { label: "수정됨·재검토필요", className: "bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-200" },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, className: "" };
  return <Badge variant="secondary" className={meta.className}>{meta.label}</Badge>;
}

function lodgingCounts(r: AdminPreRegistration) {
  let church = 0, external = 0, none = 0;
  for (const m of r.members) {
    if (m.lodging_type === "church") church++;
    else if (m.lodging_type === "external") external++;
    else none++;
  }
  return { church, external, none };
}

function PreRegAdminPage() {
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
  return <AppShell><PreRegAdminContent password={pw} onAuthLost={() => setPw(null)} /></AppShell>;
}

function ReAuth({ onDone }: { onDone: (pw: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <Card className="max-w-md p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">비밀번호 확인</h1>
        <p className="text-sm text-muted-foreground mt-1">
          사전접수 데이터는 보호되어 있습니다. 비밀번호를 한 번만 다시 입력해 주세요.
        </p>
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
        <Label htmlFor="pw2">비밀번호</Label>
        <Input id="pw2" type="password" value={value} onChange={(e) => setValue(e.target.value)} />
        {error && <div className="text-sm text-destructive">{error}</div>}
        <Button type="submit" disabled={loading || !value.trim()}>확인</Button>
      </form>
    </Card>
  );
}

function PreRegAdminContent({ password, onAuthLost }: { password: string; onAuthLost: () => void }) {
  const list = useServerFn(listPreRegistrations);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"recent" | "status" | "name">("recent");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["pre-reg-admin"],
    queryFn: () => list({ data: { password } }),
    refetchInterval: 15_000,
    retry: false,
  });

  useEffect(() => {
    if (isError && String((error as any)?.message ?? "").includes("권한")) onAuthLost();
  }, [isError, error, onAuthLost]);

  const rows = data?.rows ?? [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter(
      (r) =>
        !needle ||
        r.church_name.toLowerCase().includes(needle) ||
        r.manager_name.toLowerCase().includes(needle),
    );
    out = [...out].sort((a, b) => {
      if (sort === "name") return a.church_name.localeCompare(b.church_name, "ko");
      if (sort === "status") return a.status.localeCompare(b.status);
      return b.created_at.localeCompare(a.created_at);
    });
    return out;
  }, [rows, q, sort]);

  const summary = useMemo(() => {
    const cat: Record<string, number> = {};
    const lodging = { church: 0, external: 0, none: 0 };
    let people = 0;
    let fee = 0;
    for (const r of rows) {
      fee += r.expected_fee ?? 0;
      for (const m of r.members) {
        people++;
        cat[m.category] = (cat[m.category] ?? 0) + 1;
        if (m.lodging_type === "church") lodging.church++;
        else if (m.lodging_type === "external") lodging.external++;
        else lodging.none++;
      }
    }
    return { cat, lodging, people, fee, count: rows.length };
  }, [rows]);

  const selected = rows.find((r) => r.id === openId) ?? null;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">사전접수 관리</h1>
          <p className="text-sm text-muted-foreground">
            교회가 직접 제출한 활성 시즌 사전접수 건 · 조회 전용
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
          새로고침
        </Button>
      </header>

      {isError && (
        <Card className="p-4 text-sm text-destructive">
          {(error as any)?.message ?? "불러오지 못했습니다."}
        </Card>
      )}

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="전체 건수" value={`${summary.count}건`} />
          <Stat label="총 인원" value={`${summary.people}명`} />
          <Stat label="확정 회비 합계" value={krw(summary.fee)} />
          <Stat
            label="숙박 유형"
            value={`교회 ${summary.lodging.church} · 외부 ${summary.lodging.external} · 비숙박 ${summary.lodging.none}`}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {CATEGORY_ORDER.map((c) => (
            <span key={c} className="rounded-full bg-muted px-3 py-1">
              {CATEGORY_LABEL[c]} {summary.cat[c] ?? 0}
            </span>
          ))}
        </div>
      </Card>

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="교회명 · 담당자 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {([["recent", "제출 최신순"], ["status", "상태순"], ["name", "교회명순"]] as const).map(
            ([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={sort === key ? "default" : "outline"}
                onClick={() => setSort(key)}
              >
                {label}
              </Button>
            ),
          )}
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              {["교회명", "교단명", "담당자", "연락처", "인원", "확정 회비", "숙박(교회/외부/비숙박)", "상태", "납부", "제출", "수정"].map(
                (h) => (
                  <th key={h} className="px-3 py-2 whitespace-nowrap font-medium">{h}</th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={11} className="px-3 py-6 text-muted-foreground">불러오는 중…</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-6 text-muted-foreground">사전접수 건이 없습니다.</td></tr>
            )}
            {filtered.map((r) => {
              const l = lodgingCounts(r);
              return (
                <tr
                  key={r.id}
                  className="border-t cursor-pointer hover:bg-muted/40"
                  onClick={() => setOpenId(r.id)}
                >
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{r.church_name}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.denomination ?? "-"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.manager_name}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.manager_phone}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.head_count}명</td>
                  <td className="px-3 py-2 whitespace-nowrap">{krw(r.expected_fee)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{l.church} / {l.external} / {l.none}</td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant={r.paid ? "default" : "outline"}
                      disabled={paying}
                      onClick={() => togglePaid(r.id, !r.paid)}
                    >
                      {r.paid ? "납부 완료" : "미납"}
                    </Button>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatKst(r.created_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatKst(r.updated_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <DetailDialog
        password={password}
        reg={selected}
        preRegFee={data?.preRegFee ?? 0}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function DetailDialog({
  password,
  reg,
  preRegFee,
  onClose,
}: {
  password: string;
  reg: AdminPreRegistration | null;
  preRegFee: number;
  onClose: () => void;
}) {
  const changesFn = useServerFn(getPreRegistrationChanges);
  const [qr, setQr] = useState("");
  const accessUrl =
    reg && typeof window !== "undefined" ? `${window.location.origin}/apply/${reg.access_token}` : "";

  useEffect(() => {
    if (!accessUrl) return setQr("");
    QRCode.toDataURL(accessUrl, { width: 240, margin: 1 }).then(setQr).catch(() => setQr(""));
  }, [accessUrl]);

  const { data: changes } = useQuery({
    queryKey: ["pre-reg-admin-changes", reg?.id],
    enabled: !!reg?.id,
    retry: false,
    queryFn: () => changesFn({ data: { password, id: reg!.id } }),
  });

  const unitFee = reg && reg.head_count > 0 ? Math.round(reg.expected_fee / reg.head_count) : preRegFee;

  return (
    <Dialog open={!!reg} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        {reg && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {reg.church_name}
                <StatusBadge status={reg.status} />
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div>교단명: {reg.denomination ?? "-"}</div>
              <div>담당자: {reg.manager_name} ({reg.manager_phone})</div>
              <div>제출: {formatKst(reg.created_at)}</div>
              <div>수정: {formatKst(reg.updated_at)}</div>
            </div>

            <Card className="p-3 text-sm">
              <div className="font-medium mb-1">회비 내역</div>
              <div>
                {reg.head_count}명 × {krw(unitFee)} = <strong>{krw(reg.expected_fee)}</strong>
              </div>
              <div className="text-muted-foreground text-xs mt-1">
                예상 회비와 확정 회비는 현재 동일하게 표시됩니다(확정 처리는 다음 단계).
              </div>
            </Card>

            <Card className="p-3">
              <div className="font-medium text-sm mb-2">참석자 명단 ({reg.members.length}명)</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      {["이름", "전화번호", "분류", "숙박 유형"].map((h) => (
                        <th key={h} className="px-2 py-1.5 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reg.members.map((m) => (
                      <tr key={m.id} className="border-t">
                        <td className="px-2 py-1.5 whitespace-nowrap">{m.name}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{m.phone ?? "-"}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{CATEGORY_LABEL[m.category] ?? m.category}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{LODGING_LABEL[m.lodging_type] ?? m.lodging_type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="p-3 flex flex-wrap items-center gap-4">
              {qr && <img src={qr} alt={`${reg.church_name} 사전접수 QR`} className="h-40 w-40" />}
              <div className="space-y-2 text-sm min-w-[220px] flex-1">
                <div className="font-medium">접근 링크(재공유용)</div>
                <div className="break-all text-xs text-muted-foreground">{accessUrl}</div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(accessUrl);
                      toast.success("링크가 복사되었습니다");
                    } catch {
                      toast.error("복사 실패");
                    }
                  }}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  링크 복사
                </Button>
              </div>
            </Card>

            <Card className="p-3 text-sm">
              <div className="font-medium mb-2">변경 이력</div>
              {!changes?.length && <div className="text-muted-foreground">변경 이력이 없습니다.</div>}
              <ul className="space-y-2">
                {(changes ?? []).map((c) => (
                  <li key={c.id} className="border-t pt-2 first:border-t-0 first:pt-0">
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="font-medium">{c.change_type}</span>
                      <span className="text-muted-foreground text-xs">{formatKst(c.created_at)}</span>
                    </div>
                    <div className="text-muted-foreground">
                      인원 {c.before_count} → {c.after_count} · 회비 증감 {krw(c.fee_delta)}
                      {c.note ? ` · ${c.note}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
