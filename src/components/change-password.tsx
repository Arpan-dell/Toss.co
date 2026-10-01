import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { Card } from "@/components/ui";
import { changePassword } from "@/lib/actions/account";

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
        <Field label="New password" hint="At least 8 characters.">
          <input name="next" type="password" autoComplete="new-password" required minLength={8} maxLength={72} className={fieldClass} />
        </Field>
        <Field label="Confirm new password">
          <input name="confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={72} className={fieldClass} />
        </Field>
      </ActionForm>
    </Card>
  );
}
