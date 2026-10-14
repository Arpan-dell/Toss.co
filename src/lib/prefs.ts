// How a customer likes their laundry done, saved once on their account and shown to the laundry with every pickup
// (customers.prefs, migration 0035). The common ones laundry apps offer: detergent (for sensitive skin, or their
// own), water temperature, drying, softener and how clothes come back.

export interface LaundryPrefs {
  detergent?: "regular" | "sensitive" | "eco" | "own";
  water?: "cold" | "warm" | "hot";
  dry?: "normal" | "low" | "hang";
  softener?: "yes" | "no";
  fold?: "folded" | "hangers";
  notes?: string;
}

export const PREF_OPTIONS = {
  detergent: { label: "Detergent", options: { regular: "Regular", sensitive: "Sensitive skin (fragrance-free)", eco: "Eco-friendly", own: "I'll put my own in the bag" } },
  water: { label: "Water", options: { cold: "Cold", warm: "Warm", hot: "Hot" } },
  dry: { label: "Drying", options: { normal: "Normal", low: "Low heat", hang: "Hang dry" } },
  softener: { label: "Fabric softener", options: { yes: "Yes", no: "No" } },
  fold: { label: "Return clothes", options: { folded: "Folded", hangers: "On hangers" } },
} as const;

type Key = keyof typeof PREF_OPTIONS;
export const PREF_KEYS = Object.keys(PREF_OPTIONS) as Key[];

/** The preferences from a form, keeping only known choices; notes up to 200 characters. */
export function readPrefs(get: (k: string) => string): LaundryPrefs {
  const out: Record<string, string> = {};
  for (const k of PREF_KEYS) {
    const v = get(k);
    if (v && v in PREF_OPTIONS[k].options) out[k] = v;
  }
  const notes = get("notes").replace(/\s+/g, " ").trim().slice(0, 200);
  if (notes) out.notes = notes;
  return out as LaundryPrefs;
}

/** "Sensitive skin detergent · Cold water · Hang dry", for the laundry's order page. Empty when nothing is set. */
export function prefsSummary(p: LaundryPrefs | null | undefined): string[] {
  if (!p) return [];
  const parts: string[] = [];
  for (const k of PREF_KEYS) {
    const v = p[k] as string | undefined;
    if (!v) continue;
    const label = (PREF_OPTIONS[k].options as Record<string, string>)[v];
    if (!label) continue;
    parts.push(
      k === "detergent" ? (v === "own" ? "Customer's own detergent" : `${label} detergent`)
      : k === "water" ? `${label} water`
      : k === "softener" ? (v === "yes" ? "Softener" : "No softener")
      : k === "fold" ? (v === "hangers" ? "Return on hangers" : "Return folded")
      : label,
    );
  }
  return parts;
}
