import { describe, expect, it } from "vitest";
import { isPasswordRequest, matchIntent, newPasswordFrom } from "./intents";

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
