import { describe, expect, it } from "vitest";
import { bagTag, bagsLine, isSorted, sortedTotal, washQueue } from "./sorting";

describe("whites and coloured bags", () => {
  it("knows whether an order was sorted", () => {
    expect(isSorted({})).toBe(false);
    expect(isSorted({ whitesKg: 0, colouredKg: 3 })).toBe(true);
  });

  it("tags bags by order number", () => {
    expect(bagTag(104, "WHITES")).toBe("#104-W");
    expect(bagTag(104, "COLOURED")).toBe("#104-C");
  });

  it("describes the bags, leaving out an empty one", () => {
    expect(bagsLine({ whitesKg: 2.1, colouredKg: 3.4 })).toBe("Whites 2.1 kg · Coloured 3.4 kg");
    expect(bagsLine({ whitesKg: 0, colouredKg: 3.456 }, true)).toBe("🎨 Coloured 3.46 kg");
    expect(bagsLine({})).toBe("");
  });

  it("bills the sum, and needs at least one bag with clothes", () => {
    expect(sortedTotal(2.1, 3.4)).toBe(5.5);
    expect(sortedTotal(0, 4)).toBe(4);
    expect(sortedTotal(0, 0)).toBeNull();
  });

  it("totals what is still to wash, by kind", () => {
    const q = washQueue([
      { status: "COMPLETED", weightKg: 5, whitesKg: 2, colouredKg: 3 },
      { status: "COMPLETED", weightKg: 4, whitesKg: 0, colouredKg: 4 },
      { status: "COMPLETED", weightKg: 6 }, // not sorted
      { status: "COMPLETED", weightKg: 9, whitesKg: 9, colouredKg: 0, readyAt: "2026-10-07T10:00:00Z" }, // already ready
      { status: "ACCEPTED", weightKg: 7 }, // not picked up yet
    ]);
    expect(q).toEqual({ whites: 2, coloured: 7, unsorted: 6, orders: 3 });
  });
});
