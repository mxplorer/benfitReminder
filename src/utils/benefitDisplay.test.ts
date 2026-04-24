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
      usageRecords: [{ usedDate: "2026-04-02", faceValue: 10, actualValue: 10, kind: "usage" }],
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

// CSP's $50 hotel credit is plain anniversary. A past-year usage record
// (2025-04-16) belongs to cycle A:2025 and does NOT satisfy the current
// cycle A:2026 — the user is owed a new $50 for the 2026 anniv year.
describe("expandBenefitsForFilter — CSP hotel credit with prior-year record", () => {
  // Today: 2026-04-16. Card opened 2024-04-11.
  // Current cycle: A:2026 [2026-04-11, 2027-04-10] — fresh, no record.
  // Prior cycle:   A:2025 [2025-04-11, 2026-04-10] — holds the 2025-04-16 record.
  const today = new Date(2026, 3, 16);
  const cspBenefit = (): Benefit =>
    makeBenefit({
      id: "hotel-50",
      name: "$50 Annual Hotel Credit",
      faceValue: 50,
      category: "hotel",
      resetType: "anniversary",
      resetConfig: {},
      usageRecords: [
        { usedDate: "2025-04-16", faceValue: 50, actualValue: 50, kind: "usage" },
      ],
    });
  const makeCspCard = (): CreditCard => ({
    id: "csp",
    owner: "me",
    cardTypeSlug: "chase_sapphire_preferred",
    annualFee: 95,
    cardOpenDate: "2024-04-11",
    color: "#2471A3",
    isEnabled: true,
    benefits: [cspBenefit()],
  });

  it("shows benefit in 可使用 — current cycle has no record yet", () => {
    const items = expandBenefitsForFilter(makeCspCard(), "available", today, "anniversary");
    expect(items).toHaveLength(1);
    expect(items[0].benefit.id).toBe("hotel-50");
    expect(items[0].variant).toBe("standard");
  });

  it("shows current cycle in 未使用 — prior-year record does not count", () => {
    const items = expandBenefitsForFilter(makeCspCard(), "unused", today, "anniversary");
    expect(items).toHaveLength(1);
    expect(items[0].periodLabel).toBe("2026年度");
    expect(items[0].cycleRecord).toBeUndefined();
  });

  it("shows prior cycle in 已使用 with the 2025 record", () => {
    const items = expandBenefitsForFilter(makeCspCard(), "used", today, "anniversary");
    expect(items).toHaveLength(1);
    expect(items[0].periodLabel).toBe("2025年度");
    expect(items[0].cycleRecord?.usedDate).toBe("2025-04-16");
    expect(items[0].cycleRecord?.actualValue).toBe(50);
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
        { usedDate: "2026-01-10", faceValue: 15, actualValue: 15, kind: "usage" },
        { usedDate: "2026-03-05", faceValue: 15, actualValue: 12, kind: "usage" },
        { usedDate: "2025-12-10", faceValue: 15, actualValue: 15, kind: "usage" },
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
        { usedDate: "2026-02-10", faceValue: 100, actualValue: 100, kind: "usage" },
        { usedDate: "2026-05-20", faceValue: 100, actualValue: 80, kind: "usage" },
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
      usageRecords: [{ usedDate: "2026-03-01", faceValue: 50, actualValue: 50, kind: "usage" }],
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
      usageRecords: [{ usedDate: "2026-02-10", faceValue: 10, actualValue: 10, kind: "usage" }],
    });
    const card = makeCard([b]);
    expect(expandBenefitsForFilter(card, "used", today, "calendar")).toHaveLength(0);
  });

  it("aggregates subscription used months per cumulative rule (propagateNext no longer forces all-used)", () => {
    // Under the new semantic, propagateNext is purely a materialisation
    // hint handled at the store level — it does NOT retroactively mark
    // other months as "used". Only cycles with consumed >= faceValue
    // count as used. Here only March has a record → 1 used month.
    const b = makeBenefit({
      id: "b1",
      resetType: "subscription",
      faceValue: 20,
      resetConfig: {},
      usageRecords: [
        { usedDate: "2026-03-15", faceValue: 20, actualValue: 20, propagateNext: true, kind: "usage" },
      ],
    });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "used", today, "calendar");
    expect(items).toHaveLength(1);
    expect(items[0].aggregate?.usedCount).toBe(1);
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
        { usedDate: "2026-01-10", faceValue: 15, actualValue: 15, kind: "usage" },
        { usedDate: "2026-03-05", faceValue: 15, actualValue: 15, kind: "usage" },
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
      usageRecords: [{ usedDate: "2026-02-10", faceValue: 100, actualValue: 100, kind: "usage" }],
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

  it("subscription with one propagate-tagged record still shows remaining months as unused", () => {
    // Under the new semantic, propagateNext does not retroactively
    // fill every month. With only the March record materialised, the
    // other 11 months of the calendar year are unused.
    const b = makeBenefit({
      id: "b1",
      resetType: "subscription",
      resetConfig: {},
      usageRecords: [
        { usedDate: "2026-03-10", faceValue: 10, actualValue: 10, propagateNext: true, kind: "usage" },
      ],
    });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "unused", today, "calendar");
    expect(items).toHaveLength(1);
    expect(items[0].aggregate?.unusedCount).toBe(11);
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
      usageRecords: [{ usedDate: "2026-04-15", faceValue: 50, actualValue: 50, kind: "usage" }],
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
        { usedDate: "2026-01-10", faceValue: 15, actualValue: 15, kind: "usage" },
        { usedDate: "2026-03-05", faceValue: 15, actualValue: 12, kind: "usage" },
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
      usageRecords: [{ usedDate: "2026-02-10", faceValue: 100, actualValue: 100, kind: "usage" }],
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

// --- Batch 1: cumulative face-value rule at the aggregate/cycle level ---
describe("expandBenefitsForFilter — cumulative consumption (Batch 1)", () => {
  const today = new Date(2026, 3, 14); // 2026-04-14

  it("months[].consumedValue sums faceValue across all records (usage + rollover) in the cycle", () => {
    const b = makeBenefit({
      id: "b1",
      resetConfig: { period: "monthly" },
      faceValue: 15,
      usageRecords: [
        // Jan: two partial records → consumedValue = 15
        { usedDate: "2026-01-05", faceValue: 5, actualValue: 5, kind: "usage" },
        { usedDate: "2026-01-20", faceValue: 10, actualValue: 10, kind: "usage" },
        // Feb: rollover (face=0) → consumedValue = 0
        { usedDate: "2026-02-01", faceValue: 0, actualValue: 0, kind: "rollover" },
        // Mar: exact face → consumedValue = 15
        { usedDate: "2026-03-10", faceValue: 15, actualValue: 15, kind: "usage" },
      ],
    });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "all", today, "calendar");
    expect(items).toHaveLength(1);
    const months = items[0].aggregate?.months;
    expect(months?.[0].consumedValue).toBe(15);
    expect(months?.[1].consumedValue).toBe(0);
    expect(months?.[2].consumedValue).toBe(15);
  });

  it("months[].used flips only when consumedValue >= faceValue (partial stays unused)", () => {
    const b = makeBenefit({
      id: "b1",
      resetConfig: { period: "monthly" },
      faceValue: 20,
      usageRecords: [
        // Jan: partial (5 of 20) → NOT used
        { usedDate: "2026-01-15", faceValue: 5, actualValue: 5, kind: "usage" },
        // Feb: exact (20 of 20) → USED
        { usedDate: "2026-02-15", faceValue: 20, actualValue: 20, kind: "usage" },
        // Mar: over (25 of 20) → USED
        { usedDate: "2026-03-15", faceValue: 25, actualValue: 25, kind: "usage" },
      ],
    });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "all", today, "calendar");
    const months = items[0].aggregate?.months;
    expect(months?.[0].used).toBe(false); // Jan partial
    expect(months?.[1].used).toBe(true); // Feb exact
    expect(months?.[2].used).toBe(true); // Mar over
  });

  it("partial-consumed current cycle → NOT in 未使用, NOT in 已使用 (→ in 可使用)", () => {
    // faceValue=200 with 50 consumed this month. Not unused (has a record),
    // not used (consumed < face), so it should appear in 可使用.
    const b = makeBenefit({
      id: "b1",
      resetType: "calendar",
      resetConfig: { period: "monthly" },
      faceValue: 200,
      usageRecords: [
        { usedDate: "2026-04-02", faceValue: 50, actualValue: 50, kind: "usage" },
      ],
    });
    const card = makeCard([b]);

    // Not unused: current cycle has a record, so strict rule excludes it.
    const unused = expandBenefitsForFilter(card, "unused", today, "calendar");
    const aprUnused = unused[0]?.aggregate?.months.find(
      (m) => m.cycleStart === "2026-04-01",
    );
    expect(aprUnused).toBeUndefined();

    // Not used: consumed (50) < faceValue (200).
    const used = expandBenefitsForFilter(card, "used", today, "calendar");
    const aprUsed = used[0]?.aggregate?.months.find(
      (m) => m.cycleStart === "2026-04-01",
    );
    expect(aprUsed).toBeUndefined();

    // In 可使用: available filter returns the benefit since isBenefitUsedInPeriod is false.
    const available = expandBenefitsForFilter(card, "available", today, "calendar");
    expect(available.map((i) => i.benefit.id)).toContain("b1");
  });

  it("current cycle subscription with 0 records → in 未使用 (with other empty months)", () => {
    const b = makeBenefit({
      id: "b1",
      resetType: "subscription",
      faceValue: 20,
      resetConfig: {},
      usageRecords: [],
    });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "unused", today, "calendar");
    expect(items).toHaveLength(1);
    // Apr 2026 cycle (current) is included — 0 records and not a future cycle.
    const hasApr = items[0].aggregate?.months.some(
      (m) => m.cycleStart === "2026-04-01",
    );
    expect(hasApr).toBe(true);
  });

  it("future cycle with propagated record → STILL in 未使用 (notYetActive dominates)", () => {
    // Today: 2026-04-14. A subscription that has a propagated record for
    // May 2026 (cycle.start > today). Under the new strict rule, future
    // cycles appear in 未使用 regardless of whether a record has been
    // materialised ahead of time.
    const b = makeBenefit({
      id: "b1",
      resetType: "subscription",
      faceValue: 20,
      resetConfig: {},
      usageRecords: [
        { usedDate: "2026-04-01", faceValue: 20, actualValue: 20, propagateNext: true, kind: "usage" },
        // Pre-materialised future record — should NOT prevent May from being unused.
        { usedDate: "2026-05-01", faceValue: 20, actualValue: 20, kind: "usage" },
      ],
    });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "unused", today, "calendar");
    expect(items).toHaveLength(1);
    const mayMonth = items[0].aggregate?.months.find(
      (m) => m.cycleStart === "2026-05-01",
    );
    expect(mayMonth).toBeDefined();
  });

  it("current cycle subscription with partial record → NOT in 未使用 (has record, not future)", () => {
    const b = makeBenefit({
      id: "b1",
      resetType: "subscription",
      faceValue: 20,
      resetConfig: {},
      usageRecords: [
        { usedDate: "2026-04-05", faceValue: 5, actualValue: 5, kind: "usage" },
      ],
    });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "unused", today, "calendar");
    // Aggregated entry should not contain the April cycle.
    const aprMonth = items[0]?.aggregate?.months.find(
      (m) => m.cycleStart === "2026-04-01",
    );
    expect(aprMonth).toBeUndefined();
  });

  it("benefit faceValue=0 with one usage record → in 已使用", () => {
    // e.g. a free-night award — no face value, single-shot.
    const b = makeBenefit({
      id: "b1",
      resetType: "anniversary",
      faceValue: 0,
      resetConfig: {},
      usageRecords: [
        { usedDate: "2026-05-01", faceValue: 0, actualValue: 0, kind: "usage" },
      ],
    });
    const card: CreditCard = { ...makeCard([b]), cardOpenDate: "2025-03-10" };
    const items = expandBenefitsForFilter(card, "used", today, "anniversary");
    expect(items).toHaveLength(1);
    expect(items[0].cycleUsed).toBe(true);
  });

  it("totalActualValue sums actualValue across all records in a cycle (multi-record)", () => {
    const b = makeBenefit({
      id: "b1",
      resetConfig: { period: "monthly" },
      faceValue: 15,
      usageRecords: [
        { usedDate: "2026-01-05", faceValue: 5, actualValue: 4, kind: "usage" },
        { usedDate: "2026-01-20", faceValue: 10, actualValue: 9, kind: "usage" },
        { usedDate: "2026-02-10", faceValue: 15, actualValue: 15, kind: "usage" },
      ],
    });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "all", today, "calendar");
    // Total actual = 4 + 9 + 15 = 28
    expect(items[0].aggregate?.totalActualValue).toBe(28);
  });
});

