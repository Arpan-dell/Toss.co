import { describe, expect, it } from "vitest";
import { languageRequest, translator } from ".";
import { HI } from "./hi";
import { HI_MANAGER } from "./hi-manager";

const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe("Hindi", () => {
  it("keeps every {placeholder} of the English", () => {
    for (const [en, hi] of Object.entries({ ...HI, ...HI_MANAGER })) expect(holes(hi), en).toEqual(holes(en));
  });

  it("has no empty lines", () => {
    for (const [en, hi] of Object.entries({ ...HI, ...HI_MANAGER })) expect(hi.trim(), en).not.toBe("");
  });

  it("translates, fills placeholders, and falls back to English", () => {
    const t = translator("hi");
    expect(t("Hi, {name}", { name: "Asha" })).toBe("नमस्ते, Asha");
    expect(t("A sentence nobody translated")).toBe("A sentence nobody translated");
    expect(translator("en")("Hi, {name}", { name: "Asha" })).toBe("Hi, Asha");
  });
});

describe("switching language from the chat", () => {
  it("understands Hindi, Hinglish and English requests", () => {
    expect(languageRequest("hindi mein karo")).toBe("hi");
    expect(languageRequest("Hindi")).toBe("hi");
    expect(languageRequest("हिंदी में बदलें")).toBe("hi");
    expect(languageRequest("switch to hindi")).toBe("hi");
    expect(languageRequest("Switch to English")).toBe("en");
    expect(languageRequest("english mein kar do")).toBe("en");
  });

  it("leaves other questions alone", () => {
    expect(languageRequest("where is ravi")).toBeNull();
    expect(languageRequest("how many hindi speaking customers")).toBeNull();
    expect(languageRequest("")).toBeNull();
  });
});
