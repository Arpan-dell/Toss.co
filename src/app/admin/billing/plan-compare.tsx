import { Check, Minus } from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui";
import { PLAN_FEATURES } from "@/lib/plan-features";

// Free vs Pro, side by side, with the business's current plan marked.
export function PlanCompare({ current }: { current: "FREE" | "PRO" | null }) {
  const cell = (v: boolean | string) =>
    v === true ? (
      <Check size={16} weight="bold" className="mx-auto text-good" aria-label="Included" />
    ) : v === false ? (
      <Minus size={16} className="mx-auto text-muted" aria-label="Not included" />
    ) : (
      <span className="text-xs text-secondary">{v}</span>
    );
  const head = (label: string, on: boolean) => (
    <th scope="col" className={`w-24 px-2 py-2 text-center font-mono text-[11px] tracking-[0.12em] uppercase ${on ? "text-accent" : "text-muted"}`}>
      {label}
      {on && <span className="block text-[9px] tracking-[0.08em] normal-case">your plan</span>}
    </th>
  );
  return (
    <Card title="Free and Pro">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="py-2 text-left font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
              Your dashboard
            </th>
            {head("Free", current === "FREE")}
            {head("Pro", current === "PRO")}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {PLAN_FEATURES.map((f) => (
            <tr key={f.name}>
              <td className="py-2.5 pr-3 text-secondary">{f.name}</td>
              <td className="px-2 text-center">{cell(f.free)}</td>
              <td className="px-2 text-center">{cell(f.pro)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted">Your customers are served the same on both plans.</p>
    </Card>
  );
}
