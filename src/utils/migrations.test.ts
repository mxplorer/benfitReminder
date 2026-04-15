import { describe, expect, it } from "vitest";
import type { Benefit, CreditCard } from "../models/types";
import { migrateCards } from "./migrations";

const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "benefit",
  description: "",
  faceValue: 0,
  category: "other",
  resetType: "one_time",
  resetConfig: {},
  isHidden: false,
  autoRecur: false,
  rolloverable: false,
  rolloverMaxYears: 0,
  usageRecords: [],
  ...overrides,
});

const makeCard = (benefits: Benefit[]): CreditCard => ({
  id: "c1",
  owner: "me",
  cardTypeSlug: "chase_marriott_boundless",
  annualFee: 95,
  cardOpenDate: "2024-01-01",
  color: "#000",
  isEnabled: true,
  benefits,
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