// --- Rollover inbound: per-cycle totalFace includes prev cycle's rollover ---
describe("expandBenefitsForFilter — rollover inbound affects per-cycle used/faceValue", () => {
  const today = new Date(2026, 3, 14); // 2026-04-14

  it("prev-cycle rollover raises current totalFace → $100 usage no longer flips used", () => {
    // Mar rolled $100 forward. Apr has $100 usage.
    // Under the old bug, consumed($100) >= faceValue($100) flipped Apr to used.
    // Correct behavior: totalFace(Apr) = $100 + $100 inbound = $200, still unused.
    const b = makeBenefit({
      id: "b1",
      resetConfig: { period: "monthly" },
      faceValue: 100,
      rolloverable: true,
      rolloverMaxYears: 1,
      usageRecords: [
        { usedDate: "2026-03-01", faceValue: 100, actualValue: 0, kind: "rollover" },
        { usedDate: "2026-04-05", faceValue: 100, actualValue: 100, kind: "usage" },
      ],
    });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "all", today, "calendar");
    const apr = items[0]?.aggregate?.months.find((m) => m.cycleStart === "2026-04-01");
    expect(apr?.faceValue).toBe(200); // face + inbound surfaced to UI
    expect(apr?.consumedValue).toBe(100);
    expect(apr?.used).toBe(false);
  });

  it("current-cycle outbound rollover counts toward consumed → flips used when saturating totalFace", () => {
    // Apr has $60 usage + rolls $40 out (= a $40 rollover record in Apr).
    // consumed = 60 + 40 = 100, totalFace = 100, → used.
    const b = makeBenefit({
      id: "b1",
      resetConfig: { period: "monthly" },
      faceValue: 100,
      rolloverable: true,
      rolloverMaxYears: 1,
      usageRecords: [
        { usedDate: "2026-04-05", faceValue: 60, actualValue: 60, kind: "usage" },
        { usedDate: "2026-04-01", faceValue: 40, actualValue: 0, kind: "rollover" },
      ],
    });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "all", today, "calendar");
    const apr = items[0]?.aggregate?.months.find((m) => m.cycleStart === "2026-04-01");
    expect(apr?.used).toBe(true);
  });

  it("months without prev-cycle rollover keep intrinsic faceValue", () => {
    // Jan has no prev rollover → faceValue = benefit.faceValue, not inflated.
    const b = makeBenefit({
      id: "b1",
      resetConfig: { period: "monthly" },
      faceValue: 100,
      rolloverable: true,
      rolloverMaxYears: 1,
      usageRecords: [],
    });
    const card = makeCard([b]);
    const items = expandBenefitsForFilter(card, "all", today, "calendar");
    const jan = items[0]?.aggregate?.months.find((m) => m.cycleStart === "2026-01-01");
    expect(jan?.faceValue).toBe(100);
  });
});
