import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildXlsx, colName, excelSerial } from "./xlsx";

describe("colName", () => {
  it("counts like spreadsheet columns", () => {
    expect([0, 25, 26, 27, 51, 52, 701, 702].map(colName)).toEqual(["A", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  });
});

describe("excelSerial", () => {
  it("is wall-clock time in India, as Excel has no time zones", () => {
    // 2026-01-01 00:00 IST is 2025-12-31 18:30 UTC; Excel's serial for 2026-01-01 is 46023
    expect(excelSerial(new Date("2025-12-31T18:30:00Z"))).toBeCloseTo(46023, 6);
    // half past noon IST
    expect(excelSerial(new Date("2026-01-01T07:00:00Z"))).toBeCloseTo(46023.5 + 0.5 / 24, 6);
  });
});

describe("buildXlsx", () => {
  const file = buildXlsx({
    sheetName: "Orders: Fresh/Saket",
    columns: [
      { header: "Order", type: "text" },
      { header: "Amount", type: "money" },
      { header: "Placed", type: "datetime" },
      { header: "Weight", type: "number" },
    ],
    rows: [
      ["A&B <x> \"q\"", 305.5, new Date("2025-12-31T18:30:00Z"), 6.1],
      ["=HYPERLINK(\"bad\")", null, undefined, Number.NaN],
    ],
  });
  const parts = unzipSync(file);
  const sheet = strFromU8(parts["xl/worksheets/sheet1.xml"]);

  it("is a complete workbook package", () => {
    expect(Object.keys(parts).sort()).toEqual(
      ["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"].sort(),
    );
    // sheet names can't contain : / \ ? * [ ]
    expect(strFromU8(parts["xl/workbook.xml"])).toContain('name="Orders  Fresh Saket"');
  });

  it("escapes text and keeps typed cells as numbers", () => {
    expect(sheet).toContain("A&amp;B &lt;x&gt; &quot;q&quot;");
    expect(sheet).toContain('<c r="B2" s="3"><v>305.5</v></c>');
    expect(sheet).toContain('<c r="C2" s="5"><v>46023</v></c>');
    expect(sheet).toContain('<c r="D2" s="2"><v>6.1</v></c>');
  });

  it("never writes formulas, and skips empty or non-finite cells", () => {
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain('t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(&quot;bad&quot;)</t>');
    expect(sheet).not.toMatch(/r="[BCD]3"/);
  });

  it("freezes the header and filters every column", () => {
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain('<autoFilter ref="A1:D3"/>');
  });
});
