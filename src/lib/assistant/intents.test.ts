import { describe, expect, it } from "vitest";
import { differs, isPasswordRequest, matchIntent, newPasswordFrom, nowText, suggestions, understand } from "./intents";

describe("assistant quick router", () => {
  it("switches the theme", () => {
    expect(matchIntent("switch to dark mode", "CUSTOMER")).toEqual({ tool: "theme", mode: "dark" });
    expect(matchIntent("Turn on dark mode please", "MANAGER")).toEqual({ tool: "theme", mode: "dark" });
    expect(matchIntent("go to light mode", "OWNER")).toEqual({ tool: "theme", mode: "light" });
    expect(matchIntent("change the theme", "CUSTOMER")).toEqual({ tool: "theme", mode: "toggle" });
  });

  it("recognises password changes and keeps the new password out of the request", () => {
    expect(isPasswordRequest("change password to Basket@2026")).toBe(true);
    expect(newPasswordFrom("change my password to Basket@2026")).toBe("Basket@2026");
    expect(newPasswordFrom("change password")).toBeUndefined();
    expect(matchIntent("I want to change my password", "CUSTOMER")).toEqual({ tool: "password", newPassword: undefined });
    expect(isPasswordRequest("what is my password policy")).toBe(false);
  });

  it("finds a driver by name for managers only", () => {
    expect(matchIntent("where is ravi now?", "MANAGER")).toEqual({ tool: "driver", name: "ravi" });
    expect(matchIntent("Where's Vikram Singh", "MANAGER")).toEqual({ tool: "driver", name: "vikram singh" });
    expect(matchIntent("locate driver amit", "MANAGER")).toEqual({ tool: "driver", name: "amit" });
    expect(matchIntent("where are my drivers", "MANAGER")).toEqual({ tool: "drivers" });
    expect(matchIntent("where is ravi", "CUSTOMER")).toBeNull();
  });

  it("reads orders and summaries", () => {
    expect(matchIntent("show order #104", "MANAGER")).toEqual({ tool: "order", number: 104 });
    expect(matchIntent("what do I owe?", "CUSTOMER")).toEqual({ tool: "orders", filter: "unpaid" });
    expect(matchIntent("how is my business today", "MANAGER")).toEqual({ tool: "overview" });
    expect(matchIntent("what needs attention", "MANAGER")).toEqual({ tool: "attention" });
    expect(matchIntent("how full is my basket", "CUSTOMER")).toEqual({ tool: "basket" });
    expect(matchIntent("my credit balance", "CUSTOMER")).toEqual({ tool: "credit" });
  });

  it("opens only the pages a role has", () => {
    expect(matchIntent("open payments", "MANAGER")).toEqual({ tool: "go", href: "/admin/payments", label: "Payments" });
    expect(matchIntent("take me to settings", "CUSTOMER")).toEqual({ tool: "go", href: "/app/settings", label: "Settings" });
    expect(matchIntent("open fleet", "CUSTOMER")).toBeNull();
  });

  it("leaves everything else to the AI router", () => {
    expect(matchIntent("how does tare work?", "CUSTOMER")).toBeNull();
  });
});

describe("did you mean", () => {
  it("fixes typos in the assistant's words", () => {
    expect(understand("wher is ravi now")).toBe("where is ravi now");
    expect(understand("swich to drak mod")).toBe("switch to dark mode");
    expect(understand("show unpayd bils")).toBe("show unpaid bills");
  });

  it("fixes driver names it's given", () => {
    expect(understand("where is rvai", ["Ravi", "Amit"])).toBe("where is ravi");
  });

  it("reads common Hinglish", () => {
    expect(understand("ravi kahan hai")).toBe("where is ravi");
    expect(understand("aaj ka hisaab")).toBe("today's summary");
    expect(understand("dark mode kar do")).toBe("switch to dark mode");
    expect(understand("password badlo")).toBe("change password");
  });

  it("routes corrected text to the right tool", () => {
    expect(matchIntent(understand("ravi kahan hai"), "MANAGER")).toEqual({ tool: "driver", name: "ravi" });
    expect(matchIntent(understand("swich to drak mod"), "CUSTOMER")).toEqual({ tool: "theme", mode: "dark" });
    expect(matchIntent(understand("kitna paisa baaki hai"), "MANAGER")).toEqual({ tool: "orders", filter: "unpaid" });
    expect(matchIntent(understand("aaj ka hisaab"), "MANAGER")).toEqual({ tool: "overview" });
  });

  it("keeps a misspelt password request's password exact", () => {
    expect(newPasswordFrom("chnage pasword to Basket@2026")).toBe("Basket@2026");
  });

  it("only flags a real change and suggests close questions", () => {
    expect(differs("Where is Ravi?", "where is ravi")).toBe(false);
    expect(differs("wher is ravi", "where is ravi")).toBe(true);
    expect(suggestions("unpaid stuff", "MANAGER")[0]).toBe("Show unpaid bills");
    expect(suggestions("blah", "OWNER")).toHaveLength(3);
  });
});

describe("no more keyword guessing", () => {
  it("answers the date instead of the business summary", () => {
    expect(matchIntent("what is the date today", "MANAGER")).toEqual({ tool: "now" });
    expect(matchIntent("what time is it", "CUSTOMER")).toEqual({ tool: "now" });
    expect(nowText(new Date("2026-10-11T09:05:00Z"))).toBe("Today is Sunday, 11 October 2026. It's 2:35 pm in India.");
  });

  it("sends general questions to the AI even when they mention a data word", () => {
    expect(matchIntent("how do I add drivers", "MANAGER")).toBeNull();
    expect(matchIntent("how do I tare my basket", "CUSTOMER")).toBeNull();
    expect(matchIntent("why is my credit lower", "CUSTOMER")).toBeNull();
    expect(matchIntent("today is busy", "MANAGER")).toBeNull();
  });

  it("knows which theme you're asking about", () => {
    expect(matchIntent("which mode am I in?", "CUSTOMER")).toEqual({ tool: "theme", mode: "status" });
    expect(matchIntent("am i in dark mode", "MANAGER")).toEqual({ tool: "theme", mode: "status" });
    expect(matchIntent("dark mode", "OWNER")).toEqual({ tool: "theme", mode: "dark" });
    expect(matchIntent("what is dark mode", "OWNER")).toBeNull();
  });
});
