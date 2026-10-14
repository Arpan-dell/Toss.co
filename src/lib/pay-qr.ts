import "server-only";
import { payOptions, type PayOption } from "./pay-methods";
import { qrSvg } from "./qr";
import { countryOf } from "./regions";
import type { Tenant } from "./types";

/** Draws each option's QR code (EPC, Pix) on the server, so payment details never go to a QR service. */
export function withQr(opts: PayOption[]): Promise<PayOption[]> {
  return Promise.all(opts.map(async (o) => (o.qrText ? { ...o, qrSvg: await qrSvg(o.qrText), qrText: undefined } : o)));
}

/** How a customer can pay this business this amount, outside UPI. */
export function businessPayOptions(t: Tenant, p: { amount: number; note: string; reference: string }): Promise<PayOption[]> {
  return withQr(payOptions(t.payMethods, countryOf(t.country).methods, { ...p, currency: t.currency, payee: t.upiName ?? t.name }));
}
