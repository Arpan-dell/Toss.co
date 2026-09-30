import { computeAggregates } from "@/lib/analytics";
import { listOrders } from "@/lib/data";
import { getSession } from "@/lib/session";

export interface Insights {
  source: "preview" | "claude";
  peakDays: string[];
  confidence: "low" | "medium" | "high";
  staffingSuggestion: string;
  narrative: string;
}

// Phase A: rule-based preview so the UI flow works end to end.
// Phase F: this becomes a call to the analyticsInsights Lambda, which sends the same
// aggregates to Claude and returns this exact shape.
export async function POST() {
  const session = await getSession();
  if (session?.role !== "MANAGER") return Response.json({ error: "Forbidden" }, { status: 403 });

  const agg = computeAggregates(await listOrders());
  if (agg.totalOrders === 0) {
    return Response.json({
      source: "preview",
      peakDays: [],
      confidence: "low",
      staffingSuggestion: "Collect a few weeks of orders first.",
      narrative: "There are no orders yet, so there's nothing to forecast.",
    } satisfies Insights);
  }
  const avgKg = agg.totalKg / 7;
  const ranked = [...agg.byWeekday].sort((a, b) => b.kg - a.kg);
  const peaks = ranked.filter((d) => d.kg > avgKg * 1.2).map((d) => d.day);
  const peakDays = peaks.length ? peaks : [ranked[0].day];
  const lift = Math.round((ranked[0].kg / avgKg - 1) * 100);

  const insights: Insights = {
    source: "preview",
    peakDays,
    confidence: agg.byWeek.length >= 8 ? "medium" : "low",
    staffingSuggestion: `Schedule an extra driver on ${peakDays.join(" and ")}.`,
    narrative: `${ranked[0].day} handles ${lift}% more laundry than an average day across the last ${agg.byWeek.length} weeks. Average time from basket-full to pickup is ${agg.avgTurnaroundHrs} h.`,
  };
  return Response.json(insights);
}
