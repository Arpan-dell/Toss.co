// UPI deep links (NPCI "upi://pay" spec). Opening one launches the payer's UPI app
// (GPay, PhonePe, Paytm, BHIM…) with the payee and amount pre-filled; money goes straight to
// the payee's bank. Toss never touches the money and charges no fees.

// handle@bank, e.g. laundry.delhi@okaxis or 9876543210@ybl
const UPI_ID = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;

export function isValidUpiId(v: string | undefined | null): v is string {
  return !!v && UPI_ID.test(v.trim());
}

export function normalizeUpiId(v: string): string {
  return v.trim().toLowerCase();
}

export interface UpiPayment {
  payeeUpiId: string;
  payeeName: string;
  amount: number; // rupees
  note: string; // shown to the payer, e.g. "Toss pickup 4F2A-#104"
  reference?: string; // our reference, echoed back by some apps
}

export function buildUpiUri(p: UpiPayment): string {
  if (!isValidUpiId(p.payeeUpiId)) throw new Error("Invalid UPI ID");
  if (!(p.amount > 0)) throw new Error("Amount must be positive");
  const params = new URLSearchParams({
    pa: normalizeUpiId(p.payeeUpiId),
    pn: p.payeeName.slice(0, 50),
    am: p.amount.toFixed(2),
    cu: "INR",
    tn: p.note.slice(0, 80),
  });
  if (p.reference) params.set("tr", p.reference.replace(/[^A-Za-z0-9]/g, "").slice(0, 35));
  // URLSearchParams encodes spaces as "+", which several UPI apps show literally; use %20.
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}

// UTR / UPI transaction reference the payer types in after paying (usually 12 digits).
export function normalizePaymentRef(v: string): string | null {
  const ref = v.replace(/\s/g, "").toUpperCase();
  return /^[A-Z0-9]{6,35}$/.test(ref) ? ref : null;
}
