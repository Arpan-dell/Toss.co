"use client";

import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { registerBusiness } from "@/lib/actions/customer";

export function RegisterBusinessForm() {
  return (
    <ActionForm action={registerBusiness} submitLabel="Create my business →">
      <Field label="Business name">
        <input name="name" required minLength={2} maxLength={80} placeholder="Fresh Fold Laundry" className={fieldClass} />
      </Field>
      <Field label="Price per kg (₹)">
        <input name="price" type="number" required min={1} max={10000} step="1" defaultValue={80} className={fieldClass} />
      </Field>
      <Field label="UPI ID for customer payments" hint="Customers' payments go straight to this UPI ID. You can change it anytime.">
        <input name="upiId" required autoComplete="off" placeholder="yourshop@okaxis" className={`${fieldClass} font-mono`} />
      </Field>
      <Field label="Name shown in UPI apps (optional)">
        <input name="upiName" maxLength={50} placeholder="Same as business name" className={fieldClass} />
      </Field>
    </ActionForm>
  );
}
