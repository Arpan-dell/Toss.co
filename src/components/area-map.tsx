"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";

export type MapPin = { lat: number; lng: number; label: string; radiusKm?: number; active?: boolean };

type View = { center: [number, number]; zoom: number; pins: MapPin[]; you?: [number, number] };

function textNode(text: string) {
  const el = document.createElement("span");
  el.textContent = text;
  return el;
}

function render(mod: typeof Leaflet, map: Leaflet.Map, g: Leaflet.LayerGroup, { center, zoom, pins, you }: View) {
  g.clearLayers();
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#1f5eff";
  const bounds: [number, number][] = [];
  for (const p of pins) {
    if (p.radiusKm) {
      mod
        .circle([p.lat, p.lng], { radius: p.radiusKm * 1000, color: accent, weight: 1.5, fillColor: accent, fillOpacity: p.active ? 0.12 : 0.05, dashArray: p.active ? undefined : "4 6" })
        .addTo(g);
    }
    mod
      .marker([p.lat, p.lng], {
        icon: mod.divIcon({ className: "", html: `<span class="map-pin${p.active ? " is-active" : ""}"></span>`, iconSize: [14, 14], iconAnchor: [7, 7] }),
        title: p.label,
        keyboard: false,
      })
      // Leaflet renders string tooltips as HTML, and labels carry business names typed by managers:
      // pass a text node so a name can never become markup or script.
      .bindTooltip(textNode(p.label), { direction: "top", offset: [0, -8] })
      .addTo(g);
    bounds.push([p.lat, p.lng]);
  }
  if (you) {
    mod
      .marker(you, { icon: mod.divIcon({ className: "", html: '<span class="map-you"></span>', iconSize: [16, 16], iconAnchor: [8, 8] }), title: "You" })
      .bindTooltip("You", { direction: "top", offset: [0, -8] })
      .addTo(g);
    bounds.push(you);
  }
  if (bounds.length > 1) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
  else map.setView(center, zoom);
}

// OpenStreetMap map (free, no key) for service areas and the laundry directory. Leaflet is loaded in the
// browser only. Pins are square markers in the dashboard style; a pin with radiusKm draws its service area.
// `you` marks the customer's search point; `onPick` makes the map clickable (managers placing their store).
export function AreaMap({
  center,
  zoom = 12,
  pins = [],
  you,
  onPick,
  className = "h-72",
}: {
  center: [number, number];
  zoom?: number;
  pins?: MapPin[];
  you?: [number, number];
  onPick?: (lat: number, lng: number) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const live = useRef<{ mod: typeof Leaflet; map: Leaflet.Map; layer: Leaflet.LayerGroup } | null>(null);
  const view = useRef<View>({ center, zoom, pins, you });
  const pick = useRef(onPick);

  // latest props, and redraw whenever what's on the map changes
  const key = JSON.stringify([center, zoom, pins, you]);
  useEffect(() => {
    pick.current = onPick;
    view.current = { center, zoom, pins, you };
    if (live.current) render(live.current.mod, live.current.map, live.current.layer, view.current);
    // key captures the content of center/zoom/pins/you
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, onPick]);

  // create the map once, in the browser
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((mod) => {
      if (cancelled || !box.current || live.current) return;
      const map = mod.map(box.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView(view.current.center, view.current.zoom);
      mod
        .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        })
        .addTo(map);
      map.on("click", (e: Leaflet.LeafletMouseEvent) => pick.current?.(e.latlng.lat, e.latlng.lng));
      const layer = mod.layerGroup().addTo(map);
      live.current = { mod, map, layer };
      render(mod, map, layer, view.current);
    });
    return () => {
      cancelled = true;
      live.current?.map.remove();
      live.current = null;
    };
  }, []);

  return <div ref={box} className={`area-map relative z-0 overflow-hidden rounded-[10px] border border-border ${className}`} />;
}
