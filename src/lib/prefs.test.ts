import { describe, expect, it } from "vitest";
import { prefsSummary, readPrefs } from "./prefs";

describe("laundry preferences", () => {
  it("keeps only known choices and trims the note", () => {
    const form: Record<string, string> = { detergent: "sensitive", water: "boiling", dry: "hang", notes: "  wash the red   shirt apart " };
    expect(readPrefs((k) => form[k] ?? "")).toEqual({ detergent: "sensitive", dry: "hang", notes: "wash the red shirt apart" });
  });
  it("reads as a short list for the laundry", () => {
    expect(prefsSummary({ detergent: "own", water: "cold", softener: "no", fold: "hangers" })).toEqual([
      "Customer's own detergent",
      "Cold water",
      "No softener",
      "Return on hangers",
    ]);
    expect(prefsSummary(undefined)).toEqual([]);
  });
});
