import type { Metadata } from "next";
import { Badge, Card, EmptyState, PageTitle, StatTile } from "@/components/ui";
import { now } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Errors" };

// What has been failing, from the error_log table (migration 0040): server errors and screens that crashed in
// someone's browser, already stripped of personal data, kept 30 days. Match a reference from an error screen here.
export default async function OwnerErrors() {
  await requireRole("OWNER");
  const since = new Date(now().getTime() - 7 * 86_400_000).toISOString();
  const { data, error } = await supabaseAdmin().from("error_log").select("id, created_at, source, context, detail, ref").gte("created_at", since).order("created_at", { ascending: false }).limit(300);

  if (error) {
    return (
      <div className="stagger space-y-6">
        <PageTitle kicker="Health">Errors</PageTitle>
        <Card>
          <EmptyState>Run the 0040 database update (Supabase → SQL Editor) to start recording errors here.</EmptyState>
        </Card>
      </div>
    );
  }
  const rows = data ?? [];
  const day = now().getTime() - 86_400_000;
  const last24 = rows.filter((r) => new Date(r.created_at as string).getTime() >= day).length;
  const groups = new Map<string, { context: string; source: string; count: number; last: string; detail?: string; ref?: string }>();
  for (const r of rows) {
    const key = `${r.source}:${r.context}`;
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { context: r.context as string, source: r.source as string, count: 1, last: r.created_at as string, detail: (r.detail as string) ?? undefined, ref: (r.ref as string) ?? undefined });
  }
  const top = [...groups.values()].sort((a, b) => b.last.localeCompare(a.last));

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker="Health">Errors</PageTitle>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <StatTile label="Last 24 hours" value={String(last24)} hint={last24 === 0 ? "all quiet" : "recorded errors"} />
        <StatTile label="Last 7 days" value={String(rows.length)} hint="newest 300 shown" />
        <StatTile label="Different problems" value={String(top.length)} hint="grouped below" />
      </div>

      <Card title="By problem">
        {top.length === 0 ? (
          <EmptyState>No errors in the last 7 days.</EmptyState>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {top.map((g) => (
              <li key={`${g.source}:${g.context}`} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{g.context}</span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {g.count}× · last {formatDateTime(g.last)}
                    <Badge tone={g.source === "browser" ? "warn" : "critical"}>{g.source}</Badge>
                  </span>
                </div>
                {g.detail && <p className="mt-1 font-mono text-xs break-words text-secondary">{g.detail}</p>}
                {g.ref && <p className="mt-1 font-mono text-[11px] text-muted">ref {g.ref}</p>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-muted">
          Personal details (emails, phones, IDs, keys) are removed before anything is saved. The same error is kept once a minute at most, and
          everything is deleted after 30 days.
        </p>
      </Card>
    </div>
  );
}
