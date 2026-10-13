import type { RegionStats, RegionRow } from "@/lib/region-stats";
import { regionBins, regionLevel } from "@/lib/region-stats";
import { KOREA_MAP_PATHS } from "@/lib/korea-map-paths";
import { REGION_MAP_LABELS } from "@/lib/region-map-layout";
import { churchListCsv, churchListRecords, type RegionChurchList } from "@/lib/region-church-list";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
function palette() {
  const css = getComputedStyle(document.documentElement);
  const get = (key: string) => css.getPropertyValue(key).trim();
  return { paper: get("--region-export-paper"), ink: get("--region-export-ink"), muted: get("--region-export-muted"), rule: get("--region-export-rule"), band: get("--region-1"), total: get("--region-5"), white: get("--region-zero") };
}
async function renderMap(stats: RegionStats, timestamp: string) {
  const font = '"Pretendard", "Noto Sans KR", sans-serif';
  await document.fonts.load(`24px ${font}`, "지역별 참석 교회 " + stats.seasonName + KOREA_MAP_PATHS.map((p) => p.name).join(" "));
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 2200; canvas.height = 1980;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("지도를 만들 수 없습니다.");
  const colors = palette(), css = getComputedStyle(document.documentElement);
  const fills = [colors.white, ...[1, 2, 3, 4, 5].map((n) => css.getPropertyValue(`--region-${n}`).trim())];
  const bins = regionBins(stats.provinces);
  ctx.scale(2, 2); ctx.fillStyle = colors.paper; ctx.fillRect(0, 0, 1100, 990);
  ctx.fillStyle = colors.ink; ctx.font = `bold 30px ${font}`; ctx.fillText("지역별 참석 교회", 60, 60);
  ctx.font = `22px ${font}`; ctx.fillText(stats.seasonName, 60, 98);
  ctx.fillStyle = colors.muted; ctx.font = `17px ${font}`; ctx.fillText(`생성 일시: ${timestamp}`, 60, 130);
  ctx.fillStyle = colors.band; ctx.fillRect(760, 35, 280, 52);
  ctx.fillStyle = colors.total; ctx.font = `bold 23px ${font}`; ctx.textAlign = "center"; ctx.fillText(`전국 합계 ${stats.total}교회`, 900, 69); ctx.textAlign = "left";
  ctx.save(); ctx.translate(20, 155); ctx.scale(1060 / 1100, 1060 / 1100);
  for (const p of KOREA_MAP_PATHS) {
    const path = new Path2D(p.d);
    ctx.fillStyle = fills[regionLevel(stats.provinces[p.name], bins)]; ctx.fill(path);
    ctx.strokeStyle = colors.muted; ctx.lineWidth = .7; ctx.stroke(path);
  }
  for (const { name, center, x, y, elbow, edge } of REGION_MAP_LABELS) {
    ctx.strokeStyle = colors.muted; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(center[0], center[1]); ctx.lineTo(elbow, center[1]); ctx.lineTo(edge, y + 23); ctx.stroke();
    ctx.fillStyle = colors.ink; ctx.beginPath(); ctx.arc(center[0], center[1], 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = colors.paper; ctx.beginPath(); ctx.roundRect(x, y, 200, 46, 6); ctx.fill(); ctx.strokeStyle = colors.rule; ctx.stroke();
    ctx.fillStyle = colors.ink; ctx.font = `bold 15px ${font}`; ctx.fillText(name, x + 11, y + 19);
    ctx.fillStyle = colors.muted; ctx.font = `14px ${font}`; ctx.fillText(`${stats.provinces[name]}교회`, x + 11, y + 37);
  }
  ctx.restore();
  ctx.fillStyle = colors.ink; ctx.font = `bold 20px ${font}`; ctx.fillText("교회 수", 60, 790);
  const legend = [{ level: 0, text: "0교회 = 흰색" }, ...bins.map((b) => ({ level: b.level, text: b.max === Infinity ? `${b.min}교회 이상` : `${b.min === b.max ? b.min : `${b.min}–${b.max}`}교회` }))];
  legend.forEach((b, i) => { const x = 60 + (i % 3) * 330, y = 814 + Math.floor(i / 3) * 39; ctx.fillStyle = fills[b.level]; ctx.fillRect(x, y, 23, 23); ctx.strokeStyle = colors.rule; ctx.strokeRect(x, y, 23, 23); ctx.fillStyle = colors.ink; ctx.font = `19px ${font}`; ctx.fillText(b.text, x + 35, y + 19); });
  ctx.fillStyle = colors.muted; ctx.font = `19px ${font}`; ctx.fillText(`미입력/미분류 ${stats.unknown}교회`, 60, 916);
  ctx.font = `13px ${font}`; ctx.fillText("경계: 통계청 SGIS · vuski/admdongkor(CC BY 4.0), 2025.01 · 표시용 단순화", 60, 960);
  return canvas;
}
function appendCanvas(top: HTMLCanvasElement, bottom: HTMLCanvasElement) {
  const canvas = document.createElement("canvas"); canvas.width = top.width; canvas.height = top.height + bottom.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 만들 수 없습니다.");
  ctx.drawImage(top, 0, 0); ctx.drawImage(bottom, 0, top.height); return canvas;
}
export function exportTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date) + " (KST)";
}
async function renderPage(stats: RegionStats, rows: RegionRow[], timestamp: string, pageLabel = "") {
  const font = '"Pretendard", "Noto Sans KR", sans-serif';
  await document.fonts.load(`24px ${font}`, `${stats.seasonName} 지역별 교회 집계 ${timestamp} ${rows.map((r) => r.sido + r.sigungu).join(" ")}`);
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  const width = 1100, height = 290 + rows.length * 54;
  canvas.width = width * 2; canvas.height = height * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 만들 수 없습니다.");
  const colors = palette();
  ctx.scale(2, 2); ctx.fillStyle = colors.paper; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = colors.ink; ctx.font = `bold 34px ${font}`; ctx.fillText("지역별 교회 집계", 60, 70);
  ctx.font = `24px ${font}`; ctx.fillText(stats.seasonName, 60, 112);
  ctx.fillStyle = colors.muted; ctx.font = `19px ${font}`; ctx.fillText(`생성 일시: ${timestamp}`, 60, 150);
  ctx.fillText(`전국 합계 ${stats.total}교회 · 미입력/미분류 ${stats.unknown}교회`, 60, 183);
  const drawRow = (cells: string[], y: number, fill?: string, strong = false, foreground = colors.ink) => {
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(60, y, 980, 54); }
    ctx.fillStyle = foreground; ctx.font = `${strong ? "bold " : ""}23px ${font}`;
    ctx.textAlign = "left"; ctx.fillText(cells[0], 78, y + 35); ctx.fillText(cells[1], 480, y + 35);
    ctx.textAlign = "right"; ctx.fillText(cells[2], 1020, y + 35); ctx.textAlign = "left";
    ctx.strokeStyle = colors.rule; ctx.beginPath(); ctx.moveTo(60, y + 54); ctx.lineTo(1040, y + 54); ctx.stroke();
  };
  drawRow(["시/도", "시군구", "교회 수"], 205, colors.band, true);
  rows.forEach((r, i) => drawRow([r.sido, r.sigungu, `${r.count}교회`], 259 + i * 54, r.kind === "total" ? colors.total : r.kind === "subtotal" ? colors.band : undefined, r.kind !== "district", r.kind === "total" ? colors.white : colors.ink));
  if (pageLabel) { ctx.font = `16px ${font}`; ctx.fillStyle = colors.muted; ctx.textAlign = "right"; ctx.fillText(pageLabel, 1040, height - 8); }
  return canvas;
}
export async function exportRegionStats(stats: RegionStats, format: "pdf" | "png") {
  const generatedAt = new Date();
  const timestamp = exportTimestamp(generatedAt);
  const filename = `${stats.seasonName.replace(/[\\/:*?"<>|]/g, "-")}_지역별교회_${generatedAt.toISOString().replace(/[:.]/g, "-")}.${format}`;
  if (format === "png") {
    const canvas = appendCanvas(await renderPage(stats, stats.rows, timestamp), await renderMap(stats, timestamp));
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("이미지 내보내기에 실패했습니다.")), "image/png"));
    download(blob, filename); return;
  }
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${stats.seasonName} 지역별 교회 집계`); pdf.setCreationDate(generatedAt);
  // Whole rows, repeated headers, and space for footer: no clipped rows across pages.
  const chunkSize = 22;
  const tablePages = Math.max(1, Math.ceil(stats.rows.length / chunkSize)), pages = tablePages + 1;
  for (let i = 0; i < pages; i++) {
    const canvas = i === tablePages ? await renderMap(stats, timestamp) : await renderPage(stats, stats.rows.slice(i * chunkSize, (i + 1) * chunkSize), timestamp, `${i + 1} / ${pages}`);
    const image = await pdf.embedPng(canvas.toDataURL("image/png"));
    const page = pdf.addPage([595.28, 841.89]);
    const width = 555.28, height = width * canvas.height / canvas.width;
    page.drawImage(image, { x: 20, y: 821.89 - height, width, height });
  }
  const bytes = await pdf.save();
  download(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), filename);
}

export async function exportRegionChurchList(list: RegionChurchList, format: "pdf" | "xlsx" | "csv") {
  const generatedAt = new Date(), timestamp = exportTimestamp(generatedAt);
  const base = `${list.seasonName.replace(/[\\/:*?"<>|]/g, "-")}_지역별교회목록_${generatedAt.toISOString().replace(/[:.]/g, "-")}`;
  if (format === "csv") { await navigator.clipboard.writeText(churchListCsv(list, timestamp)); return; }
  if (format === "xlsx") {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook(); workbook.creator = "한다련 캠프"; workbook.created = generatedAt;
    const sheet = workbook.addWorksheet("지역별 교회 목록");
    sheet.columns = [20, 29, 24, 22, 32, 24, 24, 12].map((width) => ({ width }));
    sheet.addRow(["시즌", "생성 일시", "시/도", "시군구", "교회명", "(대표)담당자", "연락처", "인원수"]);
    for (const row of churchListRecords(list, timestamp)) sheet.addRow(Object.values(row));
    if (!list.rows.length) sheet.addRow([list.seasonName, timestamp]);
    sheet.eachRow((row) => { row.font = { name: "Arial", size: 11 }; row.alignment = { vertical: "middle", wrapText: true }; row.height = 32; });
    sheet.getRow(1).font = { name: "Arial", size: 11, bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }]; sheet.autoFilter = "A1:H1";
    sheet.getColumn(7).numFmt = "@"; sheet.getColumn(8).numFmt = '0;[Red](0);"-"';
    const bytes = await workbook.xlsx.writeBuffer();
    download(new Blob([new Uint8Array(bytes)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), base + ".xlsx"); return;
  }
  const font = '"Pretendard", "Noto Sans KR", sans-serif';
  await document.fonts.load(`22px ${font}`, list.rows.map((r) => Object.values(r).join(" ")).join(" "));
  await document.fonts.ready;
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create(); pdf.setTitle(`${list.seasonName} 지역별 교회 목록`); pdf.setCreationDate(generatedAt);
  const colors = palette(), widths = [180, 165, 240, 170, 205, 100], headers = ["시/도", "시군구", "교회명", "(대표)담당자", "연락처", "인원수"];
  const measurement = document.createElement("canvas").getContext("2d");
  if (!measurement) throw new Error("목록을 만들 수 없습니다.");
  measurement.font = `20px ${font}`;
  const wrap = (text: string, width: number) => { const lines: string[] = []; let line = ""; for (const char of text) { if (line && measurement.measureText(line + char).width > width) { lines.push(line); line = char; } else line += char; } lines.push(line); return lines; };
  const prepared = list.rows.map((r) => { const cells = [r.sido, r.sigungu, r.churchName, r.managerName, r.phone, `${r.peopleCount}명`].map((v, i) => wrap(v, widths[i] - 22)); return { cells, height: Math.max(52, Math.max(...cells.map((c) => c.length)) * 27 + 20) }; });
  const chunks: typeof prepared[] = []; let chunk: typeof prepared = [], used = 0;
  for (const row of prepared) { if (row.height > 1200) throw new Error("교회 목록의 한 항목이 너무 길어 PDF로 내보낼 수 없습니다."); if (used + row.height > 1200 && chunk.length) { chunks.push(chunk); chunk = []; used = 0; } chunk.push(row); used += row.height; }
  if (chunk.length || !chunks.length) chunks.push(chunk);
  for (let p = 0; p < chunks.length; p++) {
    const canvas = document.createElement("canvas"); canvas.width = 2320; canvas.height = 3040;
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("목록을 만들 수 없습니다.");
    ctx.scale(2, 2); ctx.fillStyle = colors.paper; ctx.fillRect(0, 0, 1160, 1520);
    ctx.fillStyle = colors.ink; ctx.font = `bold 32px ${font}`; ctx.fillText("지역별 교회 목록", 50, 65);
    ctx.font = `23px ${font}`; ctx.fillText(`${list.seasonName} · 확정 교회 ${list.rows.length}곳`, 50, 106);
    ctx.fillStyle = colors.muted; ctx.font = `18px ${font}`; ctx.fillText(`생성 일시: ${timestamp}`, 50, 143);
    ctx.fillStyle = colors.band; ctx.fillRect(50, 173, 1060, 52); ctx.fillStyle = colors.ink; ctx.font = `bold 20px ${font}`;
    let x = 50; headers.forEach((h, i) => { ctx.fillText(h, x + 11, 207); x += widths[i]; });
    let y = 225; ctx.font = `20px ${font}`;
    for (const row of chunks[p]) { x = 50; ctx.fillStyle = colors.ink; row.cells.forEach((lines, i) => { lines.forEach((line, j) => ctx.fillText(line, x + 11, y + 30 + j * 27)); x += widths[i]; }); y += row.height; ctx.strokeStyle = colors.rule; ctx.beginPath(); ctx.moveTo(50, y); ctx.lineTo(1110, y); ctx.stroke(); }
    if (!list.rows.length) { ctx.fillStyle = colors.muted; ctx.fillText("확정 교회 없음", 61, 270); }
    ctx.fillStyle = colors.muted; ctx.font = `16px ${font}`; ctx.textAlign = "right"; ctx.fillText(`${p + 1} / ${chunks.length}`, 1110, 1490);
    const image = await pdf.embedPng(canvas.toDataURL("image/png")); const page = pdf.addPage([595.28, 841.89]); page.drawImage(image, { x: 20, y: 20, width: 555.28, height: 727.6 });
  }
  const bytes = await pdf.save(); download(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), base + ".pdf");
}