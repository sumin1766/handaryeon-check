// 공개 사전접수 폼 본체. /apply(공개)와 앱 내 "사전접수 폼" 탭에서 같은 컴포넌트를 쓴다.
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Plus, Trash2, Search, ChevronDown, Save } from "lucide-react";
import {
  loadDraft,
  saveDraft,
  clearDraft,
  purgeOtherSeasonDrafts,
  hasDraftContent,
  type ApplyDraft,
  type ApplyDraftData,
} from "@/lib/apply-draft";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatPhone, phoneDigits, isPhoneComplete } from "@/lib/phone-format";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_PRE_REG_FEE,
  DEFAULT_APPLY_NOTICES,
} from "@/lib/pre-registration-config";
import {
  MEMBER_CATEGORIES,
  CATEGORY_LABELS,
  isPhoneOptional,
  sumCategoryFees,
  type MemberCategory,
  type CategoryFeeMap,
} from "@/lib/member-categories";
import {
  submitPreRegistration,
  getPublicFeeConfig,
  type SubmitPreRegistrationResult,
  type SubmitPreRegistrationInput,
} from "@/lib/pre-registration-public.functions";

import { krw } from "@/lib/format";
import { TEST_SEASON_MAINTENANCE_MESSAGE } from "@/lib/test-season";
import { AttendeeExcelBar } from "@/components/attendee-excel-bar";
import { ChurchRegionFields, type ChurchRegion } from "@/components/church-region-fields";


type LodgingType = "church" | "external" | "none";
type Row = {
  name: string;
  phone: string;
  lodging_type: LodgingType;
  category: MemberCategory;
};
const emptyRow = (): Row => ({ name: "", phone: "", lodging_type: "church", category: "male_student" });

const phoneOptional = (c: MemberCategory) => isPhoneOptional(c);

const LODGING_OPTIONS: { value: LodgingType; label: string }[] = [
  { value: "church", label: "교회 숙박" },
  { value: "external", label: "외부 숙박" },
  { value: "none", label: "비숙박" },
];

