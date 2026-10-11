"use client";

import { useRouter } from "next/navigation";
import Script from "next/script";
import { useRef, useState } from "react";

type WebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
};

// Runs inside the customer portal. When the page was opened from the customer bot as a Telegram
// Mini App, it sends Telegram's signed launch data to the server, which links that Telegram account
// to this customer automatically. Outside Telegram the script isn't even loaded.
export function TelegramMiniApp({ linked }: { linked: boolean }) {
  const router = useRouter();
  const sent = useRef(false);
  const [note, setNote] = useState<string>();
  // Telegram's script is loaded only inside Telegram (its launch adds tgWebApp… to the address; the flag keeps it
  // for later pages in the same tab). In a normal browser nothing is sent to Telegram.
  const [inTelegram] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const launched = /tgWebApp/.test(location.hash + location.search) || "TelegramWebviewProxy" in window;
      if (launched) sessionStorage.setItem("toss-in-telegram", "1");
      return launched || sessionStorage.getItem("toss-in-telegram") === "1";
    } catch {
      return false;
    }
  });

  const onReady = async () => {
    const app = (window as unknown as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp;
    if (!app?.initData) return;
    app.ready();
    app.expand();
    // match Telegram's chrome to the current theme
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#f5f7fc";
    app.setHeaderColor?.(bg);
    app.setBackgroundColor?.(bg);
    if (linked || sent.current) return;
    sent.current = true;

    const res = await fetch("/api/telegram/miniapp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData: app.initData }),
    }).catch(() => undefined);
    const { result } = ((await res?.json().catch(() => ({}))) ?? {}) as { result?: string };
    if (result === "linked") {
      setNote("Telegram linked: your basket's orders now show up here.");
      router.refresh();
    } else if (result === "taken") {
      setNote("This Telegram account is already linked to a different Toss account.");
    }
  };

  return (
    <>
      {inTelegram && <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onReady={() => void onReady()} />}
      {note && (
        <p role="status" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-[8px] border border-border bg-surface-solid px-4 py-3 text-sm shadow-lg backdrop-blur">
          {note}
        </p>
      )}
    </>
  );
}
