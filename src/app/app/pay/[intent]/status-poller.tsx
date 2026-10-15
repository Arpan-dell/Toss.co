"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { paymentStatus } from "@/lib/actions/gateway";

// Asks the server every few seconds (for up to two minutes) and reloads the page once the gateway has answered.
export function StatusPoller({ intent }: { intent: string }) {
  const router = useRouter();
  const tries = useRef(0);
  useEffect(() => {
    const id = window.setInterval(async () => {
      tries.current++;
      const r = await paymentStatus(intent).catch(() => null);
      if ((r && r.status !== "created") || tries.current >= 40) {
        window.clearInterval(id);
        router.refresh();
      }
    }, 3000);
    return () => window.clearInterval(id);
  }, [intent, router]);
  return (
    <p className="mt-3 flex items-center gap-2 text-xs text-muted" role="status">
      <span className="size-2 animate-pulse rounded-full bg-accent" aria-hidden /> Checking…
    </p>
  );
}
