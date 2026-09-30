"use client";

import { useState } from "react";
import { burstFromEvent } from "@/lib/fx";

// Phase D: POST to createCheckoutSession, then redirect to the Stripe Checkout URL.
export function PayButton({ amountLabel }: { amountLabel: string }) {
  const [clicked, setClicked] = useState(false);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={(e) => {
          burstFromEvent(e);
          setClicked(true);
        }}
        className="btn-primary rounded-full px-5 py-2 text-sm font-medium"
      >
        Pay {amountLabel} →
      </button>
      {clicked && (
        <p className="text-xs text-muted" style={{ animation: "fade-up 0.4s ease both" }}>
          Stripe Checkout gets connected in Phase D.
        </p>
      )}
    </div>
  );
}
