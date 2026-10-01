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

// ---------- open a specific UPI app ----------
// A bare upi:// link opens whatever app the phone picked as default (often WhatsApp). These links
// target one app each, pre-filled with payee + amount, so the payer just confirms and pays.
//  - Android: an intent:// URL naming the app's package. Chrome opens that exact app, or its Play
//    Store page if it isn't installed.
//  - iOS: the app's own URL scheme (no package targeting on iOS).

export type UpiPlatform = "android" | "ios" | "desktop";

export interface UpiApp {
  id: string;
  name: string;
  color: string; // brand-ish swatch for the button
  android?: string; // package name
  ios?: string; // scheme + path prefix, query appended
}

export const UPI_APPS: UpiApp[] = [
  { id: "gpay", name: "Google Pay", color: "#1a73e8", android: "com.google.android.apps.nbu.paisa.user", ios: "gpay://upi/pay" },
  { id: "phonepe", name: "PhonePe", color: "#5f259f", android: "com.phonepe.app", ios: "phonepe://pay" },
  { id: "paytm", name: "Paytm", color: "#00baf2", android: "net.one97.paytm", ios: "paytmmp://pay" },
  { id: "bhim", name: "BHIM", color: "#f47920", android: "in.org.npci.upiapp" },
  { id: "amazonpay", name: "Amazon Pay", color: "#ff9900", android: "in.amazon.mShop.android.shopping" },
  { id: "cred", name: "CRED", color: "#2b2b2b", android: "com.dreamplug.androidapp", ios: "credpay://upi/pay" },
  { id: "whatsapp", name: "WhatsApp", color: "#25d366", android: "com.whatsapp" },
];

export function detectUpiPlatform(userAgent: string): UpiPlatform {
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  return "desktop";
}

/** Per-app links for this platform. The last entry ("Other UPI app") is the generic upi:// link. */
export function upiAppLinks(upiUri: string, platform: UpiPlatform): { id: string; name: string; color: string; href: string }[] {
  if (platform === "desktop") return [];
  const query = upiUri.slice(upiUri.indexOf("?") + 1);
  const apps = UPI_APPS.flatMap((app) => {
    if (platform === "android" && app.android) {
      return [{ id: app.id, name: app.name, color: app.color, href: `intent://pay?${query}#Intent;scheme=upi;package=${app.android};end` }];
    }
    if (platform === "ios" && app.ios) {
      return [{ id: app.id, name: app.name, color: app.color, href: `${app.ios}?${query}` }];
    }
    return [];
  });
  return [...apps, { id: "other", name: "Other UPI app", color: "#6b7280", href: upiUri }];
}

// UTR / UPI transaction reference the payer types in after paying (usually 12 digits).
export function normalizePaymentRef(v: string): string | null {
  const ref = v.replace(/\s/g, "").toUpperCase();
  return /^[A-Z0-9]{6,35}$/.test(ref) ? ref : null;
}
