import { describe, expect, it } from "vitest";
import { crc16, epcPayload, isValidIban, methodName, payOptions, paypalLink, pixPayload, venmoLink } from "./pay-methods";

describe("payment methods outside UPI", () => {
  it("checks IBANs with mod 97, so a typo is caught", () => {
    expect(isValidIban("DE89 3704 0044 0532 0130 00")).toBe(true);
    expect(isValidIban("GB82WEST12345698765432")).toBe(true);
    expect(isValidIban("DE89 3704 0044 0532 0130 01")).toBe(false);
    expect(isValidIban("hello")).toBe(false);
  });
  it("builds links with the amount filled in", () => {
    expect(paypalLink("freshlaundry", 26.27, "usd")).toBe("https://paypal.me/freshlaundry/26.27USD");
    expect(paypalLink("freshlaundry", 30, "EUR")).toBe("https://paypal.me/freshlaundry/30EUR");
    expect(venmoLink("fresh-nyc", 26.5, "Toss pickup 104")).toBe("https://venmo.com/fresh-nyc?txn=pay&amount=26.50&note=Toss+pickup+104");
  });
  it("writes the EPC (SEPA) QR payload line by line", () => {
    expect(epcPayload({ name: "Waschsalon Mitte", iban: "DE89 3704 0044 0532 0130 00", amount: 26.27, text: "Toss 104" }).split("\n")).toEqual([
      "BCD", "002", "1", "SCT", "", "Waschsalon Mitte", "DE89370400440532013000", "EUR26.27", "", "", "Toss 104",
    ]);
  });
  it("uses the standard CRC for Pix codes", () => {
    expect(crc16("123456789")).toBe("29B1"); // CRC-16/CCITT-FALSE check value
    const code = pixPayload({ key: "fresh@lavanderia.com.br", name: "Lavanderia São João", city: "São Paulo", amount: 42.5, txid: "TOSS-104" });
    expect(code).toMatch(/^000201/);
    expect(code).toContain("0014br.gov.bcb.pix");
    expect(code).toContain("540542.50");
    expect(code).toContain("5919Lavanderia Sao Joao");
    expect(code.slice(-4)).toBe(crc16(code.slice(0, -4)));
  });
  it("lists a business's methods in the country's order, with cash last", () => {
    const opts = payOptions(
      { paypal: "fresh", venmo: "fresh-nyc", zelle: "pay@fresh.com" },
      ["venmo", "cashapp", "zelle", "paypal", "link", "cash"],
      { amount: 26.27, currency: "USD", payee: "Fresh", note: "Toss pickup 104", reference: "TOSS104" },
    );
    expect(opts.map((o) => o.id)).toEqual(["venmo", "zelle", "paypal", "cash"]);
    expect(opts.find((o) => o.id === "sepa")).toBeUndefined();
    // Venmo is US dollars only; cash can be turned off
    expect(payOptions({ venmo: "x", cash: false }, ["venmo"], { amount: 1, currency: "EUR", payee: "", note: "", reference: "" })).toEqual([]);
    expect(methodName("PAYPAL")).toBe("PayPal");
  });
});
