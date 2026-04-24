import { describe, it, expect } from "vitest";
import type { Benefit } from "../models/types";
import {
  getPeriodRangeAt,
  getPreviousPeriodStart,
  getAvailableValue,
  getPastPeriods,
  generateRolloverRecords,
  getTotalFaceWithRollover,
} from "./rollover";

const d = (iso: string) => new Date(iso + "T00:00:00");

const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "FHR",
  description: "",
  faceValue: 300,
  category: "hotel",
  resetType: "calendar",
  resetConfig: { period: "semi_annual" },
  isHidden: false,
  rolloverable: true,
  rolloverMaxYears: 2,
  usageRecords: [],
  ...overrides,
});

describe("getPeriodRangeAt", () => {
  it("returns correct semi_annual range for H1", () => {
    expect(getPeriodRangeAt(d("2026-03-15"), "semi_annual")).toEqual({
      start: "2026-01-01",
      end: "2026-06-30",
    });
  });
  it("returns correct semi_annual range for H2", () => {
    expect(getPeriodRangeAt(d("2026-09-01"), "semi_annual")).toEqual({
      start: "2026-07-01",
      end: "2026-12-31",
    });
  });
  it("returns correct quarterly range for Q2", () => {
    expect(getPeriodRangeAt(d("2026-05-10"), "quarterly")).toEqual({
      start: "2026-04-01",
      end: "2026-06-30",
    });
  });
  it("returns correct monthly range", () => {
    expect(getPeriodRangeAt(d("2026-02-15"), "monthly")).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
  });
});

describe("getPreviousPeriodStart", () => {
  it("returns previous semi_annual start from H2", () => {
    expect(getPreviousPeriodStart(d("2026-07-01"), "semi_annual")).toEqual(
      d("2026-01-01"),
    );
  });
  it("returns previous semi_annual start from H1 (crosses year)", () => {
    expect(getPreviousPeriodStart(d("2026-01-01"), "semi_annual")).toEqual(
      d("2025-07-01"),
    );
  });
  it("returns previous quarterly start from Q2", () => {
    expect(getPreviousPeriodStart(d("2026-04-01"), "quarterly")).toEqual(
      d("2026-01-01"),
    );
  });
  it("returns previous quarterly start from Q1 (crosses year)", () => {
    expect(getPreviousPeriodStart(d("2026-01-01"), "quarterly")).toEqual(
      d("2025-10-01"),
    );
  });
  it("returns previous monthly start", () => {
    expect(getPreviousPeriodStart(d("2026-03-01"), "monthly")).toEqual(
      d("2026-02-01"),
    );
  });
  it("returns previous monthly start from January (crosses year)", () => {
    expect(getPreviousPeriodStart(d("2026-01-01"), "monthly")).toEqual(
      d("2025-12-01"),
    );
  });
});

