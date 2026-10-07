import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { siteHref } from "@/lib/hosts";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { RateForm } from "./rate-form";

// One-tap rating for a paid pickup, opened from the link in the invoice (email or Telegram). The random token in
// the URL is the only key; nothing else about the customer is shown.
export const metadata: Metadata = { title: "Rate your pickup", robots: { index: false, follow: false } };

export default async function RatePage({ params }: PageProps<"/rate/[token]">) {
  const { token } = await params;
  const valid = /^[a-f0-9]{32}$/.test(token) && isSupabaseConfigured();
  const { data: o } = valid
    ? await supabaseAdmin().from("orders").select("device_order_id, rating, rated_at, tenants(name)").eq("rate_token", token).maybeSingle()
    : { data: null };
  const t = o ? ((Array.isArray(o.tenants) ? o.tenants[0] : o.tenants) as { name?: string } | null) : null;

  return (
    <main className="grid min-h-[100dvh] flex-1 place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href={siteHref("/")} aria-label="Toss home" className="mb-8 flex justify-center">
          <Logo className="h-10" />
        </Link>
        <div className="rounded-[10px] border border-t-2 border-border border-t-accent bg-surface-solid p-7 text-center">
          {!o ? (
            <p className="text-sm text-secondary">This rating link isn&apos;t valid. Check the latest message from your laundry.</p>
          ) : o.rated_at ? (
            <>
              <p className="text-2xl" aria-hidden>{"★".repeat(o.rating ?? 0)}</p>
              <p className="mt-2 font-semibold text-fg">Thanks, you&apos;ve rated this pickup.</p>
            </>
          ) : (
            <>
              <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Pickup #{o.device_order_id}</p>
              <h1 className="mt-2 text-xl font-bold tracking-tight text-fg">How did {t?.name ?? "your laundry"} do?</h1>
              <RateForm token={token} />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
