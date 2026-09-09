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
import {
  findChurchCandidates,
  confirmPreRegistration,
  setPreRegistrationPaid,
  type ChurchCandidate,
} from "@/lib/pre-registration-confirm.functions";

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
  male_child: "남자 유아~초등",
  female_child: "여자 유아~초등",
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
  const setPaid = useServerFn(setPreRegistrationPaid);
  const delReg = useServerFn(deletePreRegistration);
  const [paying, setPaying] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  const togglePaid = async (id: string, paid: boolean) => {
    setPaying(true);
    try {
      await setPaid({ data: { password, id, paid } });
      await refetch();
      toast.success(paid ? "납부 완료로 표시했습니다" : "미납으로 되돌렸습니다");
    } catch (e: any) {
      toast.error(e?.message ?? "저장 실패");
    } finally {
      setPaying(false);
    }
  };

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
    const group = {
      all: { count: 0, people: 0, fee: 0 },
      confirmed: { count: 0, people: 0, fee: 0 },
      pending: { count: 0, people: 0, fee: 0 },
    };
    for (const r of rows) {
      const people = r.members.length;
      const fee = r.expected_fee ?? 0;
      const bucket = r.status === "applied" ? group.confirmed : group.pending;
      group.all.count++; group.all.people += people; group.all.fee += fee;
      bucket.count++; bucket.people += people; bucket.fee += fee;
      for (const m of r.members) {
        cat[m.category] = (cat[m.category] ?? 0) + 1;
        if (m.lodging_type === "church") lodging.church++;
        else if (m.lodging_type === "external") lodging.external++;
        else lodging.none++;
      }
    }
    return { cat, lodging, ...group };
  }, [rows]);

  const selected = rows.find((r) => r.id === openId) ?? null;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">사전접수 관리</h1>
          <p className="text-sm text-muted-foreground">
            교회가 직접 제출한 활성 시즌 사전접수 건
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
        <div className="grid gap-3 sm:grid-cols-3">
          <GroupStat title="전체" g={summary.all} feeLabel="회비 합계" />
          <GroupStat title="확정" g={summary.confirmed} feeLabel="확정 회비 합계" />
          <GroupStat title="미확정 (검토대기+재검토)" g={summary.pending} feeLabel="미확정 회비 합계" />
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          숙박 유형(전체): 교회 {summary.lodging.church} · 외부 {summary.lodging.external} · 비숙박 {summary.lodging.none}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
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
              {["교회명", "교단명", "담당자", "연락처", "인원", "확정 회비", "숙박(교회/외부/비숙박)", "상태", "납부", "제출", "수정", "삭제"].map(
                (h) => (
                  <th key={h} className="px-3 py-2 whitespace-nowrap font-medium">{h}</th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={12} className="px-3 py-6 text-muted-foreground">불러오는 중…</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={12} className="px-3 py-6 text-muted-foreground">사전접수 건이 없습니다.</td></tr>
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
                  <td className="px-3 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={deleting}
                      onClick={() => removeReg(r)}
                      aria-label={`${r.church_name} 사전접수 삭제`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
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
        onRefresh={() => refetch()}
        onTogglePaid={togglePaid}
        paying={paying}
        onDelete={removeReg}
        deleting={deleting}
      />

    </div>
  );
}

function GroupStat({
  title,
  g,
  feeLabel,
}: {
  title: string;
  g: { count: number; people: number; fee: number };
  feeLabel: string;
}) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="text-lg font-semibold mt-0.5">{g.count}건 · {g.people}명</div>
      <div className="text-sm text-muted-foreground mt-0.5">{feeLabel} {krw(g.fee)}</div>
    </div>
  );
}


