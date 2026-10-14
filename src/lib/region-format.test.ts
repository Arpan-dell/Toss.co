import { describe, expect, it } from "vitest";
import { formatterFor, pricePerKgFrom, regionOf, toKg } from "./region-format";
import { billFor, countryOf, detectCountry, roundMoney } from "./regions";

describe("regions", () => {
  it("defaults older businesses (no country yet) to India", () => {
    expect(regionOf({ currency: "INR" })).toEqual({ country: "IN", currency: "INR", timezone: "Asia/Kolkata", unit: "kg" });
    expect(regionOf(null).currency).toBe("INR");
  });
  it("picks currency, unit and time zone from the country", () => {
    expect(regionOf({ country: "US", currency: "USD" })).toEqual({ country: "US", currency: "USD", timezone: "America/New_York", unit: "lb" });
    expect(regionOf({ country: "DE", currency: "EUR", weight_unit: "kg", timezone: "Europe/Berlin" }).unit).toBe("kg");
    expect(regionOf({ country: "US", currency: "USD", timezone: "Not/AZone" }).timezone).toBe("America/New_York");
  });
  it("detects the visitor's country from the geo header, then the browser language", () => {
    expect(detectCountry("US").code).toBe("US");
    expect(detectCountry("ZZ").currency).toBe("USD"); // unlisted country: dollars
    expect(detectCountry(null, "en-GB,en;q=0.9").code).toBe("GB");
    expect(detectCountry(null, null).code).toBe("IN");
    expect(countryOf("fr").currency).toBe("EUR");
  });
});

describe("money and weight", () => {
  const india = formatterFor(regionOf({ country: "IN", currency: "INR" }));
  const us = formatterFor(regionOf({ country: "US", currency: "USD" }));
  const de = formatterFor(regionOf({ country: "DE", currency: "EUR" }));
  it("formats like each country does", () => {
    expect(india.money(1250)).toBe("₹1,250");
    expect(us.money(26.27)).toBe("$26.27");
    expect(us.money(26)).toBe("$26");
    expect(us.money(26.5)).toBe("$26.50");
    expect(de.money(26.27).replace(/\s/g, " ")).toBe("26,27 €");
  });
  it("shows weight and price in the business's unit, stored in kg", () => {
    expect(india.weight(5.2)).toBe("5.2 kg");
    expect(us.weight(5.2)).toBe("11.5 lb");
    expect(india.rate(54)).toBe("₹54/kg");
    expect(us.rate(pricePerKgFrom(1.99, "lb"))).toBe("$1.99/lb");
    expect(toKg(10, "lb")).toBeCloseTo(4.536, 3);
  });
  it("rounds bills for the currency and applies the minimum order", () => {
    expect(roundMoney(26.2749, "USD")).toBe(26.27);
    expect(roundMoney(26.5, "INR")).toBe(27);
    expect(billFor(5.2, { pricePerKg: 54, currency: "INR" })).toBe(281);
    expect(billFor(2, { pricePerKg: pricePerKgFrom(1.99, "lb"), currency: "USD", minOrder: 30 })).toBe(30);
    expect(billFor(0, { pricePerKg: 54, currency: "INR", minOrder: 100 })).toBe(0); // nothing picked up, nothing owed
  });
  it("shows dates in the business's time zone", () => {
    const iso = "2026-10-14T20:30:00Z";
    expect(india.dateTime(iso)).toMatch(/15 Oct/); // 02:00 next day in India
    expect(us.dateTime(iso)).toMatch(/Oct 14/); // 16:30 in New York
  });
});
