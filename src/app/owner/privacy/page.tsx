import type { Metadata } from "next";
import { Card, EmptyState, PageTitle } from "@/components/ui";
import { closeDeletionRequest } from "@/lib/actions/privacy";
import { now } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Privacy requests" };

type Req = { id: number; email: string; name: string | null; role: string | null; details: string | null; status: string; created_at: string; done_at: string | null; note: string | null };

// Data deletion requests from /data-deletion. Open ones first, with the 30-day deadline; close each once the
// personal data is deleted or anonymised (invoices kept for tax law stay, with a note).
export default async function PrivacyRequests() {
  await requireRole("OWNER");
  const { data } = await supabaseAdmin().from("deletion_requests").select("id, email, name, role, details, status, created_at, done_at, note").order("created_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as Req[];
  const open = rows.filter((r) => r.status === "OPEN");
  const closed = rows.filter((r) => r.status !== "OPEN");
  const due = (iso: string) => {
    const days = 30 - Math.floor((now().getTime() - new Date(iso).getTime()) / 86_400_000);
    return days < 0 ? `${-days} days overdue` : `${days} days left`;
  };
  return (
    <div className="stagger max-w-3xl space-y-6">
      <PageTitle kicker="Privacy">Data deletion requests</PageTitle>
      <Card title={`Open (${open.length})`}>
        {open.length === 0 ? (
          <EmptyState>Nothing to do. New requests from the Delete my data page show up here, and you get an email.</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {open.map((r) => (
              <li key={r.id} className="space-y-2 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-fg">
                    #{r.id} · {r.email}
                  </p>
                  <span className={`text-xs ${due(r.created_at).includes("overdue") ? "text-critical" : "text-muted"}`}>{due(r.created_at)}</span>
                </div>
                <p className="text-sm text-secondary">
                  {r.name || "No name"} · {r.role ?? "not signed in"} · asked {formatDateTime(r.created_at)}
                </p>
                {r.details && <p className="text-sm text-secondary">&ldquo;{r.details}&rdquo;</p>}
                <form action={closeDeletionRequest} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input name="note" placeholder="What was done (for your records)" maxLength={500} className="min-w-0 flex-1 rounded-[8px] border border-border bg-ink/[0.03] px-3 py-2 text-sm" />
                  <button name="status" value="DONE" className="btn-primary rounded-full px-4 py-2 text-sm font-medium">
                    Mark deleted
                  </button>
                  <button name="status" value="REJECTED" className="btn-ghost rounded-full px-4 py-2 text-sm">
                    Couldn&apos;t verify
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {closed.length > 0 && (
        <Card title="Closed">
          <ul className="divide-y divide-border text-sm">
            {closed.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2.5">
                <span>
                  #{r.id} · {r.email}
                </span>
                <span className="text-muted">
                  {r.status === "DONE" ? "deleted" : "not verified"} {r.done_at ? formatDateTime(r.done_at) : ""}
                  {r.note ? ` · ${r.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
