import { Field, fieldClass } from "./action-form";

// The account password, asked again before an important change (UPI ID, price, closing the business).
export function PasswordField({ hint = "Needed to change these settings. Nothing changes if it's wrong." }: { hint?: string }) {
  return (
    <div className="rounded-[10px] border border-warn/30 bg-warn-bg/40 p-3">
      <Field label="🔒 Your password" hint={hint}>
        <input name="password" type="password" autoComplete="current-password" required className={fieldClass} />
      </Field>
    </div>
  );
}
