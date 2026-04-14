import { describe, it, expect } from "vitest";
import type { CreditCard, Benefit } from "../models/types";
import { expandBenefitsForFilter } from "./benefitDisplay";

const makeBenefit = (overrides: Partial<Benefit>): Benefit => ({
  id: "b1",
  name: "Test",
  description: "",
  faceValue: 10,
  category: "other",
  resetType: "calendar",
  resetConfig: { period: "monthly" },
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
  cardTypeSlug: "amex-plat",
  annualFee: 695,
  cardOpenDate: "2024-01-01",
  color: "#000",
  isEnabled: true,
  benefits,
});

describe("expandBenefitsForFilter — 可使用", () => {
  it("returns applicable, unused benefits as standard variant", () => {
    const today = new Date(2026, 3, 14);
    const b = makeBenefit({ id: "b1", name: "Monthly credit" });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "available", today, "calendar");
    expect(items).toHaveLength(1);
    expect(items[0].variant).toBe("standard");
    expect(items[0].benefit.id).toBe("b1");
  });

  it("excludes hidden benefits", () => {
    const today = new Date(2026, 3, 14);
    const b = makeBenefit({ id: "b1", isHidden: true });
    const card = makeCard([b]);
    expect(expandBenefitsForFilter(card, "available", today, "calendar")).toHaveLength(0);
  });

  it("excludes benefit already used this period", () => {
    const today = new Date(2026, 3, 14);
    const b = makeBenefit({
      id: "b1",
      usageRecords: [{ usedDate: "2026-04-02", faceValue: 10, actualValue: 10 }],
    });
    const card = makeCard([b]);
    expect(expandBenefitsForFilter(card, "available", today, "calendar")).toHaveLength(0);
  });

  it("excludes benefit not applicable this month (applicableMonths)", () => {
    const today = new Date(2026, 3, 14);
    const b = makeBenefit({
      id: "b1",
      resetConfig: { period: "annual", applicableMonths: [1, 2] },
    });
    const card = makeCard([b]);
    expect(expandBenefitsForFilter(card, "available", today, "calendar")).toHaveLength(0);
  });
});

describe("expandBenefitsForFilter — 已隐藏", () => {
  it("returns only hidden benefits as standard variant", () => {
    const today = new Date(2026, 3, 14);
    const visible = makeBenefit({ id: "b1" });
    const hidden = makeBenefit({ id: "b2", isHidden: true });
    const card = makeCard([visible, hidden]);
    const items = expandBenefitsForFilter(card, "hidden", today, "calendar");
    expect(items).toHaveLength(1);
    expect(items[0].benefit.id).toBe("b2");
    expect(items[0].variant).toBe("standard");
  });
});
