import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { InfoPage } from "@/components/site/info-page";
import { unsubscribe } from "@/lib/actions/unsubscribe";
import { EMAIL_CATEGORIES, readUnsubscribeLink } from "@/lib/unsubscribe";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

// Opened from the link at the bottom of an optional email. It asks before doing anything, so mail scanners that
// open every link can't unsubscribe someone by accident.
export default async function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const [e, c, t] = [one(q.e), one(q.c), one(q.t)];
  const link = readUnsubscribeLink(e, c, t);
  return (
    <InfoPage kicker="Email" title="Unsubscribe">
      {!link ? (
        <p>This link isn&apos;t valid. Open the unsubscribe link in your latest email from Toss, or email us and we&apos;ll do it for you.</p>
      ) : (
        <>
          <p>
            Stop sending <b>{EMAIL_CATEGORIES[link.category]}</b> to <b>{link.email}</b>?
          </p>
          <ActionForm action={unsubscribe} submitLabel="Unsubscribe">
            <input type="hidden" name="e" value={e} />
            <input type="hidden" name="c" value={c} />
            <input type="hidden" name="t" value={t} />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="scope" value="all" className="mt-1 size-4 accent-[var(--accent)]" />
              <span>Stop all optional emails from Toss (reminders and alerts)</span>
            </label>
          </ActionForm>
          <p className="text-sm">Invoices, password resets and messages about your account aren&apos;t affected: you need those to use Toss.</p>
        </>
      )}
    </InfoPage>
  );
}