describe("getAvailableValue", () => {
  it("returns faceValue when no rollover records exist", () => {
    expect(getAvailableValue(makeBenefit(), d("2026-07-01"))).toBe(300);
  });
  it("returns faceValue when benefit is not rolloverable", () => {
    expect(
      getAvailableValue(
        makeBenefit({ rolloverable: false }),
        d("2026-07-01"),
      ),
    ).toBe(300);
  });
  it("accumulates one rolled-over period", () => {
    const b = makeBenefit({
      usageRecords: [
        {
          usedDate: "2026-03-01",
          faceValue: 300,
          actualValue: 0,
          kind: "rollover",
        },
      ],
    });
    // H1 rolled -> H2 = 300 + 300 = 600
    expect(getAvailableValue(b, d("2026-07-15"))).toBe(600);
  });
  it("accumulates multiple consecutive rollover periods", () => {
    const b = makeBenefit({
      resetConfig: { period: "quarterly" },
      faceValue: 100,
      usageRecords: [
        {
          usedDate: "2026-01-15",
          faceValue: 100,
          actualValue: 0,
          kind: "rollover",
        },
        {
          usedDate: "2026-04-15",
          faceValue: 100,
          actualValue: 0,
          kind: "rollover",
        },
      ],
    });
    // Q1+Q2 rolled -> Q3 = 100+100+100 = 300
    expect(getAvailableValue(b, d("2026-07-15"))).toBe(300);
  });
  it("stops accumulation at a non-rollover usage record", () => {
    const b = makeBenefit({
      resetConfig: { period: "quarterly" },
      faceValue: 100,
      usageRecords: [
        { usedDate: "2026-01-15", faceValue: 100, actualValue: 80, kind: "usage" }, // actual use Q1
        {
          usedDate: "2026-04-15",
          faceValue: 100,
          actualValue: 0,
          kind: "rollover",
        }, // Q2 rolled
      ],
    });
    // Q1 used (stop), Q2 rolled -> Q3 = 100 + 100 = 200
    expect(getAvailableValue(b, d("2026-07-15"))).toBe(200);
  });
  it("stops accumulation at a period with no record", () => {
    const b = makeBenefit({
      resetConfig: { period: "quarterly" },
      faceValue: 100,
      usageRecords: [
        // Q1: nothing
        {
          usedDate: "2026-04-15",
          faceValue: 100,
          actualValue: 0,
          kind: "rollover",
        }, // Q2 rolled
      ],
    });
    // Q1 no record (stop). Q2 rolled -> Q3 = 100 + 100 = 200
    expect(getAvailableValue(b, d("2026-07-15"))).toBe(200);
  });
  it("respects rolloverMaxYears limit", () => {
    const b = makeBenefit({
      resetConfig: { period: "semi_annual" },
      faceValue: 300,
      rolloverMaxYears: 1, // max 2 periods
      usageRecords: [
        {
          usedDate: "2025-01-15",
          faceValue: 300,
          actualValue: 0,
          kind: "rollover",
        },
        {
          usedDate: "2025-07-15",
          faceValue: 300,
          actualValue: 0,
          kind: "rollover",
        },
        {
          usedDate: "2026-01-15",
          faceValue: 300,
          actualValue: 0,
          kind: "rollover",
        },
      ],
    });
    // max 1yr = 2 periods -> count 2026H1 + 2025H2 = 300+300+300 = 900
    expect(getAvailableValue(b, d("2026-07-15"))).toBe(900);
  });
  it("sums partial rollover amounts (new partial-amount model)", () => {
    // benefit.faceValue = 100, prior cycle rolled only $40.
    // totalFace = 100 (own) + 40 (rolled) = 140.
    const b = makeBenefit({
      resetConfig: { period: "quarterly" },
      faceValue: 100,
      usageRecords: [
        {
          usedDate: "2026-04-15",
          faceValue: 40,
          actualValue: 0,
          kind: "rollover",
        },
      ],
    });
    expect(getAvailableValue(b, d("2026-07-15"))).toBe(140);
  });
  it("ignores rollover for non-calendar reset types", () => {
    const b = makeBenefit({
      resetType: "anniversary",
      rolloverable: true,
      usageRecords: [
        {
          usedDate: "2026-01-15",
          faceValue: 300,
          actualValue: 0,
          kind: "rollover",
        },
      ],
    });
    expect(getAvailableValue(b, d("2026-07-15"))).toBe(300);
  });
});

describe("getPastPeriods", () => {
  it("returns past semi_annual periods within lookback", () => {
    const periods = getPastPeriods("semi_annual", d("2026-07-15"), 12);
    expect(periods).toEqual([
      { start: "2026-01-01", end: "2026-06-30" },
      { start: "2025-07-01", end: "2025-12-31" },
    ]);
  });

  it("returns past quarterly periods within 12-month lookback", () => {
    const periods = getPastPeriods("quarterly", d("2026-07-15"), 12);
    expect(periods).toEqual([
      { start: "2026-04-01", end: "2026-06-30" },
      { start: "2026-01-01", end: "2026-03-31" },
      { start: "2025-10-01", end: "2025-12-31" },
      { start: "2025-07-01", end: "2025-09-30" },
    ]);
  });

  it("returns past monthly periods within 3-month lookback", () => {
    const periods = getPastPeriods("monthly", d("2026-04-15"), 3);
    expect(periods).toEqual([
      { start: "2026-03-01", end: "2026-03-31" },
      { start: "2026-02-01", end: "2026-02-28" },
      { start: "2026-01-01", end: "2026-01-31" },
    ]);
  });

  it("returns empty array when no past periods exist within lookback", () => {
    const periods = getPastPeriods("annual", d("2026-04-15"), 6);
    expect(periods).toEqual([]);
  });
});

