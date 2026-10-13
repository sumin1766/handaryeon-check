import type { RegionStats, RegionRow } from "@/lib/region-stats";

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
    const canvas = await renderPage(stats, stats.rows, timestamp);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("이미지 내보내기에 실패했습니다.")), "image/png"));
    download(blob, filename); return;
  }
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${stats.seasonName} 지역별 교회 집계`); pdf.setCreationDate(generatedAt);
  // Whole rows, repeated headers, and space for footer: no clipped rows across pages.
  const chunkSize = 22;
  const pages = Math.ceil(stats.rows.length / chunkSize);
  for (let i = 0; i < pages; i++) {
    const canvas = await renderPage(stats, stats.rows.slice(i * chunkSize, (i + 1) * chunkSize), timestamp, `${i + 1} / ${pages}`);
    const image = await pdf.embedPng(canvas.toDataURL("image/png"));
    const page = pdf.addPage([595.28, 841.89]);
    const width = 555.28, height = width * canvas.height / canvas.width;
    page.drawImage(image, { x: 20, y: 821.89 - height, width, height });
  }
  const bytes = await pdf.save();
  download(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), filename);
}