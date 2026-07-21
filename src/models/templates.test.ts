import { describe, it, expect } from "vitest";
import { BUILTIN_CARD_TYPES } from "./templates";

const findCard = (slug: string) => {
  const card = BUILTIN_CARD_TYPES.find((c) => c.slug === slug);
  if (!card) throw new Error(`Card ${slug} not found`);
  return card;
};

describe("BUILTIN_CARD_TYPES", () => {
  it("contains 6 card types", () => {
    expect(BUILTIN_CARD_TYPES).toHaveLength(6);
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

  it("Uber One credit resets per calendar year, not monthly (v3)", () => {
    // Amex/Uber terms: "up to $120 in statement credits each calendar year",
    // regardless of monthly vs annual membership billing. Was wrongly modeled
    // as `subscription`, which cycles monthly ($120 available every month).
    const platinum = findCard("amex_platinum");
    expect(platinum.version).toBeGreaterThanOrEqual(3);

    const uberOne = platinum.defaultBenefits.find(
      (b) => b.templateBenefitId === "amex_platinum.uber_one",
    );
    expect(uberOne).toBeDefined();
    if (!uberOne) return;
    expect(uberOne.faceValue).toBe(120);
    expect(uberOne.resetType).toBe("calendar");
    expect(uberOne.resetConfig.period).toBe("annual");
  });

  it("has Chase Sapphire Reserve with annual fee $795", () => {
    const reserve = findCard("chase_sapphire_reserve");
    expect(reserve.defaultAnnualFee).toBe(795);
    expect(reserve.defaultBenefits).toHaveLength(10);
  });

  it("has Chase Sapphire Preferred refreshed (v3): $100 hotel credit, $120 trusted-traveler, 1yr Apple TV", () => {
    const csp = findCard("chase_sapphire_preferred");
    expect(csp.defaultAnnualFee).toBe(95);
    expect(csp.version).toBeGreaterThanOrEqual(3);

    const byId = (id: string) =>
      csp.defaultBenefits.find((b) => b.templateBenefitId === `chase_sapphire_preferred.${id}`);

    // Hotel credit doubled $50 -> $100, still anniversary-based
    const hotel = byId("hotel_credit");
    expect(hotel?.faceValue).toBe(100);
    expect(hotel?.resetType).toBe("anniversary");

    // New $120 Global Entry / TSA PreCheck / NEXUS credit, every 4 years
    const globalEntry = byId("global_entry");
    expect(globalEntry?.faceValue).toBe(120);
    expect(globalEntry?.resetType).toBe("calendar");
    expect(globalEntry?.resetConfig.period).toBe("every_4_years");

    // New one-time 1-year Apple TV promo, activation deadline 2026-12-31
    const appleTv = byId("apple_tv");
    expect(appleTv?.resetType).toBe("one_time");
    expect(appleTv?.resetConfig.expiresDate).toBe("2026-12-31");
    expect(appleTv?.resetConfig.availableFromDate).toBe("2026-06-15");

    // Legacy DashPass benefits retained unchanged
    expect(byId("dashpass_promo")?.faceValue).toBe(10);
    expect(byId("dashpass")?.faceValue).toBe(120);
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

  it("every built-in card type has version >= 1", () => {
    for (const ct of BUILTIN_CARD_TYPES) {
      expect(ct.version, `${ct.slug} missing version`).toBeGreaterThanOrEqual(1);
    }
  });

  it("every built-in benefit has a non-empty templateBenefitId", () => {
    for (const ct of BUILTIN_CARD_TYPES) {
      for (const b of ct.defaultBenefits) {
        expect(b.templateBenefitId, `${ct.slug}/${b.name} missing templateBenefitId`).toBeTruthy();
      }
    }
  });

  it("templateBenefitIds are unique within each card type", () => {
    for (const ct of BUILTIN_CARD_TYPES) {
      const ids = ct.defaultBenefits.map((b) => b.templateBenefitId);
      expect(new Set(ids).size, `${ct.slug} has duplicate templateBenefitIds`).toBe(ids.length);
    }
  });
});
