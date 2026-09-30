"use client";

import { useEffect, useRef } from "react";

// Renders Telegram's official login button. On approval Telegram redirects the browser to
// /api/telegram/callback with signed fields, which the server verifies before linking.
export function TelegramLogin({ botUsername }: { botUsername: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "20");
    script.setAttribute("data-auth-url", `${window.location.origin}/api/telegram/callback`);
    script.setAttribute("data-request-access", "write");
    el.appendChild(script);
    return () => {
      el.innerHTML = "";
    };
  }, [botUsername]);

  return <div ref={ref} className="min-h-10" />;
}