export function ApplyForm({ showLookupLink = true }: { showLookupLink?: boolean }) {
  // 인트로(안내 + 개인정보 동의) 통과 여부. 동의 시각만 화면에서 기록(선택 사항)하고 저장은 하지 않는다.
  const [consentedAt, setConsentedAt] = useState<string | null>(null);
  const [churchName, setChurchName] = useState("");
  const [denomination, setDenomination] = useState("");
  const [managerName, setManagerName] = useState("");
  const [managerPhone, setManagerPhone] = useState("");
  const [region, setRegion] = useState<ChurchRegion>({ sido: "", sigungu: "", road: "" });
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [result, setResult] = useState<SubmitPreRegistrationResult | null>(null);

  const { data: feeCfg } = useQuery({
    queryKey: ["public-pre-reg-fee"],
    // 설정에서 안내 문구를 바꾸면 공개 폼에도 곧바로 반영되도록 짧게 갱신한다.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<{
      preRegFee: number;
      categoryFees: CategoryFeeMap;
      notices: string[];
      maintenance: boolean;
      blockMessage: string;
      seasonId: string;
    }> => {
      const cfg = await getPublicFeeConfig();
      return {
        preRegFee: cfg.preRegFee,
        categoryFees: cfg.categoryFees as CategoryFeeMap,
        notices: cfg.notices ?? [],
        maintenance: !!cfg.maintenance,
        blockMessage: cfg.blockMessage ?? "",
        seasonId: cfg.seasonId ?? "",
      };
    },
  });
  const preRegFee = feeCfg?.preRegFee ?? DEFAULT_PRE_REG_FEE;
  const categoryFees = feeCfg?.categoryFees ?? {};
  const extraNotices = feeCfg?.notices ?? [];
  const maintenance = !!feeCfg?.maintenance;
  // 운영 시즌 수동 차단 (테스트 시즌 점검이 우선)
  const blockMessage = maintenance ? "" : (feeCfg?.blockMessage ?? "");
  const blocked = maintenance || !!blockMessage;
  const expectedFee = sumCategoryFees(rows.map((r) => r.category), categoryFees, preRegFee);

  // ── 임시저장 (브라우저 localStorage 전용, 활성 시즌별 키) ──
  const seasonId = feeCfg?.seasonId ?? "";
  const [draftOffer, setDraftOffer] = useState<ApplyDraft | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  useEffect(() => {
    if (!seasonId) return;
    purgeOtherSeasonDrafts(seasonId);
    const d = loadDraft(seasonId);
    if (d && hasDraftContent(d.data)) setDraftOffer(d);
    else setDraftReady(true);
  }, [seasonId]);
  const snapshot = (): ApplyDraftData => ({
    consented: !!consentedAt,
    churchName,
    denomination,
    managerName,
    managerPhone,
    region,
    rows,
  });
  useEffect(() => {
    if (!seasonId || !draftReady || result) return;
    const data = snapshot();
    if (!hasDraftContent(data)) return;
    const t = setTimeout(() => saveDraft(seasonId, data), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId, draftReady, result, consentedAt, churchName, denomination, managerName, managerPhone, region, rows]);
  const restoreDraft = () => {
    if (!draftOffer) return;
    const d = draftOffer.data;
    setChurchName(d.churchName ?? "");
    setDenomination(d.denomination ?? "");
    setManagerName(d.managerName ?? "");
    setManagerPhone(d.managerPhone ?? "");
    setRegion({ sido: d.region?.sido ?? "", sigungu: d.region?.sigungu ?? "", road: d.region?.road ?? "" });
    setRows(
      d.rows?.length
        ? d.rows.map((r) => ({
            name: r.name ?? "",
            phone: r.phone ?? "",
            lodging_type: (["church", "external", "none"].includes(r.lodging_type) ? r.lodging_type : "church") as LodgingType,
            category: ((MEMBER_CATEGORIES as readonly string[]).includes(r.category) ? r.category : "male_student") as MemberCategory,
          }))
        : [emptyRow()],
    );
    if (d.consented) setConsentedAt(new Date().toISOString());
    setDraftOffer(null);
    setDraftReady(true);
    toast.success("이전에 작성하던 내용을 불러왔습니다.");
  };
  const discardDraft = () => {
    clearDraft(seasonId);
    setChurchName("");
    setDenomination("");
    setManagerName("");
    setManagerPhone("");
    setRegion({ sido: "", sigungu: "", road: "" });
    setRows([emptyRow()]);
    setConsentedAt(null);
    setDraftOffer(null);
    setDraftReady(true);
    toast.success("임시저장 내용을 삭제했습니다.");
  };
  const manualSave = () => {
    if (!seasonId) {
      toast.error("잠시 후 다시 시도해 주세요.");
      return;
    }
    saveDraft(seasonId, snapshot());
    setDraftOffer(null);
    setDraftReady(true);
    toast.success("임시저장되었습니다. 이 기기·브라우저에만 3일간 보관됩니다.");
  };
  const draftBanner = draftOffer ? (
    <div role="status" className="mt-5 rounded-md border border-primary/40 bg-primary/5 p-4">
      <p className="text-base font-semibold">이전에 작성하던 내용이 있습니다. 불러올까요?</p>
      <p className="mt-1 text-xs text-muted-foreground">
        임시저장은 이 기기·브라우저에만 3일간 보관됩니다. 본인 기기에서만 사용하세요.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={restoreDraft}>불러오기</Button>
        <Button type="button" size="sm" variant="outline" onClick={discardDraft}>새로 작성</Button>
      </div>
    </div>
  ) : null;

  const submitFn = useServerFn(submitPreRegistration);
  const submit = useMutation({
    mutationFn: (input: SubmitPreRegistrationInput) => submitFn({ data: input }),
    onSuccess: (res) => {
      setResult(res);
      if (seasonId) clearDraft(seasonId);
      if (res.duplicateNotice) {
        toast.warning("이미 접수된 건이 있습니다. 중복 접수인지 담당자에게 확인해 주세요.");
      }
    },
    onError: (e: Error) => toast.error(e.message || "제출에 실패했습니다."),
  });

  const isMobile = useIsMobile();
  const churchInfoComplete =
    !!churchName.trim() && !!managerName.trim() && !!managerPhone.trim() &&
    !!region.sido && !!region.sigungu && !!region.road.trim();
  const [churchOpen, setChurchOpen] = useState(true);
  const churchCardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!churchInfoComplete) setChurchOpen(true);
  }, [churchInfoComplete]);
  const churchCollapsed = isMobile && !churchOpen && churchInfoComplete;
  const focusNext = (selector: string) =>
    setTimeout(() => (document.querySelector(selector) as HTMLElement | null)?.focus(), 0);

  const noneCount = rows.filter((r) => r.lodging_type === "none").length;
  const lodgingCount = rows.length - noneCount;

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const onSubmit = () => {
    if (maintenance) {
      toast.error(TEST_SEASON_MAINTENANCE_MESSAGE);
      return;
    }
    if (blockMessage) {
      toast.error(blockMessage);
      return;
    }
    if (!churchName.trim() || !managerName.trim() || !managerPhone.trim()) {
      toast.error("교회명·담당자명·담당자 전화번호를 모두 입력해 주세요.");
      return;
    }
    if (!region.sido || !region.sigungu || !region.road.trim()) {
      toast.error("교회 주소(시/도·시군구·도로명 주소)를 모두 입력해 주세요.");
      return;
    }
    const cleaned = rows.map((r) => ({ ...r, name: r.name.trim(), phone: r.phone.trim() }));
    if (cleaned.length === 0) {
      toast.error("참석자를 1명 이상 입력해 주세요.");
      return;
    }
    if (cleaned.some((r) => !r.name)) {
      toast.error("모든 참석자의 이름을 입력해 주세요.");
      return;
    }
    if (cleaned.some((r) => !r.phone && !phoneOptional(r.category))) {
      toast.error("유아유치를 제외한 모든 참석자는 전화번호가 필수입니다.");
      return;
    }

    submit.mutate({
      churchName: churchName.trim(),
      denomination: denomination.trim(),
      managerName: managerName.trim(),
      managerPhone: managerPhone.trim(),
      regionSido: region.sido,
      regionSigungu: region.sigungu,
      roadAddress: region.road.trim(),
      members: cleaned,
    });
  };

  if (result) return <DoneScreen result={result} />;

  // 동의 전에는 인트로 화면만 보여준다 (기존 폼 로직은 그대로 유지).
  if (!consentedAt) {
    return (
      <IntroScreen
        notices={extraNotices.length ? extraNotices : DEFAULT_APPLY_NOTICES}
        showLookupLink={showLookupLink}
        maintenance={maintenance}
        blockMessage={blockMessage}
        banner={draftBanner}
        onAgree={() => setConsentedAt(new Date().toISOString())}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">참석자 사전접수</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            결제 완료 후 아래 명단을 작성해 주세요. 제출하면 QR이 발급됩니다.
          </p>
        </div>
        {showLookupLink && (
          <Button asChild variant="outline">
            <Link to="/apply/lookup">
              <Search className="mr-1 h-4 w-4" />
              내 등록 조회
            </Link>
          </Button>
        )}
      </div>

      {draftBanner}

      {maintenance && (
        <div
          role="alert"
          className="mt-5 rounded-md border border-destructive bg-destructive/10 p-4 text-sm font-semibold text-destructive"
        >
          {TEST_SEASON_MAINTENANCE_MESSAGE}. 잠시 후 다시 이용해 주세요.
        </div>
      )}

      {blockMessage && (
        <div
          role="alert"
          className="mt-5 rounded-md border border-destructive bg-destructive/10 p-4 text-sm font-semibold text-destructive"
        >
          {blockMessage}
        </div>
      )}

      <Card
        ref={churchCardRef}
        className="mt-5 space-y-3 p-4"
        onBlur={(e) => {
          // 모바일: 필수 칸이 모두 채워진 뒤 섹션 밖으로 포커스가 나가면 자동으로 접는다.
          if (!isMobile || !churchInfoComplete) return;
          const next = e.relatedTarget as Node | null;
          if (next && churchCardRef.current?.contains(next)) return;
          setChurchOpen(false);
        }}
      >
        {isMobile && (
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 text-left"
            aria-expanded={!churchCollapsed}
            onClick={() => setChurchOpen((o) => (churchCollapsed ? true : !o))}
          >
            <span className="min-w-0">
              <span className="block text-base font-semibold">교회 정보</span>
              {churchCollapsed && (
                <span className="block truncate text-sm text-muted-foreground">
                  {churchName.trim()} · {managerName.trim()}
                </span>
              )}
            </span>
            <ChevronDown
              className={`h-5 w-5 shrink-0 transition-transform ${churchCollapsed ? "" : "rotate-180"}`}
            />
          </button>
        )}
        <div className={`grid gap-3 sm:grid-cols-2 ${churchCollapsed ? "hidden" : ""}`}>
          <label className="space-y-1">
            <span className="text-sm font-medium">교회명</span>
            <Input value={churchName} onChange={(e) => setChurchName(e.target.value)} maxLength={100} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">교단명 (선택)</span>
            <Input
              value={denomination}
              onChange={(e) => setDenomination(e.target.value)}
              maxLength={100}
              placeholder="예: 예장합동 (선택 입력)"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">담당자명</span>
            <Input value={managerName} onChange={(e) => setManagerName(e.target.value)} maxLength={50} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">담당자 전화번호</span>
            <Input
              value={formatPhone(managerPhone)}
              onChange={(e) => {
                const d = phoneDigits(e.target.value);
                const wasComplete = isPhoneComplete(managerPhone);
                setManagerPhone(d);
                if (!wasComplete && isPhoneComplete(d)) focusNext('[data-autofocus-target="sido"]');
              }}
              inputMode="tel"
              maxLength={13}
              placeholder="010-0000-0000"
            />
          </label>
          <ChurchRegionFields value={region} onChange={setRegion} />
        </div>
      </Card>

      <Card className="mt-5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">참석자 명단 ({rows.length}명)</h2>
            <p className="text-sm text-muted-foreground">
              숙박 {lodgingCount}명 · 비숙박 {noneCount}명 · 합계 {rows.length}명
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {LODGING_OPTIONS.map((o) => (
              <Button
                key={o.value}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRows((p) => p.map((r) => ({ ...r, lodging_type: o.value })))}
              >
                전체 {o.label}
              </Button>
            ))}
          </div>
        </div>

        <AttendeeExcelBar
          onAdd={(list) =>
            setRows((p) => [
              ...p.filter((r) => r.name.trim()),
              ...list.map((m) => ({ ...m, category: m.category as MemberCategory })),
            ])
          }
          onClear={() => setRows([])}
          hasInput={rows.some((r) => r.name.trim() !== "" || r.phone.trim() !== "")}
        />

        <div className="mt-3 space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr_auto_auto]">
              <Input
                placeholder="이름"
                data-row-name={i}
                value={r.name}
                onChange={(e) => setRow(i, { name: e.target.value })}
              />
              <select
                aria-label="분류"
                className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                value={r.category}
                onChange={(e) => {
                  setRow(i, { category: e.target.value as MemberCategory });
                  focusNext(`[data-row-phone="${i}"]`);
                }}
              >
                {MEMBER_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
              <Input
                placeholder={phoneOptional(r.category) ? "전화번호 (선택)" : "전화번호"}
                inputMode="tel"
                data-row-phone={i}
                value={formatPhone(r.phone)}
                maxLength={13}
                onChange={(e) => {
                  const d = phoneDigits(e.target.value);
                  const wasComplete = isPhoneComplete(r.phone);
                  setRow(i, { phone: d });
                  if (!wasComplete && isPhoneComplete(d)) focusNext(`[data-row-lodging="${i}"]`);
                }}
              />
              <div className="flex flex-wrap gap-1">
                {LODGING_OPTIONS.map((o) => (
                  <Button
                    key={o.value}
                    type="button"
                    size="sm"
                    variant={r.lodging_type === o.value ? "default" : "outline"}
                    data-row-lodging={r.lodging_type === o.value ? i : undefined}
                    onClick={() => {
                      setRow(i, { lodging_type: o.value });
                      if (i + 1 < rows.length) focusNext(`[data-row-name="${i + 1}"]`);
                    }}
                  >
                    {o.label}
                  </Button>
                ))}
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="행 삭제"
                onClick={() => setRows((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          className="mt-3"
          onClick={() => {
            setRows((p) => [...p, emptyRow()]);
            focusNext(`[data-row-name="${rows.length}"]`);
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> 참석자 추가
        </Button>
      </Card>

      <Card className="mt-5 flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="text-sm text-muted-foreground">
            예상 회비 (분류별 설정 합계 · {rows.length}명)
          </div>
          <div className="text-2xl font-bold">{krw(expectedFee)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="lg" variant="outline" onClick={manualSave}>
            <Save className="mr-1 h-4 w-4" /> 임시저장
          </Button>
          <Button size="lg" onClick={onSubmit} disabled={submit.isPending || blocked}>
            {blocked ? "접수 일시 중단" : submit.isPending ? "제출 중..." : "사전접수 제출"}
          </Button>
        </div>
        <p className="w-full text-xs text-muted-foreground">
          작성 내용은 이 기기·브라우저에 자동 임시저장되며 3일 뒤 삭제됩니다. 본인 기기에서만 사용하세요.
        </p>
      </Card>
    </div>
  );
}

// 인트로 화면: 안내 문구 + 개인정보 수집·이용 동의. 동의해야 기존 입력 폼으로 넘어간다.
function IntroScreen({
  notices,
  showLookupLink,
  maintenance,
  blockMessage,
  banner,
  onAgree,
}: {
  notices: string[];
  showLookupLink: boolean;
  maintenance: boolean;
  blockMessage: string;
  banner?: ReactNode;
  onAgree: () => void;
}) {
  const [agreed, setAgreed] = useState(false);

  const toggle = () => setAgreed((prev) => !prev);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">참석자 사전접수</h1>
        {showLookupLink && (
          <Button asChild variant="outline">
            <Link to="/apply/lookup">
              <Search className="mr-1 h-4 w-4" />
              내 등록 조회
            </Link>
          </Button>
        )}
      </div>

      {banner}

      {maintenance && (
        <div
          role="alert"
          className="mt-5 rounded-md border border-destructive bg-destructive/10 p-4 text-sm font-semibold text-destructive"
        >
          {TEST_SEASON_MAINTENANCE_MESSAGE}. 잠시 후 다시 이용해 주세요.
        </div>
      )}

      {blockMessage && (
        <div
          role="alert"
          className="mt-5 rounded-md border border-destructive bg-destructive/10 p-4 text-sm font-semibold text-destructive"
        >
          {blockMessage}
        </div>
      )}

      <Card className="mt-5 p-5 sm:p-6">
        <h2 className="text-lg font-semibold sm:text-xl">접수 전 안내</h2>
        <ul className="mt-3 space-y-3 text-base leading-relaxed sm:text-lg sm:leading-relaxed">
          {notices.map((n, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/60" />
              <span className="whitespace-pre-line break-words">{n}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-5 p-5 sm:p-6">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0 accent-primary"
            checked={agreed}
            onChange={toggle}
          />
          <span className="text-base leading-relaxed">
            개인정보 수집·이용 및 접수 안내 발송에 동의합니다.
            <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
              (수집 항목: 교회명, 주소, 담당자명·연락처, 참석자 명단·연락처 / 이용 목적: 캠프 접수 처리 및 접수 안내·QR 발송 /
              입력하신 담당자 연락처로 접수 안내 및 QR이 발송될 수 있습니다.)
            </span>
          </span>
        </label>
      </Card>

      <Button
        size="lg"
        className="mt-6 h-12 w-full text-base sm:w-auto sm:px-10"
        disabled={!agreed}
        onClick={onAgree}
      >
        {agreed ? "사전접수 작성 시작" : "동의 후 시작할 수 있습니다"}
      </Button>
    </div>
  );
}

function DoneScreen({ result }: { result: SubmitPreRegistrationResult }) {
  const [qr, setQr] = useState<string>("");
  useEffect(() => {
    QRCode.toDataURL(result.accessUrl, { width: 320, margin: 1 }).then(setQr).catch(() => setQr(""));
  }, [result.accessUrl]);

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10 text-center">
      <h1 className="text-2xl font-bold">사전접수가 완료되었습니다</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {result.headCount}명 · 예상 회비 {krw(result.expectedFee)}
      </p>
      <Card className="mt-6 flex flex-col items-center gap-4 p-6">
        {qr ? (
          <img src={qr} alt="사전접수 확인용 QR 코드" className="h-64 w-64" />
        ) : (
          <div className="h-64 w-64 animate-pulse rounded bg-muted" />
        )}
        <p className="text-base font-semibold text-destructive">
          이 QR을 반드시 저장하거나 캡처해 주세요.
        </p>
        <p className="text-sm text-muted-foreground">
          분실하더라도 교회명·담당자명·전화번호로 본인확인 후 다시 조회·수정할 수 있습니다.
        </p>
        <p className="break-all text-xs text-muted-foreground">{result.accessUrl}</p>
        <Link className="text-sm underline" to="/apply/lookup">
          본인확인으로 다시 조회하기
        </Link>
      </Card>
    </div>
  );
}