function DetailDialog({
  password,
  reg,
  preRegFee,
  onClose,
  onRefresh,
  onTogglePaid,
  paying,
}: {
  password: string;
  reg: AdminPreRegistration | null;
  preRegFee: number;
  onClose: () => void;
  onRefresh: () => void;
  onTogglePaid: (id: string, paid: boolean) => void;
  paying: boolean;
}) {
  const changesFn = useServerFn(getPreRegistrationChanges);
  const candidatesFn = useServerFn(findChurchCandidates);
  const confirmFn = useServerFn(confirmPreRegistration);
  const [candidates, setCandidates] = useState<ChurchCandidate[] | null>(null);
  const [mode, setMode] = useState<"link" | "new">("new");
  const [pickedChurch, setPickedChurch] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
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

  const regId = reg?.id ?? null;
  const alreadyLinked = !!reg?.church_id;
  useEffect(() => {
    setCandidates(null);
    setPickedChurch(null);
    setMode("new");
    if (!regId) return;
    let alive = true;
    candidatesFn({ data: { password, id: regId } })
      .then((c) => {
        if (!alive) return;
        setCandidates(c);
        if (c.length) {
          setMode("link");
          setPickedChurch(c[0]!.id);
        }
      })
      .catch(() => alive && setCandidates([]));
    return () => {
      alive = false;
    };
  }, [regId, password, candidatesFn]);

  const runConfirm = async () => {
    if (!reg) return;
    setConfirming(true);
    try {
      const res = await confirmFn({
        data: {
          password,
          id: reg.id,
          mode: alreadyLinked ? "new" : mode,
          ...(!alreadyLinked && mode === "link" && pickedChurch ? { churchId: pickedChurch } : {}),
        },
      });
      toast.success(`확정 완료 — ${res.peopleCount}명 등록 · 회비 ${krw(res.amount)}`);
      onRefresh();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "확정 처리에 실패했습니다.");
    } finally {
      setConfirming(false);
    }
  };

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
                운영 등록 시에는 세계로 성도 1만원 규칙이 적용되어 금액이 달라질 수 있습니다.
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-muted-foreground text-xs">납부</span>
                <Button
                  size="sm"
                  variant={reg.paid ? "default" : "outline"}
                  disabled={paying}
                  onClick={() => onTogglePaid(reg.id, !reg.paid)}
                >
                  {reg.paid ? "납부 완료" : "미납"}
                </Button>
                {reg.paid && reg.paid_at && (
                  <span className="text-xs text-muted-foreground">{formatKst(reg.paid_at)}</span>
                )}
              </div>
            </Card>

            <Card className="p-3 space-y-3 text-sm">
              <div className="font-medium">
                {reg.status === "applied" ? "확정 완료" : reg.status === "needs_review" ? "재확정" : "확정"}
              </div>
              {alreadyLinked ? (
                <div className="text-muted-foreground">
                  이미 운영 명단에 연결된 건입니다. 재확정하면 이 건에서 등록된 인원만 최신 명단으로 갱신됩니다.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-1">
                    <Button size="sm" variant={mode === "new" ? "default" : "outline"} onClick={() => setMode("new")}>
                      신규 교회 생성
                    </Button>
                    <Button
                      size="sm"
                      variant={mode === "link" ? "default" : "outline"}
                      disabled={!candidates?.length}
                      onClick={() => setMode("link")}
                    >
                      기존 교회 연결
                    </Button>
                  </div>
                  {mode === "link" && (
                    <div className="space-y-1">
                      {!candidates?.length && <div className="text-muted-foreground">유사한 교회가 없습니다.</div>}
                      {(candidates ?? []).map((c) => (
                        <label key={c.id} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="church-candidate"
                            checked={pickedChurch === c.id}
                            onChange={() => setPickedChurch(c.id)}
                          />
                          <span>
                            {c.name} {c.denomination ? `(${c.denomination})` : ""} · {c.peopleCount}명
                            {c.exact ? " · 이름 일치" : ""}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <Button
                onClick={runConfirm}
                disabled={confirming || (!alreadyLinked && mode === "link" && !pickedChurch)}
              >
                {confirming ? "처리 중…" : reg.status === "submitted" ? "확정" : "재확정"}
              </Button>
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
