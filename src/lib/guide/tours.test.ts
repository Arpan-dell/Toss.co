import { describe, expect, it } from "vitest";
import { TOURS, tourRequest, tourSteps } from "./tours";

describe("Tossy's tours", () => {
  it("recognises tour requests in English and Hinglish", () => {
    expect(tourRequest("Show me around")).toBe("all");
    expect(tourRequest("how do I use this website?")).toBe("all");
    expect(tourRequest("give me a tour")).toBe("all");
    expect(tourRequest("ye website kaise use kare")).toBe("all");
    expect(tourRequest("samjhao")).toBe("all");
    expect(tourRequest("Explain this page")).toBe("page");
    expect(tourRequest("yeh page kya hai")).toBe("page");
    expect(tourRequest("what is this page about")).toBe("page");
  });

  it("leaves everything else to the assistant", () => {
    expect(tourRequest("where is ravi")).toBeNull();
    expect(tourRequest("today's summary")).toBeNull();
    expect(tourRequest("switch to dark mode")).toBeNull();
    expect(tourRequest("")).toBeNull();
  });

  it("explains just the page on screen, without the hello and goodbye", () => {
    const fleet = tourSteps("MANAGER", "page", "/admin/fleet");
    expect(fleet.map((s) => s.title)).toEqual(["Your drivers", "Baskets"]);
    expect(tourSteps("MANAGER", "page", "/admin").every((s) => s.path === "/admin" && s.title !== "Hi, I'm Tossy!")).toBe(true);
    expect(tourSteps("MANAGER", "page", "/admin/nowhere")).toEqual([]);
    expect(tourSteps("OWNER", "all", "/owner")).toEqual([]);
  });

  it("starts with a hello in the middle of the screen and ends at Tossy's button", () => {
    for (const steps of Object.values(TOURS)) {
      expect(steps[0].target).toBeUndefined();
      expect(steps.at(-1)?.target).toBe('[data-guide="assistant"]');
      // only pages inside the portal, where Tossy (and so the tour) stays on screen
      expect(steps.every((s) => s.path.startsWith("/admin") || s.path.startsWith("/app"))).toBe(true);
    }
  });
});
