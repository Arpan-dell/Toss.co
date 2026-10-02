"use client";

import { useActionState, useState } from "react";
import { Crosshair } from "@phosphor-icons/react";
import { AreaMap } from "@/components/area-map";
import { updateServiceArea } from "@/lib/actions/manager";
import type { FormState } from "@/lib/actions/shared";

const DELHI: [number, number] = [28.6139, 77.209];

// Where the business works: the store pin (click the map or use this device's location) and a pickup radius
// of 1-20 km, drawn live on the map. Listing puts the business in the public "Find a laundry" directory.
export function ServiceAreaEditor({ lat, lng, radiusKm, listed }: { lat?: number; lng?: number; radiusKm: number; listed: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateServiceArea, {});
  const [pin, setPin] = useState<[number, number] | undefined>(lat != null && lng != null ? [lat, lng] : undefined);
  const [radius, setRadius] = useState(radiusKm);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string>();

  const useMyLocation = () => {
    if (!navigator.geolocation) return setGeoError("This browser can't share its location. Click the map instead.");
    setLocating(true);
    setGeoError(undefined);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPin([Number(p.coords.latitude.toFixed(6)), Number(p.coords.longitude.toFixed(6))]);
        setLocating(false);
      },
      () => {
        setGeoError("Location blocked. Click your store on the map instead.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="lat" value={pin?.[0] ?? ""} />
      <input type="hidden" name="lng" value={pin?.[1] ?? ""} />

      <div className="grid gap-5 lg:grid-cols-[1fr_17rem]">
        <div className="space-y-2">
          <AreaMap
            center={pin ?? DELHI}
            zoom={pin ? 12 : 11}
            pins={pin ? [{ lat: pin[0], lng: pin[1], label: "Your store", radiusKm: radius, active: true }] : []}
            onPick={(a, b) => setPin([Number(a.toFixed(6)), Number(b.toFixed(6))])}
            className="h-80"
          />
          <p className="text-xs text-muted">{pin ? "Click the map to move your store." : "Click your store on the map, or use your location."}</p>
        </div>

        <div className="space-y-5">
          <div>
            <button type="button" onClick={useMyLocation} disabled={locating} className="btn-ghost inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm disabled:opacity-60">
              <Crosshair size={16} weight="bold" aria-hidden />
              {locating ? "Finding you…" : "Use my current location"}
            </button>
            {geoError && <p className="mt-1.5 text-xs text-critical">{geoError}</p>}
            {pin && <p className="mt-2 font-mono text-[11px] text-muted">{pin[0].toFixed(4)}, {pin[1].toFixed(4)}</p>}
          </div>

          <label className="block">
            <span className="flex items-baseline justify-between">
              <span className="font-mono text-[11px] tracking-[0.12em] text-secondary uppercase">Pickup radius</span>
              <span className="font-mono text-2xl font-semibold tabular-nums">{radius} km</span>
            </span>
            <input
              name="radius"
              type="range"
              min={1}
              max={20}
              step={1}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="mt-2 w-full accent-[var(--accent)]"
              aria-valuetext={`${radius} kilometres`}
            />
            <span className="flex justify-between font-mono text-[10px] text-muted">
              <span>1</span>
              <span>5</span>
              <span>10</span>
              <span>15</span>
              <span>20 km</span>
            </span>
            <span className="mt-2 block text-xs text-muted">About {Math.round(Math.PI * radius * radius)} km² around your store.</span>
          </label>

          <label className="flex items-start gap-2.5 text-sm">
            <input name="listed" type="checkbox" defaultChecked={listed} className="mt-0.5 size-4 accent-[var(--accent)]" />
            <span>
              Show my business in <span className="text-fg">Find a laundry</span>
              <span className="block text-xs text-muted">Customers in your radius can compare you and connect without a Business ID.</span>
            </span>
          </label>
        </div>
      </div>

      {state.error && <p role="alert" className="rounded-[8px] border border-critical/30 bg-critical-bg px-3 py-2 text-sm text-critical">{state.error}</p>}
      {state.message && <p role="status" className="rounded-[8px] border border-good/30 bg-good-bg px-3 py-2 text-sm text-good">{state.message}</p>}
      <button disabled={pending} className="btn-primary rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-70">
        {pending ? "Saving…" : "Save service area"}
      </button>
    </form>
  );
}
