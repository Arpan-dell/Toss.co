"use client";

import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Tip } from "./ui";

// Re-renders the current page whenever this business's orders, baskets or drivers change
// (a basket fills, a driver taps Accept, a customer reports a payment…). Supabase Realtime
// applies RLS, so a manager only ever receives their own business's rows.
// Session cookies are HttpOnly, so the server passes the manager's short-lived access token for the
// subscription. The page refreshes every 5 minutes, which hands over a fresh token before it expires;
// the refresh token never reaches the browser.
//
// Not every change is worth re-rendering the page for. Drivers sharing live location update their row every few
// seconds, and baskets check in every few minutes: those refresh the page at most once a minute. Orders and real
// driver changes (status, name, limits) refresh straight away, but never more than once every 3 seconds, and a
// hidden tab waits until it's looked at again.
const TOKEN_REFRESH_MS = 5 * 60_000; // stays ahead of short JWT lifetimes (Supabase → Auth → JWT expiry)
const MIN_GAP_MS = 3_000; // no more than one refresh every 3 s
const BACKGROUND_GAP_MS = 60_000; // location pings and basket check-ins: once a minute at most
const DRIVER_FIELDS = ["status", "name", "max_jobs", "telegram_chat_id", "phone", "pay_type"] as const;

type Change = { eventType: string; new: Record<string, unknown> | null; old: Record<string, unknown> | null };

export function LiveRefresh({ tenantId, token }: { tenantId: string; token: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tokenRef = useRef(token);
  const realtime = useRef<{ setAuth: (token: string) => unknown } | null>(null);

  // a re-render brings a fresh token: hand it to the open subscription
  useEffect(() => {
    tokenRef.current = token;
    realtime.current?.setAuth(token);
  }, [token]);

  // refresh the page (and so the token) well before the 1-hour access token expires
  useEffect(() => {
    const id = setInterval(() => router.refresh(), TOKEN_REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  useEffect(() => {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    supabase.realtime.setAuth(tokenRef.current);

    let last = 0; // when the page last refreshed
    let dueAt = 0; // when the scheduled refresh runs (0: none scheduled)
    let pending = false; // a change arrived while the tab was hidden
    const run = () => {
      last = Date.now();
      dueAt = 0;
      pending = false;
      router.refresh();
    };
    // refresh once per burst, spaced at least `gap` apart; a sooner refresh already scheduled wins, and a hidden
    // tab catches up when it's shown again
    const refresh = (gap = MIN_GAP_MS) => {
      if (document.hidden) {
        pending = true;
        return;
      }
      const at = Math.max(Date.now() + 600, last + gap);
      if (dueAt && dueAt <= at) return;
      clearTimeout(timer.current);
      dueAt = at;
      timer.current = setTimeout(run, at - Date.now());
    };
    const onVisible = () => {
      if (!document.hidden && pending) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    // drivers: a status or detail change matters now; a location ping can wait
    const seen = new Map<string, string>();
    const onDriver = (c: Change) => {
      const row = c.new ?? c.old ?? {};
      const id = String(row.id ?? "");
      if (c.eventType !== "UPDATE" || !id) return refresh();
      const key = DRIVER_FIELDS.map((f) => String(c.new?.[f] ?? "")).join("|");
      const before = seen.get(id);
      seen.set(id, key);
      if (before !== undefined && before !== key) refresh();
      else refresh(BACKGROUND_GAP_MS);
    };
    // baskets: a new one matters now; a check-in (weight, last seen) can wait
    const onDevice = (c: Change) => (c.eventType === "UPDATE" ? refresh(BACKGROUND_GAP_MS) : refresh());

    const filter = `tenant_id=eq.${tenantId}`;
    const channel = supabase
      .channel(`business-${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "devices", filter }, (c) => onDevice(c as unknown as Change))
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers", filter }, (c) => onDriver(c as unknown as Change))
      .subscribe((s) => setStatus(s === "SUBSCRIBED" ? "live" : s === "CHANNEL_ERROR" || s === "TIMED_OUT" ? "offline" : "connecting"));

    realtime.current = supabase.realtime;
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
      realtime.current = null;
      supabase.removeChannel(channel);
    };
  }, [tenantId, router]);

  return (
    <Tip label={status === "live" ? "This page updates by itself" : status === "offline" ? "Live updates off: refresh to see changes" : "Connecting…"}>
      <span tabIndex={0} className="inline-flex items-center gap-1.5 rounded-[4px] font-mono text-[11px] tracking-wide text-muted uppercase outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <span className={`size-1.5 tag-live bg-current ${status === "live" ? "text-good" : status === "offline" ? "text-critical" : "text-warn"}`} aria-hidden />
        {status === "live" ? "Live" : status === "offline" ? "Offline" : "Connecting"}
      </span>
    </Tip>
  );
}
