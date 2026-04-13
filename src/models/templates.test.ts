import { describe, it, expect } from "vitest";
import { BUILTIN_CARD_TYPES } from "./templates";

const findCard = (slug: string) => {
  const card = BUILTIN_CARD_TYPES.find((c) => c.slug === slug);
  if (!card) throw new Error(`Card ${slug} not found`);
  return card;
};

describe("BUILTIN_CARD_TYPES", () => {
  it("contains 5 card types", () => {
    expect(BUILTIN_CARD_TYPES).toHaveLength(5);
  });

  it("has Amex Platinum with annual fee $895", () => {
    const platinum = findCard("amex_platinum");
    expect(platinum.defaultAnnualFee).toBe(895);
    expect(platinum.defaultBenefits).toHaveLength(12);
  });

  it("FHR benefit is rolloverable with semi_annual period", () => {
    const platinum = findCard("amex_platinum");
    const fhr = platinum.defaultBenefits.find((b) => b.name.includes("FHR"));
    expect(fhr).toBeDefined();
    if (!fhr) return;
    expect(fhr.resetConfig.period).toBe("semi_annual");
    expect(fhr.rolloverable).toBe(true);
    expect(fhr.rolloverMaxYears).toBe(2);
  });

  it("has Chase Sapphire Reserve with annual fee $795", () => {
    const reserve = findCard("chase_sapphire_reserve");
    expect(reserve.defaultAnnualFee).toBe(795);
    expect(reserve.defaultBenefits).toHaveLength(10);
  });

  it("has Chase Marriott Boundless with 2 one_time benefits with correct expiresDate", () => {
    const marriott = findCard("chase_marriott_boundless");
    expect(marriott.defaultAnnualFee).toBe(95);

    const oneTimeBenefits = marriott.defaultBenefits.filter((b) => b.resetType === "one_time");
    expect(oneTimeBenefits).toHaveLength(2);
    expect(oneTimeBenefits[0].resetConfig.expiresDate).toBe("2026-06-30");
    expect(oneTimeBenefits[1].resetConfig.expiresDate).toBe("2026-12-31");
  });

  it("all have isBuiltin === true", () => {
    for (const ct of BUILTIN_CARD_TYPES) {
      expect(ct.isBuiltin).toBe(true);
    }
  });

  it("all benefits have valid resetType", () => {
    const validTypes = new Set([
      "calendar",
      "anniversary",
      "since_last_use",
      "subscription",
      "one_time",
    ]);
    for (const card of BUILTIN_CARD_TYPES) {
      for (const benefit of card.defaultBenefits) {
        expect(validTypes.has(benefit.resetType)).toBe(true);
      }
    }
  });

  it("calendar benefits with applicableMonths have valid month numbers (1-12)", () => {
    for (const card of BUILTIN_CARD_TYPES) {
      for (const benefit of card.defaultBenefits) {
        if (benefit.resetConfig.applicableMonths) {
          for (const month of benefit.resetConfig.applicableMonths) {
            expect(month).toBeGreaterThanOrEqual(1);
            expect(month).toBeLessThanOrEqual(12);
          }
        }
      }
    }
  });

  it("one_time benefits with expiresDate have valid ISO date format", () => {
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
    for (const card of BUILTIN_CARD_TYPES) {
      for (const benefit of card.defaultBenefits) {
        if (benefit.resetType === "one_time" && benefit.resetConfig.expiresDate) {
          expect(benefit.resetConfig.expiresDate).toMatch(isoDateRegex);
        }
      }
    }
  });
});
