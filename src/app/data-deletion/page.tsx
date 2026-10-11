import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { InfoPage } from "@/components/site/info-page";
import { requestDeletion } from "@/lib/actions/privacy";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  alternates: { canonical: "/data-deletion" },
  title: "Delete my data",
  description: "Ask Toss to delete your account and personal data.",
};

// The right to erasure, as a form. Signed-in people don't type their email: the request is tied to their account.
export default async function DataDeletionPage() {
  const session = await getSession();
  return (
    <InfoPage kicker="Privacy" title="Delete my data">
      <p>
        Ask us to delete your Toss account and the personal details we hold about you. We&apos;ll check the request is really yours, do it
        within 30 days and email you when it&apos;s done.
      </p>
      <h2>What happens</h2>
      <ul>
        <li>Your account, name, phone, email, addresses, saved location and Telegram link are deleted.</li>
        <li>
          Invoices a laundry must keep by law (Indian tax rules) stay on record for that period, with your name removed where the law
          allows.
        </li>
        <li>Basket credit left on your account is cancelled. Pickups already booked can&apos;t be served after the account is gone.</li>
      </ul>
      <p>
        Only want to stop emails? Use the unsubscribe link at the bottom of any optional email. To fix a detail instead, see{" "}
        <Link href="/privacy">your choices</Link>.
      </p>

      <h2>Send a request</h2>
      <ActionForm action={requestDeletion} submitLabel="Request deletion">
        {session?.email ? (
          <p className="text-sm">
            Signed in as <b>{session.email}</b>. The request will be for this account.
          </p>
        ) : (
          <Field label="Email on your Toss account">
            <input name="email" type="email" autoComplete="email" required maxLength={120} className={fieldClass} />
          </Field>
        )}
        <Field label="Name (optional)">
          <input name="name" autoComplete="name" maxLength={80} className={fieldClass} />
        </Field>
        <Field label="Anything we should know? (optional)" hint="For example, a second email you used, or only some data to delete.">
          <textarea name="details" rows={3} maxLength={1000} className={fieldClass} />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirm" value="yes" required className="mt-1 size-4 accent-[var(--accent)]" />
          <span>I understand my account and personal data will be deleted and this can&apos;t be undone.</span>
        </label>
      </ActionForm>
    </InfoPage>
  );
}
