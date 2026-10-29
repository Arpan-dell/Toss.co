"use client";

import { useState } from "react";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { PasswordField } from "@/components/password-field";
import { updatePayments } from "@/lib/actions/manager";
import { METHOD_LABEL } from "@/lib/pay-methods";
import { COMMON_TIMEZONES, COUNTRIES, CURRENCIES, countryOf, type PayMethodId, type WeightUnit } from "@/lib/regions";
import type { PayMethods } from "@/lib/types";

import { Tr } from "@/components/locale";
export type PaymentsFormValues = {
  country: string;
  currency: string;
  timezone: string;
  unit: WeightUnit;
  price: number; // per unit
  minOrder: number;
  taxLabel: string;
  taxPct: number;
  taxId: string;
  upiId: string;
  upiName: string;
  name: string;
  methods: PayMethods;
  regionReady: boolean; // migration 0035 applied
};

// Every way to pay we support outside UPI, and the fields each needs.
const ALL: PayMethodId[] = ["paypal", "venmo", "cashapp", "zelle", "interac", "sepa", "bank", "pix", "paynow", "mpesa", "gcash", "link"];

// Settings → Price & payments. The country decides which payment methods show first; the rest are under "More ways
// to get paid". Saving needs the account password, because these decide where customers' money goes.
export function PaymentsForm({ v }: { v: PaymentsFormValues }) {
  const [country, setCountry] = useState(v.country);
  const [currency, setCurrency] = useState(v.currency);
  const [unit, setUnit] = useState<WeightUnit>(v.unit);
  const c = countryOf(country);
  const india = c.code === "IN";
  const usual = c.methods.filter((m) => m !== "cash" && m !== "upi");
  const others = ALL.filter((x) => !(usual as PayMethodId[]).includes(x));
  const m = v.methods;
  const zones = [...new Set([v.timezone, c.timezone, ...COMMON_TIMEZONES])];

  return (
    <ActionForm action={updatePayments} submitLabel="Save with password">
      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold text-fg"><Tr>{"Where you are"}</Tr></legend>
        {!v.regionReady && (
          <p className="rounded-[8px] border border-warn/30 bg-warn-bg px-3 py-2 text-xs text-warn">
            <Tr>{"Countries other than India switch on shortly. Until then, prices are in rupees."}</Tr>
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Country">
            <select
              name="country"
              value={country}
              disabled={!v.regionReady}
              onChange={(e) => {
                const next = countryOf(e.target.value);
                setCountry(e.target.value);
                setCurrency(next.currency);
                setUnit(next.unit);
              }}
              className={fieldClass}
            >
              {[...COUNTRIES]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((x) => (
                  <option key={x.code} value={x.code}>
                    {x.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Time zone" hint="Used for dates, reminders and reports.">
            <select name="timezone" defaultValue={v.timezone} key={country} disabled={!v.regionReady} className={fieldClass}>
              {zones.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </Field>
          <Field label="Currency" hint="Existing bills keep their amounts.">
            <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={!v.regionReady} className={fieldClass}>
              {[...new Set([currency, ...CURRENCIES])].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <fieldset>
            <legend className="mb-1.5 block text-sm text-secondary"><Tr>{"Weigh in"}</Tr></legend>
            <div className="flex gap-2">
              {(["kg", "lb"] as const).map((u) => (
                <label
                  key={u}
                  className={`flex-1 cursor-pointer rounded-[8px] border px-3 py-2.5 text-center text-sm ${unit === u ? "border-accent/60 bg-accent/10 text-fg" : "border-border text-secondary"}`}
                >
                  <input type="radio" name="unit" value={u} checked={unit === u} onChange={() => setUnit(u)} disabled={!v.regionReady} className="sr-only" />
                  {u}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </fieldset>

      <fieldset className="space-y-3 border-t border-border pt-4">
        <legend className="mb-1 text-sm font-semibold text-fg"><Tr>{"What customers pay"}</Tr></legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`Price per ${unit} (${currency})`} hint="Applies to new pickups. Existing bills keep their amount.">
            <input name="price" type="number" required min={0.01} max={10000} step="0.01" defaultValue={v.price} key={`${unit}`} className={fieldClass} />
          </Field>
          <Field label={`Minimum order (${currency})`} hint="Small pickups are billed at least this much. 0 = none.">
            <input name="minOrder" type="number" min={0} max={100000} step="0.01" defaultValue={v.minOrder || 0} disabled={!v.regionReady} className={fieldClass} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Tax name">
            <input name="taxLabel" maxLength={30} defaultValue={v.taxLabel} placeholder={c.tax} disabled={!v.regionReady} className={fieldClass} />
          </Field>
          <Field label="Tax included (%)" hint="Shown on invoices. 0 = not shown.">
            <input name="taxPct" type="number" min={0} max={50} step="0.01" defaultValue={v.taxPct || 0} disabled={!v.regionReady} className={fieldClass} />
          </Field>
          <Field label="Tax number (optional)">
            <input name="taxId" maxLength={40} defaultValue={v.taxId} placeholder={india ? "GSTIN" : c.code === "US" ? "EIN" : "VAT number"} disabled={!v.regionReady} className={fieldClass} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-3 border-t border-border pt-4">
        <legend className="mb-1 text-sm font-semibold text-fg"><Tr>{"How customers pay you"}</Tr></legend>
        <p className="text-xs text-muted"><Tr>{"Money goes straight to you. Toss never holds it and takes no fees."}</Tr></p>
        {(india || v.upiId) && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={india ? "UPI ID" : "UPI ID (optional)"} hint="Customers in India pay this by UPI.">
              <input name="upiId" required={india} autoComplete="off" defaultValue={v.upiId} placeholder="yourshop@okaxis" className={`${fieldClass} font-mono`} />
            </Field>
            <Field label="Name shown in UPI apps">
              <input name="upiName" maxLength={50} defaultValue={v.upiName} placeholder={v.name} className={fieldClass} />
            </Field>
          </div>
        )}
        {v.regionReady && (
          <>
            {usual.map((id) => (
              <MethodFields key={id} id={id} m={m} />
            ))}
            <details className="rounded-[8px] border border-border px-3 py-2" open={others.some((id) => has(m, id))}>
              <summary className="cursor-pointer text-sm text-secondary"><Tr>{"More ways to get paid"}</Tr></summary>
              <div className="mt-3 space-y-3">
                {others.map((id) => (
                  <MethodFields key={id} id={id} m={m} />
                ))}
              </div>
            </details>
            <label className="flex items-center gap-2.5 text-sm text-secondary">
              <input type="checkbox" name="cash" value="yes" defaultChecked={m.cash !== false} className="size-4 accent-[var(--accent)]" />
              Accept cash (customers pay the driver or at the store; you mark it paid)
            </label>
          </>
        )}
      </fieldset>
      <PasswordField />
    </ActionForm>
  );
}

const has = (m: PayMethods, id: PayMethodId) => Boolean((m as Record<string, unknown>)[id]);

function MethodFields({ id, m }: { id: PayMethodId; m: PayMethods }) {
  const label = METHOD_LABEL[id];
  switch (id) {
    case "paypal":
      return (
        <Field label="PayPal.me username" hint="From paypal.me/yourname. Customers get a link with the amount filled in.">
          <input name="paypal" defaultValue={m.paypal ?? ""} placeholder="freshlaundry" autoComplete="off" className={fieldClass} />
        </Field>
      );
    case "venmo":
      return (
        <Field label="Venmo username" hint="Without the @. Opens Venmo with the amount filled in (US dollars).">
          <input name="venmo" defaultValue={m.venmo ?? ""} placeholder="fresh-laundry" autoComplete="off" className={fieldClass} />
        </Field>
      );
    case "cashapp":
      return (
        <Field label="Cash App $Cashtag">
          <input name="cashapp" defaultValue={m.cashapp ?? ""} placeholder="$FreshLaundry" autoComplete="off" className={fieldClass} />
        </Field>
      );
    case "zelle":
      return (
        <Field label="Zelle email or phone">
          <input name="zelle" defaultValue={m.zelle ?? ""} placeholder="pay@freshlaundry.com" autoComplete="off" className={fieldClass} />
        </Field>
      );
    case "interac":
      return (
        <Field label="Interac e-Transfer email">
          <input name="interac" type="email" defaultValue={m.interac ?? ""} placeholder="pay@freshlaundry.ca" autoComplete="off" className={fieldClass} />
        </Field>
      );
    case "sepa":
      return (
        <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_0.8fr]">
          <Field label="SEPA: account holder">
            <input name="sepaName" defaultValue={m.sepa?.name ?? ""} placeholder="Waschsalon Mitte GmbH" className={fieldClass} />
          </Field>
          <Field label="IBAN" hint="Customers scan a QR code that fills in the transfer.">
            <input name="sepaIban" defaultValue={m.sepa?.iban ?? ""} placeholder="DE89 3704 0044 0532 0130 00" autoComplete="off" className={`${fieldClass} font-mono`} />
          </Field>
          <Field label="BIC (optional)">
            <input name="sepaBic" defaultValue={m.sepa?.bic ?? ""} placeholder="COBADEFFXXX" autoComplete="off" className={`${fieldClass} font-mono`} />
          </Field>
        </div>
      );
    case "bank":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bank transfer: account name">
            <input name="bankName" defaultValue={m.bank?.name ?? ""} placeholder="Fresh Laundry Ltd" className={fieldClass} />
          </Field>
          <Field label="Account number or IBAN">
            <input name="bankAccount" defaultValue={m.bank?.account ?? ""} placeholder="12345678" autoComplete="off" className={`${fieldClass} font-mono`} />
          </Field>
          <Field label="Name of the bank code (optional)" hint="Sort code, BSB, routing number, SWIFT…">
            <input name="bankCodeLabel" defaultValue={m.bank?.codeLabel ?? ""} placeholder="Sort code" className={fieldClass} />
          </Field>
          <Field label="Bank code (optional)">
            <input name="bankCode" defaultValue={m.bank?.code ?? ""} placeholder="20-00-00" autoComplete="off" className={`${fieldClass} font-mono`} />
          </Field>
        </div>
      );
    case "pix":
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Chave Pix" hint="Email, phone, CPF/CNPJ or random key.">
            <input name="pixKey" defaultValue={m.pix?.key ?? ""} placeholder="pix@lavanderia.com.br" autoComplete="off" className={fieldClass} />
          </Field>
          <Field label="Name (as in the bank)">
            <input name="pixName" maxLength={25} defaultValue={m.pix?.name ?? ""} placeholder="Lavanderia Sao Joao" className={fieldClass} />
          </Field>
          <Field label="City">
            <input name="pixCity" maxLength={15} defaultValue={m.pix?.city ?? ""} placeholder="Sao Paulo" className={fieldClass} />
          </Field>
        </div>
      );
    case "paynow":
      return (
        <Field label="PayNow UEN or mobile">
          <input name="paynow" defaultValue={m.paynow ?? ""} placeholder="201912345K or +6591234567" autoComplete="off" className={fieldClass} />
        </Field>
      );
    case "mpesa":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="M-Pesa till or paybill number">
            <input name="mpesaTill" inputMode="numeric" defaultValue={m.mpesa?.till ?? ""} placeholder="123456" className={fieldClass} />
          </Field>
          <Field label="Paybill account (leave empty for a till)">
            <input name="mpesaAccount" defaultValue={m.mpesa?.account ?? ""} placeholder="FRESH" className={fieldClass} />
          </Field>
        </div>
      );
    case "gcash":
      return (
        <Field label="GCash mobile number">
          <input name="gcash" inputMode="tel" defaultValue={m.gcash ?? ""} placeholder="0917 123 4567" className={fieldClass} />
        </Field>
      );
    case "link":
      return (
        <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr]">
          <Field label="Payment link (Stripe, Square, SumUp, Wise…)" hint="A page where customers pay by card. They type the amount there.">
            <input name="linkUrl" type="url" defaultValue={m.link?.url ?? ""} placeholder="https://buy.stripe.com/…" className={fieldClass} />
          </Field>
          <Field label="Button name (optional)">
            <input name="linkLabel" maxLength={30} defaultValue={m.link?.label ?? ""} placeholder="Pay by card" className={fieldClass} />
          </Field>
        </div>
      );
    default:
      return <p className="text-sm text-muted">{label}</p>;
  }
}
