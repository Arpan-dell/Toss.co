import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { addRoundBag } from "@/lib/actions/round-bags";
import { getRound } from "@/lib/bookings";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Add a bag", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// From the round message in Toss Handy: the driver at a hostel adds bags for residents who didn't sign up.
// Opened by the driver's secret route token; it only ever shows that hostel's residents of the driver's laundry.
export default async function RoundBags({ params }: { params: Promise<{ token: string; account: string }> }) {
  const { token, account } = await params;
  if (!/^[a-f0-9]{36}$/.test(token) || !/^[A-Za-z0-9-]{2,40}$/.test(account)) notFound();
  const db = supabaseAdmin();
  const { data: driver } = await db.from("drivers").select("tenant_id, name").eq("route_token", token).maybeSingle();
  if (!driver) notFound();
  const round = await getRound(account, driver.tenant_id as string);
  if (!round) notFound();

  const [{ data: residents }, { data: open }] = await Promise.all([
    db.from("customers").select("id, name, room").eq("tenant_id", driver.tenant_id as string).eq("account_id", round.id).order("room"),
    db.from("orders").select("customer_id").eq("round_account_id", round.id).in("status", ["PENDING", "ACCEPTED"]),
  ]);
  const taken = new Set((open ?? []).map((o) => o.customer_id as string));
  const free = (residents ?? []).filter((r) => !taken.has(r.id as string));

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-lg space-y-5 px-4 py-6 outline-none">
      <div>
        <p className="font-mono text-[11px] tracking-[0.14em] text-accent uppercase">Toss Handy · round</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">{round.name}</h1>
        <p className="mt-1 text-sm text-secondary">Someone has clothes but didn&apos;t sign up? Add their bag here, then weigh it in Toss Handy.</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Residents ({free.length})</h2>
        {free.length === 0 ? (
          <p className="rounded-[10px] border border-border p-4 text-sm text-secondary">Everyone on the list already has a bag on this round.</p>
        ) : (
          <ul className="space-y-2">
            {free.map((r) => (
              <li key={r.id as string} className="rounded-[10px] border border-border bg-surface-solid p-3">
                <ActionForm action={addRoundBag} submitLabel="➕ Add their bag">
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="accountId" value={round.id} />
                  <input type="hidden" name="customerId" value={r.id as string} />
                  <p className="text-sm font-medium">
                    {r.room ? `Room ${r.room} · ` : ""}
                    {(r.name as string) || "Resident"}
                  </p>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 rounded-[10px] border border-border bg-surface-solid p-4">
        <h2 className="text-sm font-semibold">Someone not on the list</h2>
        <ActionForm action={addRoundBag} submitLabel="➕ Add bag">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="accountId" value={round.id} />
          <Field label="Name">
            <input name="name" required minLength={2} maxLength={60} autoComplete="off" className={fieldClass} />
          </Field>
          <Field label="Room (optional)">
            <input name="room" maxLength={20} autoComplete="off" className={fieldClass} />
          </Field>
          <Field label="Mobile (optional)" hint="So the laundry can tell them when it's ready.">
            <input name="phone" type="tel" inputMode="tel" autoComplete="off" className={fieldClass} />
          </Field>
        </ActionForm>
      </section>
    </main>
  );
}
