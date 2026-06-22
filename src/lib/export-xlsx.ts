type CellValue = string | number | boolean | null | undefined;

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function downloadRowsAsXlsx(
  rows: Record<string, CellValue>[],
  sheetName: string,
  fileName: string,
) {
  if (typeof document === "undefined") return;

  const headers = Array.from(rows.reduce((keys, row) => {
    Object.keys(row).forEach((key) => keys.add(key));
    return keys;
  }, new Set<string>()));
  const workbook = createWorkbook(headers, rows, sheetName);
  const blob = new Blob([workbook], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function createWorkbook(headers: string[], rows: Record<string, CellValue>[], sheetName: string) {
  const worksheet = createWorksheet(headers, rows);
  return zip([
    { name: "[Content_Types].xml", data: text(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`) },
    { name: "_rels/.rels", data: text(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: "xl/workbook.xml", data: text(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName.slice(0, 31) || "Sheet1")}" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: text(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: "xl/styles.xml", data: text(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Arial"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`) },
    { name: "xl/worksheets/sheet1.xml", data: text(worksheet) },
  ]);
}

function createWorksheet(headers: string[], rows: Record<string, CellValue>[]) {
  const allRows = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))];
  const maxColumn = Math.max(headers.length, 1);
  const maxRow = Math.max(allRows.length, 1);
  const body = allRows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
      return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(String(value))}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${columnName(maxColumn)}${maxRow}"/><sheetData>${body}</sheetData></worksheet>`;
}

function columnName(index: number) {
  let name = "";
  while (index > 0) {
    const rem = (index - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    index = Math.floor((index - 1) / 26);
  }
  return name;
}

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;" })[char] ?? char);
}

const encoder = new TextEncoder();
const text = (value: string) => encoder.encode(value);

function zip(files: { name: string; data: Uint8Array }[]) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const fileName = text(file.name);
    const crc = crc32(file.data);
    const localHeader = header(30);
    write32(localHeader, 0, 0x04034b50);
    write16(localHeader, 4, 20);
    write16(localHeader, 6, 0x0800);
    write16(localHeader, 8, 0);
    write32(localHeader, 14, crc);
    write32(localHeader, 18, file.data.length);
    write32(localHeader, 22, file.data.length);
    write16(localHeader, 26, fileName.length);
    localParts.push(localHeader, fileName, file.data);

    const centralHeader = header(46);
    write32(centralHeader, 0, 0x02014b50);
    write16(centralHeader, 4, 20);
    write16(centralHeader, 6, 20);
    write16(centralHeader, 8, 0x0800);
    write32(centralHeader, 16, crc);
    write32(centralHeader, 20, file.data.length);
    write32(centralHeader, 24, file.data.length);
    write16(centralHeader, 28, fileName.length);
    write32(centralHeader, 42, offset);
    centralParts.push(centralHeader, fileName);

    offset += localHeader.length + fileName.length + file.data.length;
  }

  const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
  const end = header(22);
  write32(end, 0, 0x06054b50);
  write16(end, 8, files.length);
  write16(end, 10, files.length);
  write32(end, 12, centralSize);
  write32(end, 16, offset);
  return concat([...localParts, ...centralParts, end]);
}

function header(size: number) {
  return new Uint8Array(size);
}

function write16(buffer: Uint8Array, offset: number, value: number) {
  buffer[offset] = value & 255;
  buffer[offset + 1] = (value >> 8) & 255;
}

function write32(buffer: Uint8Array, offset: number, value: number) {
  buffer[offset] = value & 255;
  buffer[offset + 1] = (value >> 8) & 255;
  buffer[offset + 2] = (value >> 16) & 255;
  buffer[offset + 3] = (value >> 24) & 255;
}

function concat(parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function crc32(data: Uint8Array) {
  let crc = -1;
  for (const byte of data) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 255];
  }
  return (crc ^ -1) >>> 0;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});