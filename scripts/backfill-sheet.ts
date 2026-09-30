/**
 * One-time backfill: replays the Google Sheet order history into Toss through the
 * same device-ingest endpoint (so all validation and merge rules apply).
 *
 * Usage:
 *   1. In Google Sheets: File → Download → Comma-separated values (.csv)
 *   2. TOSS_INGEST_URL=... TOSS_BRIDGE_KEY=... npx tsx scripts/backfill-sheet.ts orders.csv          (dry run)
 *      TOSS_INGEST_URL=... TOSS_BRIDGE_KEY=... npx tsx scripts/backfill-sheet.ts orders.csv --apply  (send)
 *
 * Columns are matched case-insensitively: orderId, customerId, address, weight, status,
 * and optionally a timestamp column (timestamp / date / time / created) for the order time.
 */
import { readFileSync } from "node:fs";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") endField();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else field += c;
  }
  if (field || row.length) endRow();
  return rows.filter((r) => r.some((f) => f.trim()));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const COLUMNS = {
  orderId: ["orderid", "order", "id"],
  customerId: ["customerid", "customer", "chatid"],
  address: ["address", "pickupaddress"],
  weight: ["weight", "weightkg", "kg"],
  status: ["status", "orderstatus"],
  at: ["timestamp", "date", "time", "created", "createdat", "datetime"],
} as const;

async function main() {
  const [csvPath, flag] = process.argv.slice(2);
  const apply = flag === "--apply";
  const url = process.env.TOSS_INGEST_URL;
  const key = process.env.TOSS_BRIDGE_KEY;
  if (!csvPath) throw new Error("Usage: backfill-sheet.ts <file.csv> [--apply]");
  if (apply && (!url || !key)) throw new Error("Set TOSS_INGEST_URL and TOSS_BRIDGE_KEY");

  const [header, ...rows] = parseCsv(readFileSync(csvPath, "utf8"));
  const idx = Object.fromEntries(
    Object.entries(COLUMNS).map(([k, names]) => [k, header.findIndex((h) => (names as readonly string[]).includes(norm(h)))]),
  ) as Record<keyof typeof COLUMNS, number>;

  for (const required of ["orderId", "customerId", "weight", "status"] as const) {
    if (idx[required] < 0) throw new Error(`Missing column "${required}". Found: ${header.join(", ")}`);
  }
  if (idx.at < 0) console.warn("No timestamp column found: orders will be stamped with the import time.");

  let ok = 0;
  let failed = 0;
  for (const [n, r] of rows.entries()) {
    const payload = {
      orderId: Number(r[idx.orderId]),
      customerId: r[idx.customerId]?.trim(),
      address: idx.address >= 0 ? r[idx.address] : undefined,
      weight: Number(r[idx.weight]),
      status: r[idx.status]?.trim().toUpperCase(),
      at: idx.at >= 0 && r[idx.at] ? new Date(r[idx.at]).toISOString() : undefined,
    };

    if (!apply) {
      console.log(`[dry run] row ${n + 2}:`, JSON.stringify(payload));
      continue;
    }
    const res = await fetch(url!, {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-key": key! },
      body: JSON.stringify(payload),
    });
    if (res.ok) ok++;
    else {
      failed++;
      console.error(`row ${n + 2}: ${res.status} ${await res.text()}`);
    }
  }
  console.log(apply ? `Done: ${ok} imported, ${failed} failed.` : `Dry run of ${rows.length} rows. Re-run with --apply to send.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
