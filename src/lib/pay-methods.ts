// Ways to pay a business outside UPI, and what each needs on the payment screen: a link that opens the payer's app
// with the amount filled in (PayPal, Venmo), a QR code their banking app reads (SEPA's EPC code, Brazil's Pix), or
// details to copy (Zelle, bank transfer). Like UPI, money goes straight to the business; the payer then types the
// payment's reference and the business confirms it. Pure functions: the server turns these into QR codes.

import type { PayMethods } from "./types";
import type { PayMethodId } from "./regions";

/** What the database records as the payment method (orders.payment_method). */
export const DB_METHOD: Record<PayMethodId, string> = {
  upi: "UPI",
  paypal: "PAYPAL",
  venmo: "VENMO",
  cashapp: "CASHAPP",
  zelle: "ZELLE",
  interac: "INTERAC",
  sepa: "SEPA",
  bank: "BANK",
  pix: "PIX",
  paynow: "PAYNOW",
  mpesa: "MPESA",
  gcash: "GCASH",
  link: "LINK",
  cash: "CASH",
};

export const METHOD_LABEL: Record<PayMethodId, string> = {
  upi: "UPI",
  paypal: "PayPal",
  venmo: "Venmo",
  cashapp: "Cash App",
  zelle: "Zelle",
  interac: "Interac e-Transfer",
  sepa: "Bank transfer (SEPA)",
  bank: "Bank transfer",
  pix: "Pix",
  paynow: "PayNow",
  mpesa: "M-Pesa",
  gcash: "GCash",
  link: "Pay online",
  cash: "Cash",
};

/** Label for a stored payment method (orders.payment_method), e.g. "PAYPAL" → "PayPal". */
export function methodName(db: string | undefined | null): string {
  const id = (Object.keys(DB_METHOD) as PayMethodId[]).find((k) => DB_METHOD[k] === db);
  return id ? METHOD_LABEL[id] : db === "OTHER" ? "Other" : (db ?? "");
}

/** What the payer is asked to type after paying, per method. */
export const REF_HINT: Record<PayMethodId, { label: string; placeholder: string }> = {
  upi: { label: "UPI reference / UTR (12 digits)", placeholder: "412356789012" },
  paypal: { label: "PayPal transaction ID (in your PayPal receipt)", placeholder: "8AB12345CD678901E" },
  venmo: { label: "Venmo payment ID (tap the payment in Venmo)", placeholder: "3912345678901234567" },
  cashapp: { label: "Cash App payment ID (in the payment's details)", placeholder: "D1ABC2DEF" },
  zelle: { label: "Zelle confirmation number", placeholder: "AB12CD34EF" },
  interac: { label: "Interac reference number", placeholder: "CA1AbCdEfGh" },
  sepa: { label: "The reference you used, or your name as it shows on the transfer", placeholder: "Toss 104 or Anna Schmidt" },
  bank: { label: "The reference you used, or your name as it shows on the transfer", placeholder: "Toss 104 or Sam Jones" },
  pix: { label: "Pix ID (E2E) from your bank app", placeholder: "E12345678202610151234ABCDEFGHIJK" },
  paynow: { label: "PayNow transaction reference", placeholder: "PN1234567890" },
  mpesa: { label: "M-Pesa code (in the confirmation SMS)", placeholder: "QFT1ABC2DE" },
  gcash: { label: "GCash reference number", placeholder: "1234567890123" },
  link: { label: "Receipt or payment number", placeholder: "pi_3AbCd or 1234-5678" },
  cash: { label: "", placeholder: "" },
};

// ---------- validation (what a business types in Settings) ----------
export const isUsername = (v: string) => /^[A-Za-z0-9._-]{2,40}$/.test(v);

/** IBAN with its mod-97 check, so a typo doesn't send customers' money nowhere. */
export function isValidIban(raw: string): boolean {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  const digits = moved.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const d of digits) rem = (rem * 10 + Number(d)) % 97;
  return rem === 1;
}
export const formatIban = (raw: string) => raw.replace(/\s+/g, "").toUpperCase().replace(/(.{4})/g, "$1 ").trim();
export const isBic = (v: string) => /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v.replace(/\s+/g, "").toUpperCase());