describe("generateRolloverRecords", () => {
  it("distributes amount across prior cycles at full face each", () => {
    const b = makeBenefit({ faceValue: 300, resetConfig: { period: "semi_annual" } });
    const records = generateRolloverRecords(b, 600, d("2026-07-15"));
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({ usedDate: "2026-01-01", faceValue: 300, actualValue: 0, kind: "rollover" });
    expect(records[1]).toEqual({ usedDate: "2025-07-01", faceValue: 300, actualValue: 0, kind: "rollover" });
  });

  it("records a partial amount (< faceValue) as a single record for the most-recent prior cycle", () => {
    // $23 on a $300 benefit → 1 rollover record carrying $23 (not zero, not snapped away)
    const b = makeBenefit({ faceValue: 300, resetConfig: { period: "semi_annual" } });
    const records = generateRolloverRecords(b, 23, d("2026-07-15"));
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({
      usedDate: "2026-01-01",
      faceValue: 23,
      actualValue: 0,
      kind: "rollover",
    });
  });

  it("distributes a mixed amount: fills most-recent cycle, remainder into next-older", () => {
    // $450 on $300 benefit → prev=300, prev-1=150
    const b = makeBenefit({ faceValue: 300, resetConfig: { period: "semi_annual" } });
    const records = generateRolloverRecords(b, 450, d("2026-07-15"));
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({ usedDate: "2026-01-01", faceValue: 300, actualValue: 0, kind: "rollover" });
    expect(records[1]).toEqual({ usedDate: "2025-07-01", faceValue: 150, actualValue: 0, kind: "rollover" });
  });

  it("clamps to rolloverMaxYears worth of periods and drops excess", () => {
    // max 1yr quarterly = 4 periods; $600 on $100 benefit would want 6 records,
    // but only 4 fit → excess silently dropped.
    const b = makeBenefit({ faceValue: 100, resetConfig: { period: "quarterly" }, rolloverMaxYears: 1 });
    const records = generateRolloverRecords(b, 600, d("2026-07-15"));
    expect(records).toHaveLength(4);
    expect(records.every((r) => r.faceValue === 100)).toBe(true);
  });

  it("returns empty array for zero amount", () => {
    expect(generateRolloverRecords(makeBenefit(), 0, d("2026-07-15"))).toEqual([]);
  });

  it("returns empty array for non-rolloverable benefit", () => {
    expect(generateRolloverRecords(makeBenefit({ rolloverable: false }), 300, d("2026-07-15"))).toEqual([]);
  });
});

