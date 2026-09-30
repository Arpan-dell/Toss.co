"use client";

import { useState } from "react";

// Phase D: POST to createCheckoutSession, then redirect to the Stripe Checkout URL.
export function PayButton({ amountLabel }: { amountLabel: string }) {
  const [clicked, setClicked] = useState(false);
  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={() => setClicked(true)} className="btn-primary rounded-full px-5 py-2 text-sm font-medium">
        Pay {amountLabel} →
      </button>
      {clicked && <p className="text-xs text-muted">Stripe Checkout gets connected in Phase D.</p>}
    </div>
  );
}
