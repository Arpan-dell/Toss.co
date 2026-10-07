import { describe, expect, it } from "vitest";
import { dueLabel, isLate } from "./turnaround";

const now = new Date("2026-10-08T12:00:00Z");

describe("turnaround", () => {
  it("is late only when picked up, not ready, and past the promise", () => {
    expect(isLate({ status: "COMPLETED", readyBy: "2026-10-08T09:00:00Z" }, now)).toBe(true);
    expect(isLate({ status: "COMPLETED", readyBy: "2026-10-08T09:00:00Z", readyAt: "2026-10-08T10:00:00Z" }, now)).toBe(false);
    expect(isLate({ status: "COMPLETED", readyBy: "2026-10-08T15:00:00Z" }, now)).toBe(false);
    expect(isLate({ status: "ACCEPTED", readyBy: "2026-10-08T09:00:00Z" }, now)).toBe(false);
  });

  it("says how long until or since the promise", () => {
    expect(dueLabel({ status: "COMPLETED", readyBy: "2026-10-08T17:00:00Z" }, now)).toBe("Due in 5 h");
    expect(dueLabel({ status: "COMPLETED", readyBy: "2026-10-11T12:00:00Z" }, now)).toBe("Due in 3 days");
    expect(dueLabel({ status: "COMPLETED", readyBy: "2026-10-08T09:00:00Z" }, now)).toBe("Late by 3 h");
    expect(dueLabel({ status: "COMPLETED", readyBy: "2026-10-08T09:00:00Z", readyAt: "2026-10-08T11:00:00Z" }, now)).toBe("Ready");
    expect(dueLabel({ status: "PENDING" }, now)).toBeNull();
  });
});
