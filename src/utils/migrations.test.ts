import { describe, expect, it } from "vitest";
import type { Benefit, CreditCard } from "../models/types";
import { migrateCards } from "./migrations";

// Legacy benefits on disk still carry autoRecur/cancelledMonths; tests feed
// them through migrateCards to verify the reader strips and converts them.
type LegacyBenefit = Benefit & { autoRecur?: boolean; cancelledMonths?: string[] };

const makeBenefit = (overrides: Partial<LegacyBenefit> = {}): LegacyBenefit => ({
  id: "b1",
  name: "benefit",
  description: "",
  faceValue: 0,
  category: "other",
  resetType: "one_time",
  resetConfig: {},
  isHidden: false,
  rolloverable: false,
  rolloverMaxYears: 0,
  usageRecords: [],
  ...overrides,
});

const makeCard = (benefits: LegacyBenefit[]): CreditCard => ({
  id: "c1",
  owner: "me",
  cardTypeSlug: "chase_marriott_boundless",
  annualFee: 95,
  cardOpenDate: "2024-01-01",
  color: "#000",
  isEnabled: true,
  benefits: benefits as Benefit[],
});

describe("migrateCards - Marriott H2 airline credit availableFromDate", () => {
  it("patches legacy H2 benefit without availableFromDate", () => {
    const benefit = makeBenefit({
      name: "$50 Airline Credit (H2 2026)",
      resetType: "one_time",
      resetConfig: { expiresDate: "2026-12-31" },
    });
    const [card] = migrateCards([makeCard([benefit])]);
    expect(card.benefits[0].resetConfig.availableFromDate).toBe("2026-07-01");
    expect(card.benefits[0].resetConfig.expiresDate).toBe("2026-12-31");
  });

  it("leaves H2 benefit alone when availableFromDate is already set", () => {
    const benefit = makeBenefit({
      name: "$50 Airline Credit (H2 2026)",
      resetType: "one_time",
      resetConfig: { availableFromDate: "2026-08-01", expiresDate: "2026-12-31" },
    });
    const [card] = migrateCards([makeCard([benefit])]);
    expect(card.benefits[0].resetConfig.availableFromDate).toBe("2026-08-01");
  });

  it("does not patch benefits with different names", () => {
    const benefit = makeBenefit({
      name: "$50 Airline Credit (H1 2026)",
      resetType: "one_time",
      resetConfig: { expiresDate: "2026-06-30" },
    });
    const [card] = migrateCards([makeCard([benefit])]);
    expect(card.benefits[0].resetConfig.availableFromDate).toBeUndefined();
  });

  it("is idempotent", () => {
    const benefit = makeBenefit({
      name: "$50 Airline Credit (H2 2026)",
      resetType: "one_time",
      resetConfig: { expiresDate: "2026-12-31" },
    });
    const once = migrateCards([makeCard([benefit])]);
    const twice = migrateCards(once);
    expect(twice[0].benefits[0].resetConfig.availableFromDate).toBe("2026-07-01");
    expect(twice).toEqual(once);
  });
});

describe("migrateCards - autoRecur → propagateNext", () => {
  it("sets propagateNext=true on monthly records for autoRecur=true benefits, except cancelledMonths", () => {
    const benefit = makeBenefit({
      name: "$25/mo Digital",
      resetType: "subscription",
      resetConfig: {},
      autoRecur: true,
      cancelledMonths: ["2026-02"],
      usageRecords: [
        { usedDate: "2026-01-05", faceValue: 25, actualValue: 25 },
        { usedDate: "2026-02-10", faceValue: 25, actualValue: 20 },
        { usedDate: "2026-03-03", faceValue: 25, actualValue: 25 },
      ],
    });
    const [card] = migrateCards([makeCard([benefit])]);
    const [r1, r2, r3] = card.benefits[0].usageRecords;
    expect(r1.propagateNext).toBe(true);
    expect(r2.propagateNext).toBeUndefined();
    expect(r3.propagateNext).toBe(true);
    const migrated = card.benefits[0] as LegacyBenefit;
    expect(migrated.autoRecur).toBeUndefined();
    expect(migrated.cancelledMonths).toBeUndefined();
  });

  it("drops cancelledMonths even on autoRecur=false benefits", () => {
    const benefit = makeBenefit({
      resetType: "subscription",
      autoRecur: false,
      cancelledMonths: ["2026-01"],
      usageRecords: [{ usedDate: "2026-01-05", faceValue: 25, actualValue: 25 }],
    });
    const [card] = migrateCards([makeCard([benefit])]);
    expect((card.benefits[0] as LegacyBenefit).cancelledMonths).toBeUndefined();
    expect(card.benefits[0].usageRecords[0].propagateNext).toBeUndefined();
  });

  it("leaves already-propagated records untouched (idempotent)", () => {
    const benefit = makeBenefit({
      resetType: "subscription",
      autoRecur: false,
      usageRecords: [
        { usedDate: "2026-03-01", faceValue: 25, actualValue: 25, propagateNext: true },
      ],
    });
    const once = migrateCards([makeCard([benefit])]);
    const twice = migrateCards(once);
    expect(twice).toEqual(once);
  });

  it("is idempotent when legacy fields already stripped", () => {
    const benefit = makeBenefit({
      resetType: "subscription",
      autoRecur: true,
      cancelledMonths: ["2026-02"],
      usageRecords: [
        { usedDate: "2026-01-05", faceValue: 25, actualValue: 25 },
        { usedDate: "2026-02-10", faceValue: 25, actualValue: 20 },
      ],
    });
    const once = migrateCards([makeCard([benefit])]);
    const twice = migrateCards(once);
    expect(twice).toEqual(once);
  });
});
