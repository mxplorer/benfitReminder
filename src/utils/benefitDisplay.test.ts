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

describe("expandBenefitsForFilter — 已使用", () => {
  const today = new Date(2026, 3, 14);

  it("aggregates monthly benefit usage in current calendar year", () => {
    const b = makeBenefit({
      id: "b1",
      name: "Uber Eats",
      faceValue: 15,
      resetConfig: { period: "monthly" },
      usageRecords: [
        { usedDate: "2026-01-10", faceValue: 15, actualValue: 15 },
        { usedDate: "2026-03-05", faceValue: 15, actualValue: 12 },
        { usedDate: "2025-12-10", faceValue: 15, actualValue: 15 },
      ],
    });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "used", today, "calendar");
    expect(items).toHaveLength(1);
    expect(items[0].variant).toBe("aggregated");
    expect(items[0].aggregate?.kind).toBe("used");
    expect(items[0].aggregate?.usedCount).toBe(2);
    expect(items[0].aggregate?.months).toHaveLength(2);
    expect(items[0].aggregate?.totalActualValue).toBe(27);
    expect(items[0].aggregate?.totalFaceValue).toBe(30);
  });

  it("returns no item for monthly benefit with zero uses this year", () => {
    const b = makeBenefit({ id: "b1", resetConfig: { period: "monthly" } });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "used", today, "calendar");
    expect(items).toHaveLength(0);
  });

  it("returns per-cycle item for each used quarter", () => {
    const b = makeBenefit({
      id: "b1",
      resetConfig: { period: "quarterly" },
      faceValue: 100,
      usageRecords: [
        { usedDate: "2026-02-10", faceValue: 100, actualValue: 100 },
        { usedDate: "2026-05-20", faceValue: 100, actualValue: 80 },
      ],
    });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "used", today, "calendar");
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.periodLabel)).toEqual(["Q1 2026", "Q2 2026"]);
    expect(items[0].variant).toBe("per-cycle");
    expect(items[0].cycleUsed).toBe(true);
    expect(items[0].cycleRecord?.actualValue).toBe(100);
  });

  it("returns standard item for used one_time benefit", () => {
    const b = makeBenefit({
      id: "b1",
      resetType: "one_time",
      resetConfig: {},
      usageRecords: [{ usedDate: "2026-03-01", faceValue: 50, actualValue: 50 }],
    });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "used", today, "calendar");
    expect(items).toHaveLength(1);
    expect(items[0].variant).toBe("standard");
  });

  it("excludes hidden benefits", () => {
    const b = makeBenefit({
      id: "b1",
      isHidden: true,
      usageRecords: [{ usedDate: "2026-02-10", faceValue: 10, actualValue: 10 }],
    });
    const card = makeCard([b]);
    expect(expandBenefitsForFilter(card, "used", today, "calendar")).toHaveLength(0);
  });

  it("aggregates autoRecur subscription as 12 used months for full year", () => {
    const b = makeBenefit({
      id: "b1",
      resetType: "subscription",
      autoRecur: true,
      faceValue: 20,
      resetConfig: {},
      usageRecords: [],
    });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "used", today, "calendar");
    expect(items).toHaveLength(1);
    expect(items[0].aggregate?.usedCount).toBe(12);
  });
});

describe("expandBenefitsForFilter — 未使用", () => {
  const today = new Date(2026, 3, 14); // April 2026

  it("aggregates remaining unused months of monthly benefit in calendar scope", () => {
    const b = makeBenefit({
      id: "b1",
      resetConfig: { period: "monthly" },
      faceValue: 15,
      usageRecords: [
        { usedDate: "2026-01-10", faceValue: 15, actualValue: 15 },
        { usedDate: "2026-03-05", faceValue: 15, actualValue: 15 },
      ],
    });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "unused", today, "calendar");
    expect(items).toHaveLength(1);
    expect(items[0].variant).toBe("aggregated");
    expect(items[0].aggregate?.kind).toBe("unused");
    expect(items[0].aggregate?.unusedCount).toBe(10);
  });

  it("emits per-cycle items for each unused quarter in scope", () => {
    const b = makeBenefit({
      id: "b1",
      resetConfig: { period: "quarterly" },
      faceValue: 100,
      usageRecords: [{ usedDate: "2026-02-10", faceValue: 100, actualValue: 100 }],
    });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "unused", today, "calendar");
    expect(items.map((i) => i.periodLabel)).toEqual(["Q2 2026", "Q3 2026", "Q4 2026"]);
    expect(items.every((i) => i.variant === "per-cycle" && i.cycleUsed === false)).toBe(true);
  });

  it("anniversary scope shows cycles crossing into next year", () => {
    const b = makeBenefit({
      id: "b1",
      resetConfig: { period: "quarterly" },
    });
    const card: CreditCard = { ...makeCard([b]), cardOpenDate: "2025-09-15" };
    const items = expandBenefitsForFilter(card, "unused", today, "anniversary");
    expect(items.map((i) => i.periodLabel)).toEqual([
      "Q3 2025", "Q4 2025", "Q1 2026", "Q2 2026", "Q3 2026",
    ]);
  });

  it("emits standard card for unused applicable one_time benefit", () => {
    const b = makeBenefit({
      id: "b1",
      resetType: "one_time",
      resetConfig: { expiresDate: "2026-12-31" },
    });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "unused", today, "calendar");
    expect(items).toHaveLength(1);
    expect(items[0].variant).toBe("standard");
  });

  it("skips expired one_time benefit", () => {
    const b = makeBenefit({
      id: "b1",
      resetType: "one_time",
      resetConfig: { expiresDate: "2025-12-31" },
    });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "unused", today, "calendar");
    expect(items).toHaveLength(0);
  });

  it("excludes hidden benefits", () => {
    const b = makeBenefit({ id: "b1", isHidden: true });
    const card = makeCard([b]);
    expect(expandBenefitsForFilter(card, "unused", today, "calendar")).toHaveLength(0);
  });

  it("emits 0 items for autoRecur subscription (everything is used)", () => {
    const b = makeBenefit({
      id: "b1",
      resetType: "subscription",
      autoRecur: true,
      resetConfig: {},
    });
    const card = makeCard([b]);
    expect(expandBenefitsForFilter(card, "unused", today, "calendar")).toHaveLength(0);
  });
});
