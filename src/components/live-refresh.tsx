"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Re-renders the current page whenever this business's orders, baskets or drivers change
// (a basket fills, a driver taps Accept, a customer reports a payment…). Supabase Realtime
// applies RLS, so a manager only ever receives their own business's rows.
export function LiveRefresh({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
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

    return () => {
      clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [tenantId, router]);

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted"
      title={status === "live" ? "This page updates by itself" : status === "offline" ? "Live updates unavailable: refresh to see changes" : "Connecting…"}
    >
      <span className={`live-dot ${status === "live" ? "text-good" : status === "offline" ? "text-critical" : "text-warn"}`} aria-hidden />
      {status === "live" ? "Live" : status === "offline" ? "Offline" : "Connecting"}
    </span>
  );
}
