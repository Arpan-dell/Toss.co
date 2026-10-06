import { strToU8, zipSync } from "fflate";

// A small, dependency-light .xlsx writer (Office Open XML, zipped with fflate) for exports like the manager's
// order list. One sheet, typed columns, a bold frozen header with filters, and real Excel dates and numbers,
// so the file sorts and sums properly instead of being a CSV with text everywhere.

export type XlsxColumn = { header: string; width?: number; type?: "text" | "number" | "money" | "date" | "datetime" };
export type XlsxCell = string | number | Date | null | undefined;

const esc = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "") // XML 1.0 forbids these
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** A1-style column letters: 0 -> A, 25 -> Z, 26 -> AA. */
export function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/**
 * Excel's date serial for a moment, as wall-clock time in the given zone (Excel has no time zones):
 * days since 1899-12-30, with the time of day as the fraction.
 */
export function excelSerial(d: Date, timeZone = "Asia/Kolkata"): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return wall / 86_400_000 + 25_569; // 25569 = days from 1899-12-30 to 1970-01-01
}

// cellXfs indexes in styles.xml below
const STYLE = { header: 1, text: 0, number: 2, money: 3, date: 4, datetime: 5 } as const;

function cell(ref: string, value: XlsxCell, type: XlsxColumn["type"] = "text"): string {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const s = type === "date" ? STYLE.date : STYLE.datetime;
    return `<c r="${ref}" s="${s}"><v>${excelSerial(value)}</v></c>`;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    const s = type === "money" ? STYLE.money : STYLE.number;
    return `<c r="${ref}" s="${s}"><v>${value}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

export function buildXlsx({ sheetName, columns, rows }: { sheetName: string; columns: XlsxColumn[]; rows: XlsxCell[][] }): Uint8Array {
  const last = colName(columns.length - 1);
  const header = `<row r="1">${columns.map((c, i) => `<c r="${colName(i)}1" t="inlineStr" s="${STYLE.header}"><is><t>${esc(c.header)}</t></is></c>`).join("")}</row>`;
  const body = rows
    .map((r, ri) => `<row r="${ri + 2}">${columns.map((c, ci) => cell(`${colName(ci)}${ri + 2}`, r[ci], c.type)).join("")}</row>`)
    .join("");
  const cols = columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 14}" customWidth="1"/>`).join("");

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols>
<sheetData>${header}${body}</sheetData>
<autoFilter ref="A1:${last}${rows.length + 1}"/>
</worksheet>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;₹&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="dd mmm yyyy"/><numFmt numFmtId="166" formatCode="dd mmm yyyy hh:mm"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEEF1F7"/></patternFill></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  const safeName = esc(sheetName.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1");
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${safeName}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${safeName}'!$A$1:$${last}$${rows.length + 1}</definedName></definedNames></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
    "xl/styles.xml": strToU8(styles),
  };
  return zipSync(files, { level: 6 });
}
