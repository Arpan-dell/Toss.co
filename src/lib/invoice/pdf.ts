import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// Renders a paid pickup's invoice as an A4 PDF. Pure (no I/O) so it's unit-testable; pdf-lib's
// built-in Helvetica needs no font files, which keeps it working on Vercel. Those fonts only cover
// Latin-1 (WinAnsi), so amounts use "Rs." and other characters are replaced.

export interface InvoiceData {
  number: string; // TOSS-2026-000123
  issuedAt: string;
  business: { name: string; joinCode: string; storeAddress?: string; upiId?: string; managerEmail?: string };
  customer: { name?: string; code: string; email?: string; phone?: string };
  order: {
    label: string; // basket · #104
    placedAt: string;
    acceptedAt?: string;
    completedAt?: string;
    address: string;
    weightKg: number;
    bags?: string; // "Whites 2.1 kg · Coloured 3.4 kg" when whites and coloured clothes were bagged apart
    subtotal: number; // before discount
    discountPct?: number;
    basketCredit?: number; // Toss basket credit taken off this bill
    total: number;
  };
  driver?: { name: string };
  payment: { method: string; ref?: string; paidAt?: string };
  site: string;
}

const INK = rgb(0.07, 0.09, 0.15);
const MUTED = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.9, 0.91, 0.93);
const TEAL = rgb(2 / 255, 169 / 255, 161 / 255);
const DARK = rgb(5 / 255, 5 / 255, 7 / 255);
const GOOD = rgb(0.09, 0.6, 0.35);

