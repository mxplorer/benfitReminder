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

  it("aggregates subscription as 12 used months when latest record has propagateNext=true", () => {
    const b = makeBenefit({
      id: "b1",
      resetType: "subscription",
      faceValue: 20,
      resetConfig: {},
      usageRecords: [
        { usedDate: "2026-03-15", faceValue: 20, actualValue: 20, propagateNext: true },
      ],
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

  it("emits 0 items for subscription whose latest record has propagateNext=true (everything is used)", () => {
    const b = makeBenefit({
      id: "b1",
      resetType: "subscription",
      resetConfig: {},
      usageRecords: [
        { usedDate: "2026-03-10", faceValue: 10, actualValue: 10, propagateNext: true },
      ],
    });
    const card = makeCard([b]);
    expect(expandBenefitsForFilter(card, "unused", today, "calendar")).toHaveLength(0);
  });

  it("excludes already-ended anniversary cycles (prior year's credit is forfeit)", () => {
    // Regression: CSP-style hotel credit. Anniversary reset, card opened Feb 3.
    // Today is April 16, 2026 — past the Feb 3 anniversary renewal, so the
    // Feb 2025 – Feb 2 2026 cycle has ended. In calendar-2026 scope the old
    // cycle still *overlaps* Jan 1 – Feb 2 2026, but its credit is no longer
    // redeemable, so it must not appear in "未使用".
    const apr16 = new Date(2026, 3, 16);
    const b = makeBenefit({
      id: "b1",
      resetType: "anniversary",
      resetConfig: {},
      faceValue: 50,
      usageRecords: [{ usedDate: "2026-04-15", faceValue: 50, actualValue: 50 }],
    });
    const card: CreditCard = { ...makeCard([b]), cardOpenDate: "2015-02-03" };
    const items = expandBenefitsForFilter(card, "unused", apr16, "calendar");
    // Neither 2025年度 (ended) nor 2026年度 (used) should appear as unused
    expect(items).toHaveLength(0);
  });

  it("still shows current anniversary cycle as unused when no record", () => {
    // Complement to the previous test: once the anniversary has renewed, the
    // current cycle (no record yet) must appear as unused.
    const apr16 = new Date(2026, 3, 16);
    const b = makeBenefit({
      id: "b1",
      resetType: "anniversary",
      resetConfig: {},
      faceValue: 50,
      usageRecords: [],
    });
    const card: CreditCard = { ...makeCard([b]), cardOpenDate: "2015-02-03" };
    const items = expandBenefitsForFilter(card, "unused", apr16, "calendar");
    expect(items.map((i) => i.periodLabel)).toEqual(["2026年度"]);
  });
});

describe("expandBenefitsForFilter — 全部", () => {
  const today = new Date(2026, 3, 14);

  it("includes hidden benefits", () => {
    const b = makeBenefit({ id: "b1", isHidden: true, resetType: "one_time", resetConfig: {} });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "all", today, "calendar");
    expect(items).toHaveLength(1);
    expect(items[0].benefit.isHidden).toBe(true);
  });

  it("emits aggregated item with kind=all for monthly benefit", () => {
    const b = makeBenefit({
      id: "b1",
      resetConfig: { period: "monthly" },
      faceValue: 15,
      usageRecords: [
        { usedDate: "2026-01-10", faceValue: 15, actualValue: 15 },
        { usedDate: "2026-03-05", faceValue: 15, actualValue: 12 },
      ],
    });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "all", today, "calendar");
    expect(items).toHaveLength(1);
    expect(items[0].variant).toBe("aggregated");
    expect(items[0].aggregate?.kind).toBe("all");
    expect(items[0].aggregate?.usedCount).toBe(2);
    expect(items[0].aggregate?.unusedCount).toBe(10);
    expect(items[0].aggregate?.totalActualValue).toBe(27);
    expect(items[0].aggregate?.totalFaceValue).toBe(180); // 12 × $15
  });

  it("emits per-cycle item per quarter (used or unused)", () => {
    const b = makeBenefit({
      id: "b1",
      resetConfig: { period: "quarterly" },
      usageRecords: [{ usedDate: "2026-02-10", faceValue: 100, actualValue: 100 }],
    });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "all", today, "calendar");
    expect(items.map((i) => ({ label: i.periodLabel, used: i.cycleUsed }))).toEqual([
      { label: "Q1 2026", used: true },
      { label: "Q2 2026", used: false },
      { label: "Q3 2026", used: false },
      { label: "Q4 2026", used: false },
    ]);
  });

  it("emits standard card for one_time / since_last_use", () => {
    const b = makeBenefit({ id: "b1", resetType: "one_time", resetConfig: {} });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "all", today, "calendar");
    expect(items[0].variant).toBe("standard");
  });

  it("respects anniversary scope", () => {
    const b = makeBenefit({ id: "b1", resetConfig: { period: "semi_annual" } });
    const card: CreditCard = { ...makeCard([b]), cardOpenDate: "2025-09-15" };
    const items = expandBenefitsForFilter(card, "all", today, "anniversary");
    expect(items.map((i) => i.periodLabel)).toEqual(["H2 2025", "H1 2026", "H2 2026"]);
  });

  it("excludes Q1 2026 for card opened 2026-04-10 in calendar scope", () => {
    const b = makeBenefit({ id: "b1", resetConfig: { period: "quarterly" } });
    const card: CreditCard = { ...makeCard([b]), cardOpenDate: "2026-04-10" };
    const items = expandBenefitsForFilter(card, "all", today, "calendar");
    expect(items.map((i) => i.periodLabel)).toEqual(["Q2 2026", "Q3 2026", "Q4 2026"]);
  });
});
