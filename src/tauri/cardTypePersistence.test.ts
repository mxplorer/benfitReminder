import { describe, it, expect } from "vitest";
import { parseUserCardTypeDir, serializeUserCardType } from "./cardTypePersistence";
import type { CardType } from "../models/types";

describe("parseUserCardTypeDir", () => {
  it("pairs JSON files with optional WebP images", () => {
    const files = ["custom_card.json", "custom_card.webp", "other_card.json"];
    const result = parseUserCardTypeDir(files);
    expect(result).toEqual([
      { slug: "custom_card", jsonFile: "custom_card.json", imageFile: "custom_card.webp" },
      { slug: "other_card", jsonFile: "other_card.json", imageFile: undefined },
    ]);
  });

  it("ignores non-JSON/WebP files", () => {
    const files = ["readme.txt", "card.json", "card.png"];
    const result = parseUserCardTypeDir(files);
    expect(result).toEqual([
      { slug: "card", jsonFile: "card.json", imageFile: undefined },
    ]);
  });
});

describe("serializeUserCardType", () => {
  const baseCardType = (overrides: Partial<CardType> = {}): CardType => ({
    slug: "my_card",
    name: "My Card",
    defaultAnnualFee: 0,
    color: "#fff",
    isBuiltin: false,
    version: 1,
    defaultBenefits: [
      {
        templateBenefitId: "my_card.benefit_a",
        name: "Benefit A",
        description: "Desc",
        faceValue: 100,
        category: "other",
        resetType: "one_time",
        resetConfig: {},
      },
    ],
    ...overrides,
  });

  it("includes version field in serialized output", () => {
    const json = serializeUserCardType(baseCardType({ version: 3 }));
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.version).toBe(3);
  });

  it("includes templateBenefitId on each benefit", () => {
    const json = serializeUserCardType(baseCardType());
    const parsed = JSON.parse(json) as { defaultBenefits: { templateBenefitId: string }[] };
    expect(parsed.defaultBenefits[0].templateBenefitId).toBe("my_card.benefit_a");
  });

  it("excludes derived fields (isBuiltin, image)", () => {
    const json = serializeUserCardType(baseCardType({ image: "http://example.com/img.webp" }));
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.isBuiltin).toBeUndefined();
    expect(parsed.image).toBeUndefined();
  });
});
