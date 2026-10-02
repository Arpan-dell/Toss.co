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
const TOKEN_REFRESH_MS = 5 * 60_000; // stays ahead of short JWT lifetimes (Supabase → Auth → JWT expiry)

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
    // Several rows often change together (order + basket); refresh once per burst.
    const refresh = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 600);
    };
    const filter = `tenant_id=eq.${tenantId}`;
    const channel = supabase
      .channel(`business-${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "devices", filter }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers", filter }, refresh)
      .subscribe((s) => setStatus(s === "SUBSCRIBED" ? "live" : s === "CHANNEL_ERROR" || s === "TIMED_OUT" ? "offline" : "connecting"));

    realtime.current = supabase.realtime;
    return () => {
      clearTimeout(timer.current);
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
