import { confirmedRegionUnits, type RegionChurch, type RegionRegistration } from "@/lib/region-stats";
import { KOREA_REGIONS, SIDO_LIST } from "@/lib/korea-regions";

export type ExportChurch = RegionChurch & { name: string; contact_name: string | null; phone: string | null };
export type ExportRegistration = RegionRegistration & { church_name: string; manager_name: string; manager_phone: string; head_count: number | null };
export type RegionChurchListRow = { sido: string; sigungu: string; churchName: string; managerName: string; phone: string; peopleCount: number };
export type RegionChurchList = { seasonId: string; seasonName: string; rows: RegionChurchListRow[] };

/** Attendees are the existing people rows, exactly as intake/registry; never sum submission head counts for linked churches. */
export function buildRegionChurchList(seasonId: string, seasonName: string, churches: ExportChurch[], registrations: ExportRegistration[], people: { church_id: string }[]): RegionChurchList {
  const byChurch = new Map(churches.map((c) => [c.id, c]));
  const counts = new Map<string, number>();
  for (const p of people) counts.set(p.church_id, (counts.get(p.church_id) ?? 0) + 1);
  const rows = confirmedRegionUnits(seasonId, churches, registrations).map((unit): RegionChurchListRow => {
    const church = unit.churchId ? byChurch.get(unit.churchId) : undefined;
    const confirmed = unit.registrations[0];
    const source = registrations.find((r) => r.id === confirmed?.id);
    const managers = church ? registrations.filter((r) => r.season_id === seasonId && r.church_id === church.id).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)) : [];
    const manager = managers.find((r) => r.id === church?.primary_pre_registration_id) ?? managers[0] ?? source;
    return { sido: unit.address?.sido ?? "미입력/미분류", sigungu: unit.address?.sigungu ?? "—", churchName: church?.name ?? source?.church_name ?? "—", managerName: manager?.manager_name ?? church?.contact_name ?? "—", phone: manager?.manager_phone ?? church?.phone ?? "", peopleCount: church ? counts.get(church.id) ?? 0 : source?.head_count ?? 0 };
  });
  const rank = (s: string) => { const i = SIDO_LIST.indexOf(s); return i < 0 ? SIDO_LIST.length : i; };
  rows.sort((a, b) => rank(a.sido) - rank(b.sido) || (KOREA_REGIONS[a.sido]?.indexOf(a.sigungu) ?? 0) - (KOREA_REGIONS[b.sido]?.indexOf(b.sigungu) ?? 0) || a.churchName.localeCompare(b.churchName, "ko"));
  return { seasonId, seasonName, rows };
}

/** CSV remains literal text even when pasted into spreadsheets. */
export function churchListRecords(list: RegionChurchList, timestamp: string) {
  return list.rows.map((r) => ({ "시즌": list.seasonName, "생성 일시": timestamp, "시/도": r.sido, "시군구": r.sigungu, "교회명": r.churchName, "(대표)담당자": r.managerName, "연락처": r.phone, "인원수": r.peopleCount }));
}
/** Display-only totals of the unchanged, already grouped export rows. */
export function churchListSummary(list: RegionChurchList) {
  return { churchCount: list.rows.length, peopleCount: list.rows.reduce((sum, row) => sum + row.peopleCount, 0) };
}
export function churchListSummaryText(list: RegionChurchList) {
  const summary = churchListSummary(list);
  return `사전신청 ${summary.churchCount}교회 · 신청 인원 ${summary.peopleCount}명`;
}
function churchListDelimited(list: RegionChurchList, timestamp: string, delimiter: "," | "\t") {
  const records = churchListRecords(list, timestamp);
  const headers = ["시즌", "생성 일시", "시/도", "시군구", "교회명", "(대표)담당자", "연락처", "인원수"];
  const quote = (v: unknown) => {
    const raw = String(v ?? "");
    const text = /^[=+@\-\t\r]/.test(raw) ? "'" + raw : raw;
    return delimiter === "," || /[\t\r\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [[list.seasonName, timestamp], [churchListSummaryText(list)], headers, ...records.map((r) => Object.values(r))].map((row) => row.map(quote).join(delimiter)).join("\r\n");
}
export function churchListCsv(list: RegionChurchList, timestamp: string) {
  return churchListDelimited(list, timestamp, ",");
}
export function churchListClipboard(list: RegionChurchList, timestamp: string) {
  return churchListDelimited(list, timestamp, "\t");
}