// ---------- links ----------
const amountStr = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** paypal.me/name/26.27USD opens PayPal with the amount and currency filled in (the payer can still change it). */
export const paypalLink = (user: string, amount: number, currency: string) =>
  `https://paypal.me/${encodeURIComponent(user)}/${amountStr(amount)}${currency.toUpperCase()}`;

/** venmo.com/name?txn=pay&amount=…&note=… opens Venmo's pay screen pre-filled (US dollars only). */
export const venmoLink = (user: string, amount: number, note: string) =>
  `https://venmo.com/${encodeURIComponent(user)}?txn=pay&amount=${amountStr(amount)}&note=${encodeURIComponent(note).replace(/%20/g, "+")}`;

/** cash.app/$tag opens the business's Cash App page; the amount is typed there. */
export const cashAppLink = (tag: string) => `https://cash.app/$${encodeURIComponent(tag.replace(/^\$/, ""))}`;

// ---------- QR payloads ----------
/**
 * EPC QR code ("GiroCode"): every euro-area banking app scans it into a SEPA transfer with the name, IBAN, amount
 * and reference filled in. Format from EPC069-12 v3.0: version 002 (EEA, BIC optional), UTF-8.
 */
export function epcPayload(p: { name: string; iban: string; bic?: string; amount: number; text: string }): string {
  return [
    "BCD",
    "002",
    "1",
    "SCT",
    (p.bic ?? "").replace(/\s+/g, "").toUpperCase(),
    p.name.slice(0, 70),
    p.iban.replace(/\s+/g, "").toUpperCase(),
    `EUR${p.amount.toFixed(2)}`,
    "", // purpose code
    "", // structured reference (we use the free-text one below)
    p.text.slice(0, 140),
  ].join("\n");
}

// CRC16-CCITT (poly 0x1021, start 0xFFFF), as EMV QR codes (Pix, PayNow, PromptPay…) require.
export function crc16(s: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(s)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
const emv = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;
// EMV fields are plain ASCII: drop accents ("São Paulo" → "Sao Paulo") and anything else unusual
const ascii = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "");

/** Pix "copia e cola" / BR Code (Banco Central do Brasil): a static QR with the key, amount and a reference. */
export function pixPayload(p: { key: string; name: string; city: string; amount: number; txid: string }): string {
  const account = emv("00", "br.gov.bcb.pix") + emv("01", p.key.trim());
  const txid = p.txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const body =
    emv("00", "01") +
    emv("26", account) +
    emv("52", "0000") +
    emv("53", "986") +
    emv("54", p.amount.toFixed(2)) +
    emv("58", "BR") +
    emv("59", ascii(p.name).slice(0, 25)) +
    emv("60", ascii(p.city).slice(0, 15)) +
    emv("62", emv("05", txid)) +
    "6304";
  return body + crc16(body);
}

// ---------- what the payment screen shows ----------
export interface PayOption {
  id: PayMethodId;
  method: string; // DB value sent back with the reference
  label: string;
  href?: string; // opens the payer's app or the payment page
  hrefLabel?: string;
  qrText?: string; // turned into a QR code on the server
  qrSvg?: string;
  copyText?: string; // e.g. Pix "copia e cola"
  details?: [string, string][]; // label, value (each with a copy button)
  note?: string;
  refLabel: string;
  refPlaceholder: string;
}

/**
 * The ways a business's customer can pay this amount, in the business's order of preference. UPI is handled by
 * the UPI screen (components/upi-pay.tsx) and isn't included here. Cash comes last unless the business turned it off.
 */
