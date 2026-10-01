// Mobile numbers in E.164 (e.g. +919876543210), the customer's identity on Toss.
// Indian numbers are accepted the ways people type them: 98765 43210, 098765-43210, +91 98765 43210.

export function normalizePhone(input: string, defaultCountry = "91"): string | null {
  const raw = input.trim();
  if (!raw) return null;
  let digits = raw.replace(/[^\d]/g, "");
  if (raw.startsWith("+")) return isE164(`+${digits}`) ? `+${digits}` : null;
  if (raw.startsWith("00")) return isE164(`+${digits.slice(2)}`) ? `+${digits.slice(2)}` : null;
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1); // trunk prefix
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+${defaultCountry}${digits}`; // Indian mobile
  if (digits.length === 12 && digits.startsWith(defaultCountry) && /^[6-9]/.test(digits.slice(2))) return `+${digits}`;
  return null;
}

export function isE164(v: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(v);
}

// +919876543210 → +91 98765 43210 (for display)
export function formatPhone(e164: string | undefined | null): string {
  if (!e164) return "";
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}
