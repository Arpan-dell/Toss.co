"use client";

import { useState } from "react";
import type { Insights } from "@/app/api/insights/route";
import { burstFromEvent } from "@/lib/fx";

export function AiInsights() {
  const [state, setState] = useState<{ status: "idle" | "loading" | "error" } | { status: "done"; data: Insights }>({
    status: "idle",
  });

  async function run(e: React.MouseEvent) {
    burstFromEvent(e);
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/insights", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      setState({ status: "done", data: await res.json() });
    } catch {
      setState({ status: "error" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={run}
          disabled={state.status === "loading"}
          className="btn-primary inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-70"
        >
          {state.status === "loading" ? (
            <>
              <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Analyzing demand…
            </>
          ) : (
            <>✨ Generate AI insights</>
          )}
        </button>
        <p className="text-xs text-muted">Only totals by day and week are shared. No names, addresses or chat IDs.</p>
      </div>

      {state.status === "error" && <p className="text-sm text-critical">Couldn&apos;t generate insights. Try again.</p>}

      {state.status === "loading" && (
        <div className="space-y-2" aria-hidden>
          {[80, 95, 60].map((w) => (
            <div key={w} className="h-3 animate-pulse rounded-full bg-white/[0.07]" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}

      {state.status === "done" && (
        <div className="stagger rounded-xl border border-accent/30 bg-accent/[0.06] p-5 text-sm shadow-[0_0_40px_-12px_rgb(139_123_255/0.6)]">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-medium">
              Peak days: <span className="text-gradient">{state.data.peakDays.join(" & ") || "—"}</span>
            </p>
            <span className="rounded-full border border-border-strong px-2 py-0.5 text-xs text-secondary">
              {state.data.confidence} confidence
            </span>
          </div>
          <p className="mt-2 text-secondary">{state.data.narrative}</p>
          <p className="mt-2 text-secondary">→ {state.data.staffingSuggestion}</p>
          {state.data.source === "preview" && (
            <p className="mt-3 text-xs text-muted">Preview from simple rules. Claude-powered analysis arrives in Phase F.</p>
          )}
        </div>
      )}
    </div>
  );
}
