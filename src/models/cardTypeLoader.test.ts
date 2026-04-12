import { describe, it, expect } from "vitest";
import { parseCardTypeJson, mergeCardTypes, extractSlugFromPath } from "./cardTypeLoader";
import type { CardType } from "./types";

describe("extractSlugFromPath", () => {
  it("extracts slug from a glob path", () => {
    expect(extractSlugFromPath("../assets/card-types/amex_platinum.json")).toBe("amex_platinum");
  });

  it("extracts slug from a nested path", () => {
    expect(extractSlugFromPath("/foo/bar/chase_sapphire_reserve.json")).toBe("chase_sapphire_reserve");
  });
});

describe("parseCardTypeJson", () => {
  const validJson = {
    slug: "test_card",
    name: "Test Card",
    defaultAnnualFee: 100,
    color: "#FF0000",
    defaultBenefits: [],
  };

  it("returns a valid CardType from well-formed JSON", () => {
    const result = parseCardTypeJson(validJson);
    expect(result.slug).toBe("test_card");
    expect(result.name).toBe("Test Card");
    expect(result.defaultAnnualFee).toBe(100);
  });

  it("throws on missing slug", () => {
    const bad = { ...validJson, slug: undefined };
    expect(() => parseCardTypeJson(bad)).toThrow("slug");
  });

  it("throws on missing name", () => {
    const bad = { ...validJson, name: undefined };
    expect(() => parseCardTypeJson(bad)).toThrow("name");
  });

  it("throws on missing color", () => {
    const bad = { ...validJson, color: undefined };
    expect(() => parseCardTypeJson(bad)).toThrow("color");
  });

  it("defaults defaultAnnualFee to 0 if missing", () => {
    const noFee = { ...validJson, defaultAnnualFee: undefined };
    const result = parseCardTypeJson(noFee);
    expect(result.defaultAnnualFee).toBe(0);
  });
});

describe("mergeCardTypes", () => {
  const builtin: CardType = {
    slug: "builtin_card",
    name: "Built-in",
    defaultAnnualFee: 100,
    color: "#000",
    isBuiltin: true,
    defaultBenefits: [],
  };

  const userCard: CardType = {
    slug: "user_card",
    name: "User Card",
    defaultAnnualFee: 50,
    color: "#FFF",
    isBuiltin: false,
    defaultBenefits: [],
  };

  it("merges built-in and user card types", () => {
    const result = mergeCardTypes([builtin], [userCard]);
    expect(result).toHaveLength(2);
    expect(result.find((c) => c.slug === "builtin_card")?.isBuiltin).toBe(true);
    expect(result.find((c) => c.slug === "user_card")?.isBuiltin).toBe(false);
  });

  it("rejects user card with slug collision against built-in", () => {
    const collision: CardType = { ...userCard, slug: "builtin_card" };
    expect(() => mergeCardTypes([builtin], [collision])).toThrow("builtin_card");
  });

  it("returns only built-in when no user cards", () => {
    const result = mergeCardTypes([builtin], []);
    expect(result).toHaveLength(1);
  });
});