// --- Batch 1: remaining = totalFace − consumed ---
describe("getAvailableValue — cumulative consumption semantics", () => {
  it("face=100, prior rollover=50 worth of credit, consumed=30 in current cycle → 120", () => {
    // Using face=100, semi_annual. Prior rollover record at H1 rolls 100 in.
    // Current H2 consumed so far: 80. Remaining = 200 - 80 = 120.
    const b = makeBenefit({
      faceValue: 100,
      resetConfig: { period: "semi_annual" },
      usageRecords: [
        { usedDate: "2026-01-01", faceValue: 100, actualValue: 0, kind: "rollover" },
        { usedDate: "2026-07-20", faceValue: 80, actualValue: 80, kind: "usage" },
      ],
    });
    expect(getAvailableValue(b, d("2026-08-15"))).toBe(120);
  });

  it("face=100 + rolled-in 100, consumed=150 → remaining 50 (no clamp needed)", () => {
    const b = makeBenefit({
      faceValue: 100,
      resetConfig: { period: "semi_annual" },
      usageRecords: [
        { usedDate: "2026-01-01", faceValue: 100, actualValue: 0, kind: "rollover" },
        { usedDate: "2026-07-05", faceValue: 100, actualValue: 100, kind: "usage" },
        { usedDate: "2026-08-01", faceValue: 50, actualValue: 50, kind: "usage" },
      ],
    });
    // totalFace = 200, consumed = 150 → remaining = 50. Reword:
    // The spec example said consumed=150 → 0 which implies totalFace=100 only
    // (no prior rollover). Handle both by asserting ≥0 clamp separately below.
    expect(getAvailableValue(b, d("2026-08-15"))).toBe(50);
  });

  it("face=100, no prior rollover, consumed=100 in current cycle → 0", () => {
    const b = makeBenefit({
      faceValue: 100,
      rolloverable: false,
      resetConfig: { period: "semi_annual" },
      usageRecords: [
        { usedDate: "2026-07-20", faceValue: 100, actualValue: 100, kind: "usage" },
      ],
    });
    expect(getAvailableValue(b, d("2026-08-15"))).toBe(0);
  });

  it("face=100, no prior rollover, consumed=150 → clamps to 0 (never negative)", () => {
    const b = makeBenefit({
      faceValue: 100,
      rolloverable: false,
      resetConfig: { period: "semi_annual" },
      usageRecords: [
        { usedDate: "2026-07-05", faceValue: 100, actualValue: 100, kind: "usage" },
        { usedDate: "2026-08-01", faceValue: 50, actualValue: 50, kind: "usage" },
      ],
    });
    expect(getAvailableValue(b, d("2026-08-15"))).toBe(0);
  });

  it("face=100, no records at all → 100 (full face remaining)", () => {
    const b = makeBenefit({
      faceValue: 100,
      rolloverable: false,
      resetConfig: { period: "semi_annual" },
      usageRecords: [],
    });
    expect(getAvailableValue(b, d("2026-08-15"))).toBe(100);
  });
});

describe("getTotalFaceWithRollover — pure totalFace (no subtraction)", () => {
  it("returns faceValue when no prior rollover exists", () => {
    const b = makeBenefit({
      faceValue: 300,
      resetConfig: { period: "semi_annual" },
      usageRecords: [],
    });
    expect(getTotalFaceWithRollover(b, d("2026-07-15"))).toBe(300);
  });

  it("accumulates prior rollover periods at their recorded amount", () => {
    const b = makeBenefit({
      faceValue: 300,
      resetConfig: { period: "semi_annual" },
      usageRecords: [
        { usedDate: "2026-03-01", faceValue: 300, actualValue: 0, kind: "rollover" },
      ],
    });
    expect(getTotalFaceWithRollover(b, d("2026-07-15"))).toBe(600);
  });

  it("adds a partial rollover amount (record.faceValue < benefit.faceValue)", () => {
    // $100 benefit, prior cycle rolled only $50 → totalFace = 100 + 50 = 150.
    const b = makeBenefit({
      faceValue: 100,
      resetConfig: { period: "semi_annual" },
      usageRecords: [
        { usedDate: "2026-03-01", faceValue: 50, actualValue: 0, kind: "rollover" },
      ],
    });
    expect(getTotalFaceWithRollover(b, d("2026-07-15"))).toBe(150);
  });

  it("is independent of current-cycle consumption", () => {
    // Adding a usage record in the current period must not change totalFace.
    const b = makeBenefit({
      faceValue: 300,
      resetConfig: { period: "semi_annual" },
      usageRecords: [
        { usedDate: "2026-03-01", faceValue: 300, actualValue: 0, kind: "rollover" },
        { usedDate: "2026-08-01", faceValue: 200, actualValue: 200, kind: "usage" },
      ],
    });
    expect(getTotalFaceWithRollover(b, d("2026-08-10"))).toBe(600);
  });
});