export function payOptions(
  methods: PayMethods,
  order: PayMethodId[],
  p: { amount: number; currency: string; payee: string; note: string; reference: string },
): PayOption[] {
  const base = (id: PayMethodId): Pick<PayOption, "id" | "method" | "label" | "refLabel" | "refPlaceholder"> => ({
    id,
    method: DB_METHOD[id],
    label: METHOD_LABEL[id],
    refLabel: REF_HINT[id].label,
    refPlaceholder: REF_HINT[id].placeholder,
  });
  const out: PayOption[] = [];
  const add = (id: PayMethodId) => {
    if (out.some((o) => o.id === id)) return;
    switch (id) {
      case "paypal":
        if (methods.paypal) out.push({ ...base(id), href: paypalLink(methods.paypal, p.amount, p.currency), hrefLabel: "Open PayPal", details: [["PayPal", `paypal.me/${methods.paypal}`]] });
        break;
      case "venmo":
        if (methods.venmo && p.currency === "USD") out.push({ ...base(id), href: venmoLink(methods.venmo, p.amount, p.note), hrefLabel: "Open Venmo", details: [["Venmo", `@${methods.venmo}`]] });
        break;
      case "cashapp":
        if (methods.cashapp) out.push({ ...base(id), href: cashAppLink(methods.cashapp), hrefLabel: "Open Cash App", details: [["Cash App", `$${methods.cashapp.replace(/^\$/, "")}`]], note: "Enter the amount in Cash App." });
        break;
      case "zelle":
        if (methods.zelle) out.push({ ...base(id), details: [["Send with Zelle to", methods.zelle], ["Memo", p.reference]], note: "Open your bank's app, choose Zelle, and send to this email or phone." });
        break;
      case "interac":
        if (methods.interac) out.push({ ...base(id), details: [["Send an Interac e-Transfer to", methods.interac], ["Message", p.reference]], note: "From your bank's app or website." });
        break;
      case "sepa": {
        const s = methods.sepa;
        if (s && isValidIban(s.iban)) {
          const euro = p.currency === "EUR";
          out.push({
            ...base(id),
            qrText: euro ? epcPayload({ name: s.name, iban: s.iban, bic: s.bic, amount: p.amount, text: p.reference }) : undefined,
            details: [["Name", s.name], ["IBAN", formatIban(s.iban)], ...(s.bic ? ([["BIC", s.bic]] as [string, string][]) : []), ["Reference", p.reference]],
            note: euro ? "Scan the code with your banking app: name, IBAN, amount and reference fill in by themselves." : "Use these details in your banking app.",
          });
        }
        break;
      }
      case "bank": {
        const b = methods.bank;
        if (b?.account) {
          out.push({
            ...base(id),
            details: [["Name", b.name], ["Account", b.account], ...(b.code ? ([[b.codeLabel || "Bank code", b.code]] as [string, string][]) : []), ["Reference", p.reference]],
            note: "Use these details in your banking app, with the reference so the laundry can match your payment.",
          });
        }
        break;
      }
      case "pix": {
        const x = methods.pix;
        if (x?.key && p.currency === "BRL") {
          const code = pixPayload({ key: x.key, name: x.name || p.payee, city: x.city || "BRASIL", amount: p.amount, txid: p.reference });
          out.push({ ...base(id), qrText: code, copyText: code, details: [["Chave Pix", x.key]], note: "Scan with your bank app, or copy the Pix code (copia e cola)." });
        }
        break;
      }
      case "paynow":
        if (methods.paynow) out.push({ ...base(id), details: [["PayNow to", methods.paynow], ["Reference", p.reference]], note: "Open your bank app, choose PayNow, and pay to this UEN or mobile number." });
        break;
      case "mpesa": {
        const m = methods.mpesa;
        if (m?.till) out.push({ ...base(id), details: [[m.account ? "Paybill" : "Till number", m.till], ...(m.account ? ([["Account", m.account]] as [string, string][]) : [])], note: "M-Pesa → Lipa na M-Pesa, then enter these numbers." });
        break;
      }
      case "gcash":
        if (methods.gcash) out.push({ ...base(id), details: [["Send with GCash to", methods.gcash], ["Message", p.reference]] });
        break;
      case "link":
        if (methods.link?.url) out.push({ ...base(id), label: methods.link.label || METHOD_LABEL.link, href: methods.link.url, hrefLabel: "Open payment page", note: "Pay the amount shown above on the laundry's payment page." });
        break;
    }
  };
  for (const id of order) if (id !== "cash" && id !== "upi") add(id);
  // anything the business set up that isn't in the country's usual list
  for (const id of Object.keys(methods) as PayMethodId[]) if (id !== "cash" && id !== "upi") add(id);
  if (methods.cash !== false) out.push({ ...base("cash"), note: "Pay your driver or at the store. The laundry marks it paid; nothing to type here." });
  return out;
}