/** Keeps only characters the standard PDF fonts can draw. */
export function pdfSafe(s: string | undefined | null): string {
  return (s ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/₹/g, "Rs.")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

export const money = (n: number) => `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })
    : "-";

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = pdfSafe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ["-"];
}

export async function renderInvoicePdf(d: InvoiceData, logoPng?: Uint8Array): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Invoice ${d.number}`);
  pdf.setAuthor(pdfSafe(d.business.name));
  pdf.setCreator("Toss");
  const page: PDFPage = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = page.getWidth();
  const M = 44;

  const text = (s: string, x: number, y: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
    const size = o.size ?? 10;
    const f = o.f ?? font;
    const t = pdfSafe(s);
    const dx = o.right ? f.widthOfTextAtSize(t, size) : 0;
    page.drawText(t, { x: x - dx, y, size, font: f, color: o.color ?? INK });
  };

  // ---- header band ----
  page.drawRectangle({ x: 0, y: 842 - 110, width: W, height: 110, color: DARK });
  page.drawRectangle({ x: 0, y: 842 - 113, width: W, height: 3, color: TEAL });
  let logoDrawn = false;
  if (logoPng) {
    try {
      const img = await pdf.embedPng(logoPng);
      const h = 44;
      page.drawImage(img, { x: M, y: 842 - 78, width: (img.width / img.height) * h, height: h });
      logoDrawn = true;
    } catch {
      logoDrawn = false;
    }
  }
  if (!logoDrawn) text("TOSS", M, 842 - 70, { size: 30, f: bold, color: rgb(1, 1, 1) });
  text("INVOICE", W - M, 842 - 52, { size: 22, f: bold, color: rgb(1, 1, 1), right: true });
  text(d.number, W - M, 842 - 70, { size: 10, color: rgb(0.8, 0.82, 0.85), right: true });
  text(`Issued ${when(d.issuedAt)}`, W - M, 842 - 84, { size: 9, color: rgb(0.65, 0.67, 0.7), right: true });

  // PAID stamp
  const stampW = 58;
  page.drawRectangle({ x: W - M - stampW, y: 842 - 104, width: stampW, height: 14, color: GOOD });
  text("PAID", W - M - stampW / 2 + bold.widthOfTextAtSize("PAID", 9) / 2, 842 - 100, { size: 9, f: bold, color: rgb(1, 1, 1), right: true });

  // ---- billed by / billed to ----
  let y = 842 - 150;
  const colW = (W - 2 * M - 24) / 2;
  const block = (x: number, title: string, lines: (string | undefined)[]) => {
    let yy = y;
    text(title.toUpperCase(), x, yy, { size: 8, f: bold, color: MUTED });
    yy -= 16;
    lines.forEach((l, i) => {
      if (!l) return;
      for (const part of wrap(l, i === 0 ? bold : font, i === 0 ? 12 : 9.5, colW)) {
        text(part, x, yy, { size: i === 0 ? 12 : 9.5, f: i === 0 ? bold : font, color: i === 0 ? INK : MUTED });
        yy -= i === 0 ? 16 : 13;
      }
    });
    return yy;
  };
  const yBy = block(M, "Billed by", [
    d.business.name,
    `Business ID ${d.business.joinCode}`,
    d.business.storeAddress,
    d.business.upiId ? `UPI ${d.business.upiId}` : undefined,
    d.business.managerEmail ? `Manager: ${d.business.managerEmail}` : undefined,
  ]);
  const yTo = block(M + colW + 24, "Billed to", [
    d.customer.name || "Customer",
    `Customer ID ${d.customer.code}`,
    d.customer.email,
    d.customer.phone,
    `Pickup: ${d.order.address || "-"}`,
  ]);
  y = Math.min(yBy, yTo) - 14;

  // ---- order details ----
  const rule = (yy: number) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: 0.8, color: LINE });
  rule(y);
  y -= 20;
  text("ORDER DETAILS", M, y, { size: 8, f: bold, color: MUTED });
  y -= 18;
  const facts: [string, string][] = [
    ["Order", d.order.label],
    ["Placed", when(d.order.placedAt)],
    ["Driver assigned", when(d.order.acceptedAt)],
    ["Picked up", when(d.order.completedAt)],
    ["Delivery agent", d.driver?.name ?? "-"],
  ];
  const half = Math.ceil(facts.length / 2);
  facts.forEach(([k, v], i) => {
    const x = i < half ? M : M + colW + 24;
    const yy = y - (i % half) * 16;
    text(k, x, yy, { size: 9.5, color: MUTED });
    text(v, x + 92, yy, { size: 9.5 });
  });
  y -= half * 16 + 10;

  // ---- line items ----
  rule(y);
  y -= 18;
  const cols = { desc: M, qty: W - M - 220, rate: W - M - 110, amt: W - M };
  text("DESCRIPTION", cols.desc, y, { size: 8, f: bold, color: MUTED });
  text("QTY", cols.qty, y, { size: 8, f: bold, color: MUTED, right: true });
  text("RATE", cols.rate, y, { size: 8, f: bold, color: MUTED, right: true });
  text("AMOUNT", cols.amt, y, { size: 8, f: bold, color: MUTED, right: true });
  y -= 8;
  rule(y);
  y -= 18;
  const rate = d.order.weightKg > 0 ? d.order.subtotal / d.order.weightKg : 0;
  text("Laundry pickup & wash (by weight)", cols.desc, y, { size: 10 });
  text(`${d.order.weightKg.toFixed(2)} kg`, cols.qty, y, { size: 10, right: true });
  text(`${money(rate)}/kg`, cols.rate, y, { size: 10, right: true });
  text(money(d.order.subtotal), cols.amt, y, { size: 10, right: true });
  if (d.order.bags) {
    y -= 13;
    text(pdfSafe(d.order.bags), cols.desc, y, { size: 8.5, color: MUTED });
  }
  y -= 22;
  rule(y);
  y -= 18;

  const totalRow = (label: string, value: string, o: { strong?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    text(label, cols.rate, y, { size: o.strong ? 12 : 10, f: o.strong ? bold : font, color: o.color ?? (o.strong ? INK : MUTED), right: true });
    text(value, cols.amt, y, { size: o.strong ? 12 : 10, f: o.strong ? bold : font, color: o.color ?? INK, right: true });
    y -= o.strong ? 22 : 17;
  };
  totalRow("Subtotal", money(d.order.subtotal));
  const credit = d.order.basketCredit ?? 0;
  if (d.order.discountPct) totalRow(`Discount (${d.order.discountPct}%)`, `- ${money(d.order.subtotal - d.order.total - credit)}`, { color: GOOD });
  if (credit > 0) totalRow("Toss basket credit", `- ${money(credit)}`, { color: GOOD });
  y -= 8;
  page.drawRectangle({ x: cols.rate - 120, y: y - 8, width: cols.amt - cols.rate + 128, height: 26, color: rgb(0.95, 0.98, 0.97) });
  totalRow("Total paid", money(d.order.total), { strong: true });

  // ---- payment ----
  y -= 6;
  rule(y);
  y -= 20;
  text("PAYMENT", M, y, { size: 8, f: bold, color: MUTED });
  y -= 18;
  const pay: [string, string][] = [
    ["Method", d.payment.method],
    ...(d.payment.ref ? ([["Reference", d.payment.ref]] as [string, string][]) : []),
    ["Paid on", when(d.payment.paidAt)],
  ];
  for (const [k, v] of pay) {
    text(k, M, y, { size: 9.5, color: MUTED });
    text(v, M + 92, y, { size: 9.5 });
    y -= 15;
  }

  // ---- footer ----
  page.drawLine({ start: { x: M, y: 70 }, end: { x: W - M, y: 70 }, thickness: 0.8, color: LINE });
  text(`Thank you for choosing ${d.business.name}!`, M, 52, { size: 10, f: bold });
  text(`Questions about this invoice? Contact ${d.business.managerEmail ?? d.business.name}.`, M, 38, { size: 8.5, color: MUTED });
  text(`Generated by Toss · ${d.site.replace(/^https?:\/\//, "")}`, W - M, 38, { size: 8.5, color: MUTED, right: true });

  return pdf.save();
}
