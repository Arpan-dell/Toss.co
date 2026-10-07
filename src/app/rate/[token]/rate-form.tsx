"use client";

import { useActionState, useState } from "react";
import { Star } from "@phosphor-icons/react";
import { submitRating } from "@/lib/actions/service";

export function RateForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(submitRating, {});
  const [stars, setStars] = useState(0);
  if (state.message) {
    return (
      <div className="mt-4 space-y-3" role="status">
        <p className="font-semibold text-good">{state.message}</p>
        {state.review && (
          <a href={state.review} target="_blank" rel="noreferrer" className="btn-primary inline-flex rounded-full px-5 py-2.5 text-sm font-semibold">
            Share it on Google ★
          </a>
        )}
      </div>
    );
  }
  return (
    <form action={action} className="mt-5 space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="rating" value={stars || ""} />
      <div className="flex justify-center gap-1.5" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => setStars(n)}
            className="rounded-full p-1 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <Star size={36} weight={n <= stars ? "fill" : "regular"} className={n <= stars ? "text-warn" : "text-muted"} />
          </button>
        ))}
      </div>
      {stars > 0 && stars <= 3 && (
        <textarea
          name="comment"
          rows={3}
          maxLength={500}
          placeholder="What could they do better? (optional)"
          className="w-full rounded-[8px] border border-border bg-ink/[0.03] px-3 py-2 text-sm focus:border-accent/60 focus:outline-none"
        />
      )}
      {state.error && (
        <p role="alert" className="text-sm text-critical">
          {state.error}
        </p>
      )}
      <button disabled={pending || stars === 0} className="btn-primary w-full rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-50">
        {pending ? "Sending…" : "Send rating"}
      </button>
    </form>
  );
}
