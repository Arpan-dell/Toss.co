import type { Metadata } from "next";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { ChangePasswordCard } from "@/components/change-password";
import { PasswordField } from "@/components/password-field";
import { Card, PageTitle } from "@/components/ui";
import { requestClosure } from "@/lib/actions/manager";
import { getTenantById } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Account & security" };

// Settings → Account & security: the sign-in email, the password, and closing the business (password needed).
export default async function AccountSettings() {
  const session = await requireRole("MANAGER");
  const tenant = await getTenantById(session.tenantId);
  if (!tenant) return <Card>This manager account isn&apos;t linked to a business.</Card>;

  return (
    <div className="stagger max-w-2xl space-y-6">
      <PageTitle kicker="Settings">Account &amp; security</PageTitle>
      <BackLink />

      <Card title="Signed in as">
        <p className="font-mono text-sm text-fg">{session.email}</p>
        <p className="mt-2 text-sm text-secondary">
          Your password protects important settings too: changing your price, your UPI ID, or closing the business asks for it again.
        </p>
      </Card>

      <ChangePasswordCard email={session.email} />

      <Card title="Close your business">
        {tenant.closureRequestedAt ? (
          <p className="rounded-[8px] border border-warn/30 bg-warn-bg px-3 py-2 text-sm text-warn">
            You asked Toss to close this business on {formatDate(tenant.closureRequestedAt)}. We&apos;ll contact you by email to complete it.
          </p>
        ) : (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">Request to remove {tenant.name} from Toss</summary>
            <ActionForm
              action={requestClosure}
              submitLabel="Send removal request"
              submitClassName="rounded-full border border-critical/40 px-5 py-2.5 text-sm font-medium text-critical transition hover:bg-critical-bg disabled:opacity-70"
              className="mt-3 max-w-md space-y-3"
            >
              <Field label="Why are you leaving? (optional)">
                <textarea name="reason" maxLength={500} rows={3} className={fieldClass} />
              </Field>
              <label className="flex items-start gap-2 text-sm text-secondary">
                <input type="checkbox" name="confirm" className="mt-0.5 size-4 accent-[var(--color-critical)]" />I want to close my business. Toss will
                contact me to complete it.
              </label>
              <PasswordField hint="Closing the business needs your password." />
            </ActionForm>
          </details>
        )}
      </Card>
    </div>
  );
}
