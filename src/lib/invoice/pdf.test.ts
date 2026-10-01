import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { money, pdfSafe, renderInvoicePdf, type InvoiceData } from "./pdf";

const DATA: InvoiceData = {
  number: "TOSS-2026-000042",
  issuedAt: "2026-10-01T10:00:00Z",
  business: { name: "Fresh Laundry", joinCode: "B-E2ZRFP", storeAddress: "Shop 4, Lajpat Nagar Market, New Delhi", upiId: "fresh@sbi", managerEmail: "manager@fresh.in" },
  customer: { name: "Riya Sharma", code: "C-7K2Q9M", email: "riya@example.com", phone: "+91 98765 43210" },
  order: {
    label: "Saket – Riya · #104",
    placedAt: "2026-09-30T08:00:00Z",
    acceptedAt: "2026-09-30T08:10:00Z",
    completedAt: "2026-09-30T09:00:00Z",
    address: "B-12, Saket, New Delhi 110017, a long address that has to wrap onto another line in the PDF",
    weightKg: 4.2,
    subtotal: 420,
    discountPct: 20,
    total: 336,
  },
  driver: { name: "Vikram" },
  payment: { method: "UPI", ref: "412345678901", paidAt: "2026-10-01T09:58:00Z" },
  site: "https://toss-code-x-a24a.vercel.app",
};

describe("invoice PDF", () => {
  it("renders a valid one-page A4 PDF with the invoice metadata", async () => {
    const bytes = await renderInvoicePdf(DATA);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(Math.round(doc.getPage(0).getWidth())).toBe(595);
    expect(doc.getTitle()).toBe("Invoice TOSS-2026-000042");
    expect(doc.getAuthor()).toBe("Fresh Laundry");
  });

  it("works without optional details (no driver, discount, reference or logo)", async () => {
    const bytes = await renderInvoicePdf({
      ...DATA,
      driver: undefined,
      business: { name: "X", joinCode: "B-AAAAAA" },
      customer: { code: "C-AAAAAA" },
      order: { ...DATA.order, discountPct: undefined, total: 420, acceptedAt: undefined, completedAt: undefined },
      payment: { method: "CASH" },
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("doesn't crash on names the built-in fonts can't draw", async () => {
    const bytes = await renderInvoicePdf({ ...DATA, customer: { ...DATA.customer, name: "रिया 🧺 Sharma" } });
    expect(bytes.length).toBeGreaterThan(1000);
    expect(pdfSafe("रिया 🧺 Sharma – ₹50")).toBe("???? ?? Sharma - Rs.50");
  });

  it("formats money in Indian style", () => {
    expect(money(123456.5)).toBe("Rs. 1,23,456.50");
  });
});
