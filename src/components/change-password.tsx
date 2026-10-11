import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { Card } from "@/components/ui";
import { changePassword } from "@/lib/actions/account";
import { BUSINESS } from "@/lib/business";
import { SITE_URL } from "@/lib/site";
import { NewPasswordInput } from "@/components/password-checklist";

// "Password" card for every role's settings page: current password, then the new one twice.
export function ChangePasswordCard({ email }: { email?: string }) {
  return (
    <Card title="Password">
      <ActionForm action={changePassword} submitLabel="Change password" className="max-w-md space-y-3">
        {/* Lets password managers save the new password against the right account. */}
        <input type="email" name="username" autoComplete="username" value={email ?? ""} readOnly hidden />
        <Field label="Current password">
          <input name="current" type="password" autoComplete="current-password" required className={fieldClass} />
        </Field>
        <Field label="New password">
          <NewPasswordInput name="next" className={fieldClass} />
        </Field>
        <Field label="Confirm new password">
          <input name="confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={72} className={fieldClass} />
        </Field>
      </ActionForm>
    </Card>
  );
}

// "Your data" card next to the password: a copy, a correction, or deletion (the right to erasure).
export function YourDataCard() {
  return (
    <Card title="Your data">
      <p className="text-sm text-secondary">
        Want a copy of your data, or something corrected? Email{" "}
        <a href={`mailto:${BUSINESS.email}?subject=Privacy%20request`} className="text-accent underline-offset-4 hover:underline">
          {BUSINESS.email}
        </a>
        . To close your account and delete your personal data, send a deletion request; we confirm within 30 days.
      </p>
      <a href={`${SITE_URL}/data-deletion`} className="btn-ghost mt-4 inline-flex rounded-full px-5 py-2.5 text-sm font-medium text-critical">
        Delete my account and data
      </a>
    </Card>
  );
}
