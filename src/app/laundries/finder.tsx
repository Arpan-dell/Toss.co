"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { Crosshair, MagnifyingGlass } from "@phosphor-icons/react";
import { AreaMap } from "@/components/area-map";
import { Badge } from "@/components/ui";
import { chooseLaundry, findLaundries, locatePlace, type Laundry } from "@/lib/actions/directory";
import type { FormState } from "@/lib/actions/shared";
import { appHref } from "@/lib/hosts";

type Viewer = "customer" | "signed-out" | "other";
type Sort = "near" | "price" | "fast" | "busy";
const SORTS: [Sort, string][] = [
  ["near", "Nearest"],
  ["price", "Lowest price"],
  ["fast", "Quickest to accept"],
  ["busy", "Busiest"],
];
const BASKET_KG = 6; // a typical full basket, for an at-a-glance price

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const sinceLabel = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { month: "short", year: "numeric" });

export function LaundryFinder({ viewer, currentCode, home }: { viewer: Viewer; currentCode?: string; home?: [number, number] }) {
  const [here, setHere] = useState<[number, number] | undefined>(home);
  const [results, setResults] = useState<Laundry[]>();
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("near");
  const [hover, setHover] = useState<string>();
  const [searching, startSearch] = useTransition();
  const [locating, setLocating] = useState(false);

  const search = (lat: number, lng: number) =>
    startSearch(async () => {
      setError(undefined);
      setHere([lat, lng]);
      const r = await findLaundries(lat, lng);
      if (r.error) setError(r.error);
      setResults(r.laundries ?? []);
    });

  // a saved home location searches straight away
  useEffect(() => {
    if (home) search(home[0], home[1]);
    // run once for the saved location
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const useMyLocation = () => {
    if (!navigator.geolocation) return setError("This browser can't share its location. Type your area instead.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        search(p.coords.latitude, p.coords.longitude);
      },
      () => {
        setLocating(false);
        setError("Location is blocked. Type your area instead.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const lookUp = () =>
    startSearch(async () => {
      setError(undefined);
      const p = await locatePlace(query);
      if (p.error || p.lat == null || p.lng == null) return setError(p.error);
      const r = await findLaundries(p.lat, p.lng);
      setHere([p.lat, p.lng]);
      if (r.error) setError(r.error);
      setResults(r.laundries ?? []);
    });

  const sorted = useMemo(() => {
    const list = [...(results ?? [])];
    const by: Record<Sort, (a: Laundry, b: Laundry) => number> = {
      near: (a, b) => a.distanceKm - b.distanceKm,
      price: (a, b) => a.pricePerKg - b.pricePerKg || a.distanceKm - b.distanceKm,
      fast: (a, b) => (a.avgAcceptMins ?? 1e9) - (b.avgAcceptMins ?? 1e9),
      busy: (a, b) => b.pickups30d - a.pickups30d,
    };
    return list.sort(by[sort]);
  }, [results, sort]);

  const cheapest = results?.length ? Math.min(...results.map((l) => l.pricePerKg)) : undefined;

  return (
    <div className="space-y-6">
      {/* where are you */}
      <div className="rounded-[10px] border border-border bg-surface-solid p-5">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={useMyLocation} disabled={locating || searching} className="btn-primary inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-70">
            <Crosshair size={16} weight="bold" aria-hidden />
            {locating ? "Finding you…" : "Use my location"}
          </button>
          <span className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">or</span>
          <form
            className="flex min-w-[260px] flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              lookUp();
            }}
          >
            <label className="sr-only" htmlFor="area">
              Your area or address
            </label>
            <input
              id="area"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Your area, like Mukherjee Nagar, Delhi"
              className="w-full rounded-[8px] border border-border bg-ink/[0.03] px-4 py-2.5 text-sm placeholder:text-muted focus:border-accent/60 focus:outline-none"
            />
            <button type="submit" disabled={searching} aria-label="Search this area" className="btn-ghost grid size-10 shrink-0 place-items-center rounded-full disabled:opacity-60">
              <MagnifyingGlass size={18} weight="bold" aria-hidden />
            </button>
          </form>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-critical">{error}</p>}
        <p className="mt-3 text-xs text-muted">Your location is only used to find laundries that pick up where you are.</p>
      </div>

      {searching && !results && <p className="text-sm text-muted">Searching…</p>}

      {results && (
        <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <section aria-live="polite" className="min-w-0">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-xl font-bold tracking-tight">
                {results.length === 0
                  ? "No laundry picks up here yet"
                  : `${results.length} ${results.length === 1 ? "laundry picks" : "laundries pick"} up at your location`}
              </h2>
              {results.length > 1 && (
                <div role="tablist" aria-label="Sort laundries" className="flex flex-wrap border-b border-border">
                  {SORTS.map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      role="tab"
                      aria-selected={sort === k}
                      onClick={() => setSort(k)}
                      className={`-mb-px border-b-2 px-2.5 py-1.5 font-mono text-[11px] tracking-[0.1em] uppercase transition-colors ${
                        sort === k ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {results.length === 0 ? (
              <div className="rounded-[10px] border border-border bg-surface-solid p-6 text-sm text-secondary">
                None of the laundries on Toss cover this spot yet. Try a nearby area, or ask your local laundry to join Toss. If they
                already gave you a Business ID, enter it on your dashboard.
              </div>
            ) : (
              <ol className="space-y-3">
                {sorted.map((l, i) => (
                  <li
                    key={l.code}
                    onMouseEnter={() => setHover(l.code)}
                    onMouseLeave={() => setHover(undefined)}
                    className={`rounded-[10px] border bg-surface-solid p-5 transition-colors ${
                      l.code === currentCode ? "border-accent" : hover === l.code ? "border-border-strong" : "border-border"
                    }`}
                  >
                    <div className="flex flex-wrap items-start gap-4">
                      <span className="font-mono text-sm text-muted tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="text-lg font-semibold">{l.name}</span>
                          {l.code === currentCode && <Badge tone="info">Your laundry</Badge>}
                          {cheapest !== undefined && l.pricePerKg === cheapest && results.length > 1 && <Badge tone="good">Lowest price</Badge>}
                        </p>
                        {l.address && <p className="mt-0.5 truncate text-sm text-secondary">{l.address}</p>}
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-2xl leading-none font-semibold tabular-nums">₹{l.pricePerKg}</p>
                        <p className="mt-1 font-mono text-[11px] text-muted">per kg · ~{inr(l.pricePerKg * BASKET_KG)} for {BASKET_KG} kg</p>
                      </div>
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-dotted border-border-strong pt-4 sm:grid-cols-4">
                      <Fact label="Distance" value={`${l.distanceKm} km`} hint={`serves ${l.radiusKm} km`} />
                      <Fact label="Drivers ready" value={String(l.driversReady)} />
                      <Fact label="Accepts in" value={l.avgAcceptMins != null ? `~${l.avgAcceptMins} min` : "New"} hint="on average" />
                      <Fact label="Pickups / 30d" value={String(l.pickups30d)} hint={`${l.customers} customers · since ${sinceLabel(l.since)}`} />
                    </dl>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Choose laundry={l} viewer={viewer} currentCode={currentCode} here={here} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <AreaMap
              center={here ?? [28.6139, 77.209]}
              pins={results.map((l) => ({ lat: l.lat, lng: l.lng, label: `${l.name} · ₹${l.pricePerKg}/kg`, radiusKm: l.radiusKm, active: hover === l.code || l.code === currentCode }))}
              you={here}
              className="h-80 lg:h-[28rem]"
            />
            <p className="mt-2 text-xs text-muted">Circles show each laundry&apos;s pickup area. Store pins are approximate.</p>
          </aside>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">{label}</dt>
      <dd className="mt-1 font-mono text-base font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-[11px] text-muted">{hint}</dd>}
    </div>
  );
}

function Choose({ laundry, viewer, currentCode, here }: { laundry: Laundry; viewer: Viewer; currentCode?: string; here?: [number, number] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(chooseLaundry, {});
  const [confirm, setConfirm] = useState(false);

  if (state.message) {
    return (
      <p role="status" className="flex flex-wrap items-center gap-3 text-sm text-good">
        {state.message}
        <Link href={appHref("/app")} className="text-accent hover:underline">
          Open my dashboard →
        </Link>
      </p>
    );
  }
  if (laundry.code === currentCode) {
    return (
      <Link href={appHref("/app")} className="text-sm text-accent hover:underline">
        Go to my dashboard →
      </Link>
    );
  }
  if (viewer === "signed-out" || state.error === "signin") {
    return (
      <Link href={`/login?next=${encodeURIComponent("/laundries")}`} className="btn-primary rounded-full px-5 py-2 text-sm font-medium">
        Sign in to choose {laundry.name}
      </Link>
    );
  }
  if (viewer === "other") return <p className="text-xs text-muted">Sign in with a customer account to choose a laundry.</p>;

  const switching = !!currentCode;
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="code" value={laundry.code} />
      <input type="hidden" name="lat" value={here?.[0] ?? ""} />
      <input type="hidden" name="lng" value={here?.[1] ?? ""} />
      {switching && !confirm ? (
        <button type="button" onClick={() => setConfirm(true)} className="btn-ghost rounded-full px-5 py-2 text-sm font-medium">
          Switch to {laundry.name}
        </button>
      ) : (
        <>
          <button disabled={pending} className="btn-primary rounded-full px-5 py-2 text-sm font-medium disabled:opacity-70">
            {pending ? "Connecting…" : switching ? `Yes, switch to ${laundry.name}` : `Choose ${laundry.name}`}
          </button>
          {switching && (
            <span className="text-xs text-muted">
              Your basket&apos;s next pickup will go to {laundry.name}. Past orders stay with your old laundry.{" "}
              <button type="button" onClick={() => setConfirm(false)} className="text-secondary underline">
                Cancel
              </button>
            </span>
          )}
        </>
      )}
      {state.error && state.error !== "signin" && (
        <span role="alert" className="text-sm text-critical">
          {state.error}
        </span>
      )}
    </form>
  );
}
