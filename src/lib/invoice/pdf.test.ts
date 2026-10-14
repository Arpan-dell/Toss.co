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
  site: "https://tosslaundry.online",
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

describe("invoices outside India", () => {
  it("writes each currency with a symbol the PDF font has, or its code", async () => {
    const { moneyIn } = await import("./pdf");
    expect(moneyIn(26.27, "USD")).toBe("$26.27");
    expect(moneyIn(26.27, "EUR")).toBe("EUR 26.27");
    expect(moneyIn(1234.5, "GBP")).toBe("£1,234.50");
    expect(moneyIn(123456.5, "INR")).toBe("Rs. 1,23,456.50");
  });
});

describe("a US invoice", () => {
  it("renders in dollars and pounds weight, with tax and a tip", async () => {
    const { renderInvoicePdf } = await import("./pdf");
    const bytes = await renderInvoicePdf({
      number: "TOSS-2026-000200",
      issuedAt: "2026-10-15T15:00:00Z",
      business: { name: "Fresh Fold NYC", joinCode: "B-NYC123", taxId: "12-3456789", taxLabel: "Sales tax" },
      region: { currency: "USD", unit: "lb", timezone: "America/New_York" },
      tax: { label: "Sales tax", pct: 8.875 },
      customer: { code: "C-ABC123", name: "Sam" },
      order: { label: "#200", placedAt: "2026-10-15T13:00:00Z", address: "1 Main St", weightKg: 6, subtotal: 26.32, total: 26.32, tip: 4 },
      payment: { method: "Venmo", ref: "3912345678901234567", paidAt: "2026-10-15T15:00:00Z" },
      site: "https://tosslaundry.online",
    });
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
