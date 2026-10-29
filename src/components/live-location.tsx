"use client";

import { useEffect, useRef, useState } from "react";

import { Tr } from "@/components/locale";
const KEY = "toss-route-location";
const EVERY_MS = 60_000;

// On the driver's route page: sends the phone's location to Toss about once a minute while the page is open.
// Starts by itself once the driver has allowed it (the browser remembers the permission), otherwise on a tap.
export function LiveLocation({ token }: { token: string }) {
  const [state, setState] = useState<"off" | "on" | "denied" | "unsupported">("off");
  const watch = useRef<number | null>(null);
  const sentAt = useRef(0);

  function start() {
    if (!("geolocation" in navigator)) return setState("unsupported");
    if (watch.current != null) return;
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        setState("on");
        try {
          localStorage.setItem(KEY, "1");
        } catch {}
        if (Date.now() - sentAt.current < EVERY_MS || pos.coords.accuracy > 500) return;
        sentAt.current = Date.now();
        void fetch("/api/driver-location", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, lat: pos.coords.latitude, lng: pos.coords.longitude }),
          keepalive: true,
        }).catch(() => {});
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setState("denied");
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 30_000 },
    );
  }

  useEffect(() => {
    let remembered = false;
    try {
      remembered = localStorage.getItem(KEY) === "1";
    } catch {}
    const permissions = navigator.permissions?.query({ name: "geolocation" });
    void permissions
      ?.then((p) => {
        if (p.state === "granted" || (remembered && p.state !== "denied")) start();
        else if (p.state === "denied") setState("denied");
      })
      .catch(() => {});
    return () => {
      if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
    };
    // start only reads refs; runs once per page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "on") return <p className="text-xs text-good"><Tr>{"📍 Your location updates by itself while this page is open."}</Tr></p>;
  if (state === "denied") return <p className="text-xs text-muted"><Tr>{"📍 Location is blocked for this site. Turn on live location in Toss Handy instead."}</Tr></p>;
  if (state === "unsupported") return null;
  return (
    <button type="button" onClick={start} className="btn-ghost w-full rounded-full px-4 py-2 text-sm">
      <Tr>{"📍 Keep my location updated from this page"}</Tr>
    </button>
  );
}
