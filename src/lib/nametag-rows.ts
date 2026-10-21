// 이름표 출력 행 생성·내보내기 (이름표 출력 페이지와 명단 수정 페이지가 공유).
import { downloadRowsAsXlsx } from "@/lib/export-xlsx";

export type NametagRow = { no: number; church: string; name: string; churchId: string };

export function buildNametagRows(
  churches: { id: string; name: string; denomination?: string | null }[],
  people: { church_id: string; name: string }[],
): NametagRow[] {
  const byChurch = new Map<string, { name: string }[]>();
  for (const p of people) byChurch.set(p.church_id, [...(byChurch.get(p.church_id) ?? []), p]);
  const out: NametagRow[] = [];
  let no = 0;
  for (const c of churches) {
    const label = c.denomination ? `${c.name}(${c.denomination})` : c.name;
    for (const p of byChurch.get(c.id) ?? []) out.push({ no: ++no, church: label, name: p.name, churchId: c.id });
  }
  return out;
}

export function downloadNametagXlsx(rows: NametagRow[], fileName: string) {
  downloadRowsAsXlsx(rows.map((r) => ({ No: r.no, 교회: r.church, 명단: r.name })), "전체 등록자 명단", fileName);
}

export function nametagTsv(rows: NametagRow[]) {
  const esc = (v: string | number) => String(v ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
  return [["No", "교회", "명단"].join("\t"), ...rows.map((r) => [r.no, esc(r.church), esc(r.name)].join("\t"))].join("\n");
}

/** 클립보드 복사 (보안 컨텍스트가 아니면 textarea 대체) */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      document.body.removeChild(ta);
    }
  }
}
