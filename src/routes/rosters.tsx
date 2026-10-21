import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useActiveSeason } from "@/lib/use-active-season";
import { useQuery } from "@tanstack/react-query";
import { sdb } from "@/lib/secure-db";
import { fetchAll } from "@/lib/fetch-all";
import { useRealtimeInvalidate } from "@/lib/use-realtime";
import { useChurchManagers } from "@/lib/use-church-managers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Printer, Copy, Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useServerFn } from "@tanstack/react-start";
import { useAuthRole } from "@/lib/use-auth-role";
import { getSessionPassword } from "@/lib/session-password";
import { getChurchAddresses } from "@/lib/region-stats.functions";
import { parseCategoryFees } from "@/lib/member-categories";
import { lodgingCounts, shortAddress } from "@/lib/roster-edit";
import { copyText } from "@/lib/nametag-rows";
import { RosterChurchDetail } from "@/components/roster-church-detail";
import { downloadRowsAsXlsx } from "@/lib/export-xlsx";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/rosters")({
  head: () => ({ meta: [
    { title: "명단 수정 — 한다련 캠프" },
    { name: "description", content: "교회별 참석자 명단을 조회·수정·출력합니다." },
    { property: "og:title", content: "명단 수정 — 한다련 캠프" },
    { property: "og:description", content: "교회별 참석자 명단을 조회·수정·출력합니다." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  validateSearch: (s: Record<string, unknown>) => ({ church: typeof s.church === "string" ? s.church : undefined }),
  component: RostersPage,
});

function RostersPage() {
  const { season } = useActiveSeason();
  const role = useAuthRole();
  const canEdit = role === "admin" || role === "staff";
  const { church: openId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  useRealtimeInvalidate(["churches", "people", "app_settings"], [["rosters-page", season?.id], ["church-managers", season?.id], ["roster-addresses", season?.id]]);
  const managers = useChurchManagers(season?.id);
  const fetchAddresses = useServerFn(getChurchAddresses);
  const { data } = useQuery({
    queryKey: ["rosters-page", season?.id],
    enabled: !!season?.id,
    queryFn: async () => {
      const { data: churches } = await sdb
        .from("churches")
        .select("id, name, denomination, contact_name, phone")
        .eq("season_id", season!.id)
        .order("name");
      const ids = (churches ?? []).map((c: any) => c.id);
      const people = ids.length
        ? await fetchAll<any>("people", (q) => q.select("id, church_id, name, note, gender, age_group, lodging, pre_registration_id, created_at").in("church_id", ids))
        : [];
      const { data: settings } = await sdb.from("app_settings").select("pre_reg_fee, category_fees").eq("season_id", season!.id).maybeSingle();
      return { churches: churches ?? [], people, preRegFee: (settings as any)?.pre_reg_fee ?? 0, fees: parseCategoryFees((settings as any)?.category_fees) };
    },
  });
  const { data: addresses } = useQuery({
    queryKey: ["roster-addresses", season?.id],
    enabled: !!season?.id,
    queryFn: async () => {
      const password = getSessionPassword();
      if (!password) return [];
      try { return await fetchAddresses({ data: { password, seasonId: season!.id } }); } catch { return []; }
    },
  });

  if (!season)
    return (
      <AppShell>
        <div className="text-sm text-muted-foreground">시즌이 없습니다.</div>
      </AppShell>
    );

  const churches = data?.churches ?? [];
  const people = data?.people ?? [];
  const addrByChurch = new Map((addresses ?? []).map((a) => [a.churchId, shortAddress(a)]));

  const peopleByChurch = new Map<string, any[]>();
  for (const p of people) peopleByChurch.set(p.church_id, [...(peopleByChurch.get(p.church_id) ?? []), p]);

  const allRows = churches
    .map((c: any) => {
      // 대표 담당자가 지정돼 있으면 표시만 대표 기준으로 통일한다(원본은 그대로).
      const info = managers.map.get(c.id);
      const primary = info?.primaryPreRegistrationId ? info.primary : null;
      const contactName = primary?.name ?? c.contact_name;
      const contactPhone = primary?.phone ?? c.phone;
      const counts = lodgingCounts(peopleByChurch.get(c.id) ?? []);
      return {
        id: c.id,
        name: c.name as string,
        denomination: (c.denomination ?? "") as string,
        address: addrByChurch.get(c.id) ?? "",
        contact: [contactName, contactPhone].filter(Boolean).join(" / ") || "-",
        ...counts,
      };
    })
    .sort((a: any, b: any) => a.name.localeCompare(b.name, "ko"));

  const q = search.trim();
  const rows = q ? allRows.filter((r) => r.name.includes(q)) : allRows;
  const sum = (k: "lodging" | "nonLodging" | "total") => rows.reduce((s, r) => s + r[k], 0);
  const totalPeople = sum("total");

  const openChurch = churches.find((c: any) => c.id === openId);
  if (openId && openChurch) {
    return (
      <AppShell>
        <RosterChurchDetail
          key={openId}
          church={openChurch}
          people={peopleByChurch.get(openId) ?? []}
          managerInfo={managers.map.get(openId)}
          fees={data?.fees ?? {}}
          preRegFee={data?.preRegFee ?? 0}
          canEdit={canEdit}
          seasonName={season.name}
          onBack={() => navigate({ search: {} as any })}
        />
      </AppShell>
    );
  }

  const HEAD = ["교회명", "교단명", "주소", "담당자 연락처", "숙박 인원", "비숙박 인원", "전체 인원"];
  const download = () => {
    const xlsx = rows.map((r) => ({
      교회명: r.name,
      교단명: r.denomination,
      주소: r.address,
      "담당자 연락처": r.contact,
      "숙박 인원": r.lodging,
      "비숙박 인원": r.nonLodging,
      "전체 인원": r.total,
    }));
    downloadRowsAsXlsx(xlsx, "교회별 명단", `${season.name}_명단.xlsx`);
  };

  // TSV (탭 구분) — 구글 스프레드시트에 붙여넣으면 셀별로 자동 분리됩니다.
  const copyCsv = async () => {
    const escape = (v: string) => String(v ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
    const body = rows
      .map((r) => [escape(r.name), escape(r.denomination), escape(r.address), escape(r.contact), r.lodging, r.nonLodging, r.total].join("\t"))
      .join("\n");
    if (await copyText(`${HEAD.join("\t")}\n${body}`)) {
      setCopied(true);
      toast.success("복사됨 — 구글 시트에 붙여넣으세요");
      setTimeout(() => setCopied(false), 1800);
    } else toast.error("복사 실패");
  };

  return (
    <AppShell>
      <style>{`
        @media print {
          body { background: white !important; }
          .print-hide { display: none !important; }
          .print-page { padding: 0 !important; }
        }
      `}</style>
      <div className="space-y-4 print-page">
        <header className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">명단 수정</h1>
            <p className="text-sm text-muted-foreground">
              교회별 명단 · 총 {rows.length}개 교회 / {totalPeople}명 · 교회를 누르면 명단을 보고 고칠 수 있습니다
            </p>
          </div>
          <div className="flex gap-2 print-hide">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" />
              인쇄
            </Button>
            <Button variant="outline" onClick={copyCsv}>
              {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              {copied ? "복사됨" : "CSV 복사"}
            </Button>
            <Button onClick={download}>
              <Download className="h-4 w-4 mr-1" />
              엑셀 다운로드(.xlsx)
            </Button>
          </div>
        </header>

        <div className="flex items-center gap-2 print-hide">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="교회명 검색" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          {q && <button onClick={() => setSearch("")} className="text-xs text-muted-foreground hover:text-foreground">초기화</button>}
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="bg-primary text-primary-foreground px-4 py-3 text-base font-bold tracking-wide">
            교회별 명단 (가나다순)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs">
                <tr>
                  <th className="text-right px-3 py-2 w-14">No</th>
                  <th className="text-left px-3 py-2">교회명</th>
                  <th className="text-left px-3 py-2">교단명</th>
                  <th className="text-left px-3 py-2">주소</th>
                  <th className="text-left px-3 py-2">담당자 연락처</th>
                  <th className="text-right px-3 py-2 w-20">숙박 인원</th>
                  <th className="text-right px-3 py-2 w-20">비숙박 인원</th>
                  <th className="text-right px-3 py-2 w-20">전체 인원</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => navigate({ search: { church: r.id } })}>
                    <td className="text-right px-3 py-1.5 tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="text-left px-3 py-1.5 font-medium">{r.name}</td>
                    <td className="text-left px-3 py-1.5 text-muted-foreground">{r.denomination}</td>
                    <td className="text-left px-3 py-1.5">{r.address}</td>
                    <td className="text-left px-3 py-1.5">{r.contact}</td>
                    <td className="text-right px-3 py-1.5 tabular-nums">{r.lodging}</td>
                    <td className="text-right px-3 py-1.5 tabular-nums">{r.nonLodging}</td>
                    <td className="text-right px-3 py-1.5 tabular-nums font-semibold">{r.total}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-sm text-muted-foreground">
                      {q ? "검색 결과가 없습니다." : "등록된 교회가 없습니다."}
                    </td>
                  </tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="bg-muted/40 border-t-2 border-foreground/20">
                  <tr>
                    <td className="px-3 py-2" />
                    <td className="text-left px-3 py-2 font-bold" colSpan={4}>
                      합계 ({rows.length}개 교회)
                    </td>
                    <td className="text-right px-3 py-2 font-bold tabular-nums">{sum("lodging")}</td>
                    <td className="text-right px-3 py-2 font-bold tabular-nums">{sum("nonLodging")}</td>
                    <td className="text-right px-3 py-2 font-bold tabular-nums">{totalPeople}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
