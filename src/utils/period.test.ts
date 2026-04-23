import { describe, it, expect } from "vitest";
import type { Benefit } from "../models/types";
import {
  getCurrentPeriodRange,
  formatDate,
  lastDay,
  getMonthRange,
  isBenefitUsedInPeriod,
  isApplicableNow,
  isInCurrentCycle,
  getDeadline,
  getDaysRemaining,
  getConsumedInPeriod,
} from "./period";

const d = (iso: string) => new Date(iso + "T00:00:00");

describe("formatDate", () => {
  it("formats date as ISO string", () => {
    expect(formatDate(new Date(2026, 3, 10))).toBe("2026-04-10");
  });
});

describe("lastDay", () => {
  it("returns 28 for Feb 2025 (non-leap)", () => {
    expect(lastDay(2025, 2)).toBe(28);
  });

  it("returns 29 for Feb 2024 (leap year)", () => {
    expect(lastDay(2024, 2)).toBe(29);
  });

  it("returns 31 for January", () => {
    expect(lastDay(2026, 1)).toBe(31);
  });
});

describe("getMonthRange", () => {
  it("returns correct range for April 2026", () => {
    expect(getMonthRange(2026, 4)).toEqual({ start: "2026-04-01", end: "2026-04-30" });
  });
});

describe("getCurrentPeriodRange", () => {
  describe("calendar monthly", () => {
    it("returns current month for mid-month date", () => {
      const result = getCurrentPeriodRange(d("2026-04-15"), {
        resetType: "calendar",
        resetConfig: { period: "monthly" },
      });
      expect(result).toEqual({ start: "2026-04-01", end: "2026-04-30" });
    });

    it("handles 31-day month", () => {
      const result = getCurrentPeriodRange(d("2026-01-31"), {
        resetType: "calendar",
        resetConfig: { period: "monthly" },
      });
      expect(result).toEqual({ start: "2026-01-01", end: "2026-01-31" });
    });

    it("handles February in leap year", () => {
      const result = getCurrentPeriodRange(d("2024-02-15"), {
        resetType: "calendar",
        resetConfig: { period: "monthly" },
      });
      expect(result).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    });
  });

  describe("calendar quarterly", () => {
    it("returns Q1 for January", () => {
      const result = getCurrentPeriodRange(d("2026-01-15"), {
        resetType: "calendar",
        resetConfig: { period: "quarterly" },
      });
      expect(result).toEqual({ start: "2026-01-01", end: "2026-03-31" });
    });

    it("returns Q2 for April", () => {
      const result = getCurrentPeriodRange(d("2026-04-10"), {
        resetType: "calendar",
        resetConfig: { period: "quarterly" },
      });
      expect(result).toEqual({ start: "2026-04-01", end: "2026-06-30" });
    });

    it("returns Q4 for December", () => {
      const result = getCurrentPeriodRange(d("2026-12-31"), {
        resetType: "calendar",
        resetConfig: { period: "quarterly" },
      });
      expect(result).toEqual({ start: "2026-10-01", end: "2026-12-31" });
    });
  });

  describe("calendar semi_annual", () => {
    it("returns H1 for March", () => {
      const result = getCurrentPeriodRange(d("2026-03-15"), {
        resetType: "calendar",
        resetConfig: { period: "semi_annual" },
      });
      expect(result).toEqual({ start: "2026-01-01", end: "2026-06-30" });
    });

    it("returns H2 for October", () => {
      const result = getCurrentPeriodRange(d("2026-10-01"), {
        resetType: "calendar",
        resetConfig: { period: "semi_annual" },
      });
      expect(result).toEqual({ start: "2026-07-01", end: "2026-12-31" });
    });
  });

  describe("calendar annual", () => {
    it("returns full year", () => {
      const result = getCurrentPeriodRange(d("2026-06-15"), {
        resetType: "calendar",
        resetConfig: { period: "annual" },
      });
      expect(result).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    });
  });

  describe("calendar every_4_years", () => {
    it("returns 4-year block aligned to year % 4 == 0", () => {
      const result = getCurrentPeriodRange(d("2026-04-10"), {
        resetType: "calendar",
        resetConfig: { period: "every_4_years" },
      });
      expect(result).toEqual({ start: "2024-01-01", end: "2027-12-31" });
    });

    it("returns same block for year at block start", () => {
      const result = getCurrentPeriodRange(d("2024-01-01"), {
        resetType: "calendar",
        resetConfig: { period: "every_4_years" },
      });
      expect(result).toEqual({ start: "2024-01-01", end: "2027-12-31" });
    });
  });

  describe("anniversary", () => {
    it("returns membership year after open date", () => {
      const result = getCurrentPeriodRange(d("2026-04-10"), {
        resetType: "anniversary",
        resetConfig: {},
        cardOpenDate: "2024-03-15",
      });
      expect(result).toEqual({ start: "2026-03-15", end: "2027-03-14" });
    });

    it("returns previous membership year when before anniversary this year", () => {
      const result = getCurrentPeriodRange(d("2026-02-10"), {
        resetType: "anniversary",
        resetConfig: {},
        cardOpenDate: "2024-03-15",
      });
      expect(result).toEqual({ start: "2025-03-15", end: "2026-03-14" });
    });

    it("returns current membership year on anniversary date exactly", () => {
      const result = getCurrentPeriodRange(d("2026-03-15"), {
        resetType: "anniversary",
        resetConfig: {},
        cardOpenDate: "2024-03-15",
      });
      expect(result).toEqual({ start: "2026-03-15", end: "2027-03-14" });
    });

    it("handles leap year open date (Feb 29) in non-leap year", () => {
      const result = getCurrentPeriodRange(d("2025-04-10"), {
        resetType: "anniversary",
        resetConfig: {},
        cardOpenDate: "2024-02-29",
      });
      // Feb 29 clamped to Feb 28 in non-leap year, full year period
      expect(result).toEqual({ start: "2025-02-28", end: "2026-02-27" });
    });

    it("handles leap year open date (Feb 29) in leap year", () => {
      const result = getCurrentPeriodRange(d("2028-04-10"), {
        resetType: "anniversary",
        resetConfig: {},
        cardOpenDate: "2024-02-29",
      });
      expect(result).toEqual({ start: "2028-02-29", end: "2029-02-28" });
    });
  });

  describe("subscription", () => {
    it("returns monthly range", () => {
      const result = getCurrentPeriodRange(d("2026-04-10"), {
        resetType: "subscription",
        resetConfig: {},
      });
      expect(result).toEqual({ start: "2026-04-01", end: "2026-04-30" });
    });
  });

  describe("since_last_use", () => {
    it("returns null", () => {
      const result = getCurrentPeriodRange(d("2026-04-10"), {
        resetType: "since_last_use",
        resetConfig: { cooldownDays: 30 },
      });
      expect(result).toBeNull();
    });
  });

  describe("one_time", () => {
    it("returns null with expiresDate", () => {
      const result = getCurrentPeriodRange(d("2026-04-10"), {
        resetType: "one_time",
        resetConfig: { expiresDate: "2026-12-31" },
      });
      expect(result).toBeNull();
    });

    it("returns null without expiresDate", () => {
      const result = getCurrentPeriodRange(d("2026-04-10"), {
        resetType: "one_time",
        resetConfig: {},
      });
      expect(result).toBeNull();
    });
  });
});

const makeBenefit = (overrides: Partial<Benefit>): Benefit => ({
  id: "b1",
  name: "Test",
  description: "",
  faceValue: 100,
  category: "other",
  resetType: "calendar",
  resetConfig: { period: "monthly" },
  isHidden: false,
  rolloverable: false,
  rolloverMaxYears: 2,
  usageRecords: [],
  ...overrides,
});

describe("isBenefitUsedInPeriod", () => {
  it("returns true when usage record is in current calendar month", () => {
    const benefit = makeBenefit({
      usageRecords: [{ usedDate: "2026-04-05", faceValue: 100, actualValue: 100, kind: "usage" }],
    });
    expect(isBenefitUsedInPeriod(benefit, d("2026-04-10"))).toBe(true);
  });

  it("returns false when usage record is in prior month", () => {
    const benefit = makeBenefit({
      usageRecords: [{ usedDate: "2026-03-15", faceValue: 100, actualValue: 100, kind: "usage" }],
    });
    expect(isBenefitUsedInPeriod(benefit, d("2026-04-10"))).toBe(false);
  });

  it("returns false for subscription when no records this month", () => {
    const benefit = makeBenefit({
      resetType: "subscription",
      resetConfig: {},
      usageRecords: [],
    });
    expect(isBenefitUsedInPeriod(benefit, d("2026-04-10"))).toBe(false);
  });

  it("returns true for since_last_use within cooldown", () => {
    const benefit = makeBenefit({
      resetType: "since_last_use",
      resetConfig: { cooldownDays: 30 },
      usageRecords: [{ usedDate: "2026-04-01", faceValue: 100, actualValue: 100, kind: "usage" }],
    });
    expect(isBenefitUsedInPeriod(benefit, d("2026-04-10"))).toBe(true);
  });

  it("returns false for since_last_use when cooldown expired", () => {
    const benefit = makeBenefit({
      resetType: "since_last_use",
      resetConfig: { cooldownDays: 5 },
      usageRecords: [{ usedDate: "2026-04-01", faceValue: 100, actualValue: 100, kind: "usage" }],
    });
    expect(isBenefitUsedInPeriod(benefit, d("2026-04-10"))).toBe(false);
  });

  it("returns false for since_last_use exactly at cooldown expiry", () => {
    // cooldown=5, used Apr 1, check Apr 6: cooldownEnd = Apr 6, today < Apr 6 is false → available
    const benefit = makeBenefit({
      resetType: "since_last_use",
      resetConfig: { cooldownDays: 5 },
      usageRecords: [{ usedDate: "2026-04-01", faceValue: 100, actualValue: 100, kind: "usage" }],
    });
    expect(isBenefitUsedInPeriod(benefit, d("2026-04-06"))).toBe(false);
  });

  it("returns true for since_last_use one day before cooldown expiry", () => {
    const benefit = makeBenefit({
      resetType: "since_last_use",
      resetConfig: { cooldownDays: 5 },
      usageRecords: [{ usedDate: "2026-04-01", faceValue: 100, actualValue: 100, kind: "usage" }],
    });
    expect(isBenefitUsedInPeriod(benefit, d("2026-04-05"))).toBe(true);
  });

  it("returns false for since_last_use with cooldown=0", () => {
    const benefit = makeBenefit({
      resetType: "since_last_use",
      resetConfig: { cooldownDays: 0 },
      usageRecords: [{ usedDate: "2026-04-01", faceValue: 100, actualValue: 100, kind: "usage" }],
    });
    expect(isBenefitUsedInPeriod(benefit, d("2026-04-10"))).toBe(false);
  });

  it("returns true for anniversary when used in current membership year (consumed == faceValue)", () => {
    const benefit = makeBenefit({
      resetType: "anniversary",
      resetConfig: {},
      usageRecords: [{ usedDate: "2026-04-01", faceValue: 100, actualValue: 50, kind: "usage" }],
    });
    expect(isBenefitUsedInPeriod(benefit, d("2026-04-10"), "2024-03-15")).toBe(true);
  });

  it("returns true for one_time when has any records", () => {
    const benefit = makeBenefit({
      resetType: "one_time",
      resetConfig: {},
      usageRecords: [{ usedDate: "2020-01-01", faceValue: 100, actualValue: 100, kind: "usage" }],
    });
    expect(isBenefitUsedInPeriod(benefit, d("2026-04-10"))).toBe(true);
  });

  it("returns false for one_time when no records", () => {
    const benefit = makeBenefit({
      resetType: "one_time",
      resetConfig: {},
      usageRecords: [],
    });
    expect(isBenefitUsedInPeriod(benefit, d("2026-04-10"))).toBe(false);
  });

  it("rollover marker alone (faceValue=0 contribution) does not mark cycle as used under cumulative rule", () => {
    // Under the new cumulative face-value semantic, rollover records have
    // faceValue = 0 and therefore do not consume any of the cycle's face
    // value. A lone rollover marker leaves the cycle available, not used.
    const benefit = makeBenefit({
      resetType: "calendar",
      resetConfig: { period: "quarterly" },
      rolloverable: true,
      rolloverMaxYears: 2,
      usageRecords: [
        { usedDate: "2026-04-01", faceValue: 0, actualValue: 0, kind: "rollover" },
      ],
    });
    expect(isBenefitUsedInPeriod(benefit, d("2026-05-10"))).toBe(false);
  });

  it("ignores past-cycle rollover markers when checking the current cycle", () => {
    const benefit = makeBenefit({
      resetType: "calendar",
      resetConfig: { period: "quarterly" },
      rolloverable: true,
      rolloverMaxYears: 2,
      usageRecords: [
        { usedDate: "2026-01-01", faceValue: 0, actualValue: 0, kind: "rollover" },
      ],
    });
    expect(isBenefitUsedInPeriod(benefit, d("2026-05-10"))).toBe(false);
  });
});

describe("isApplicableNow", () => {
  it("returns true when no applicableMonths", () => {
    const benefit = makeBenefit({ resetConfig: { period: "monthly" } });
    expect(isApplicableNow(benefit, d("2026-04-10"))).toBe(true);
  });

  it("returns true when current month is in applicableMonths", () => {
    const benefit = makeBenefit({
      resetConfig: { period: "semi_annual", applicableMonths: [1, 2, 3, 4, 5, 6] },
    });
    expect(isApplicableNow(benefit, d("2026-04-10"))).toBe(true);
  });

  it("returns false when current month is not in applicableMonths", () => {
    const benefit = makeBenefit({
      resetConfig: { period: "semi_annual", applicableMonths: [1, 2, 3, 4, 5, 6] },
    });
    expect(isApplicableNow(benefit, d("2026-10-15"))).toBe(false);
  });

  it("returns true for one_time before expiresDate", () => {
    const benefit = makeBenefit({
      resetType: "one_time",
      resetConfig: { expiresDate: "2026-06-30" },
    });
    expect(isApplicableNow(benefit, d("2026-04-10"))).toBe(true);
  });

  it("returns false for one_time after expiresDate", () => {
    const benefit = makeBenefit({
      resetType: "one_time",
      resetConfig: { expiresDate: "2026-06-30" },
    });
    expect(isApplicableNow(benefit, d("2026-07-01"))).toBe(false);
  });

  it("returns true for one_time without expiresDate", () => {
    const benefit = makeBenefit({
      resetType: "one_time",
      resetConfig: {},
    });
    expect(isApplicableNow(benefit, d("2026-04-10"))).toBe(true);
  });

  it("returns false for one_time before availableFromDate", () => {
    const benefit = makeBenefit({
      resetType: "one_time",
      resetConfig: { availableFromDate: "2026-07-01", expiresDate: "2026-12-31" },
    });
    expect(isApplicableNow(benefit, d("2026-04-15"))).toBe(false);
  });

  it("returns true for one_time on availableFromDate", () => {
    const benefit = makeBenefit({
      resetType: "one_time",
      resetConfig: { availableFromDate: "2026-07-01", expiresDate: "2026-12-31" },
    });
    expect(isApplicableNow(benefit, d("2026-07-01"))).toBe(true);
  });

  it("returns true for one_time within [availableFromDate, expiresDate]", () => {
    const benefit = makeBenefit({
      resetType: "one_time",
      resetConfig: { availableFromDate: "2026-07-01", expiresDate: "2026-12-31" },
    });
    expect(isApplicableNow(benefit, d("2026-09-15"))).toBe(true);
  });

  it("returns false for one_time after expiresDate even when availableFromDate set", () => {
    const benefit = makeBenefit({
      resetType: "one_time",
      resetConfig: { availableFromDate: "2026-07-01", expiresDate: "2026-12-31" },
    });
    expect(isApplicableNow(benefit, d("2027-01-01"))).toBe(false);
  });
});

describe("isInCurrentCycle", () => {
  it("returns true for one_time benefit when today is before availableFromDate but on or before expiresDate", () => {
    const benefit = makeBenefit({
      resetType: "one_time",
      resetConfig: { availableFromDate: "2026-07-01", expiresDate: "2026-12-31" },
    });
    expect(isInCurrentCycle(benefit, d("2026-04-16"))).toBe(true);
  });

  it("returns false for one_time benefit when today is after expiresDate", () => {
    const benefit = makeBenefit({
      resetType: "one_time",
      resetConfig: { availableFromDate: "2026-07-01", expiresDate: "2026-12-31" },
    });
    expect(isInCurrentCycle(benefit, d("2027-01-01"))).toBe(false);
  });

  it("returns true for one_time benefit when today is within [availableFromDate, expiresDate]", () => {
    const benefit = makeBenefit({
      resetType: "one_time",
      resetConfig: { availableFromDate: "2026-07-01", expiresDate: "2026-12-31" },
    });
    expect(isInCurrentCycle(benefit, d("2026-09-15"))).toBe(true);
  });

  it("returns true for one_time benefit with no expiresDate even far before availableFromDate", () => {
    const benefit = makeBenefit({
      resetType: "one_time",
      resetConfig: { availableFromDate: "2030-01-01" },
    });
    expect(isInCurrentCycle(benefit, d("2026-04-16"))).toBe(true);
  });

  it("matches isApplicableNow for calendar benefit in current month", () => {
    const benefit = makeBenefit({ resetConfig: { period: "monthly" } });
    const today = d("2026-04-10");
    expect(isInCurrentCycle(benefit, today)).toBe(isApplicableNow(benefit, today));
  });

  it("matches isApplicableNow for calendar benefit outside applicableMonths", () => {
    const benefit = makeBenefit({
      resetConfig: { period: "semi_annual", applicableMonths: [1, 2, 3, 4, 5, 6] },
    });
    const today = d("2026-10-15");
    expect(isInCurrentCycle(benefit, today)).toBe(isApplicableNow(benefit, today));
    expect(isInCurrentCycle(benefit, today)).toBe(false);
  });
});

describe("getDeadline", () => {
  it("returns end of month for calendar monthly", () => {
    expect(
      getDeadline(d("2026-04-10"), { resetType: "calendar", resetConfig: { period: "monthly" } }),
    ).toBe("2026-04-30");
  });

  it("returns end of quarter for calendar quarterly", () => {
    expect(
      getDeadline(d("2026-04-10"), { resetType: "calendar", resetConfig: { period: "quarterly" } }),
    ).toBe("2026-06-30");
  });

  it("returns end of H1 for semi-annual in April", () => {
    expect(
      getDeadline(d("2026-04-10"), {
        resetType: "calendar",
        resetConfig: { period: "semi_annual" },
      }),
    ).toBe("2026-06-30");
  });

  it("returns Dec 31 for annual", () => {
    expect(
      getDeadline(d("2026-04-10"), { resetType: "calendar", resetConfig: { period: "annual" } }),
    ).toBe("2026-12-31");
  });

  it("returns day before next anniversary for anniversary type", () => {
    expect(
      getDeadline(d("2026-04-10"), {
        resetType: "anniversary",
        resetConfig: {},
        cardOpenDate: "2024-03-15",
      }),
    ).toBe("2027-03-14");
  });

  it("returns end of month for subscription", () => {
    expect(
      getDeadline(d("2026-04-10"), {
        resetType: "subscription",
        resetConfig: {},
      }),
    ).toBe("2026-04-30");
  });

  it("returns null for since_last_use", () => {
    expect(
      getDeadline(d("2026-04-10"), {
        resetType: "since_last_use",
        resetConfig: { cooldownDays: 30 },
      }),
    ).toBeNull();
  });

  it("returns expiresDate for one_time with expiresDate", () => {
    expect(
      getDeadline(d("2026-04-10"), {
        resetType: "one_time",
        resetConfig: { expiresDate: "2026-06-30" },
      }),
    ).toBe("2026-06-30");
  });

  it("returns null for one_time without expiresDate", () => {
    expect(
      getDeadline(d("2026-04-10"), { resetType: "one_time", resetConfig: {} }),
    ).toBeNull();
  });
});

describe("getDaysRemaining", () => {
  it("returns positive for future deadline", () => {
    expect(getDaysRemaining(d("2026-04-10"), "2026-04-30")).toBe(20);
  });

  it("returns 0 when deadline is today", () => {
    expect(getDaysRemaining(d("2026-04-10"), "2026-04-10")).toBe(0);
  });

  it("returns negative for past deadline", () => {
    expect(getDaysRemaining(d("2026-04-10"), "2026-04-05")).toBe(-5);
  });
});

describe("monthly subscription — current-month usage", () => {
  const today = new Date(2026, 3, 14); // 2026-04-14

  const makeSubBenefit = (
    records: { usedDate: string; actualValue: number }[] = [],
  ): Benefit => ({
    id: "b",
    name: "Netflix",
    description: "",
    faceValue: 20,
    category: "streaming",
    resetType: "subscription",
    resetConfig: { period: "monthly" },
    isHidden: false,
    rolloverable: false,
    rolloverMaxYears: 0,
    usageRecords: records.map((r) => ({ ...r, faceValue: 20, kind: "usage" as const })),
  });

  it("isBenefitUsedInPeriod returns false when current month has no record (regression: previously true)", () => {
    const benefit = makeSubBenefit([]);
    expect(isBenefitUsedInPeriod(benefit, today)).toBe(false);
  });

  it("isBenefitUsedInPeriod returns true when current month has a record", () => {
    const benefit = makeSubBenefit([
      { usedDate: "2026-04-01", actualValue: 15 },
    ]);
    expect(isBenefitUsedInPeriod(benefit, today)).toBe(true);
  });

  it("getDeadline returns end-of-month for monthly subscription (regression: previously null)", () => {
    expect(
      getDeadline(today, {
        resetType: "subscription",
        resetConfig: { period: "monthly" },
      }),
    ).toBe("2026-04-30");
  });
});

// --- Batch 1: cumulative face-value semantics ---
describe("cumulative face-value used-ness", () => {
  describe("faceValue > 0: used iff sum(records.faceValue) >= totalFace", () => {
    it("partial consumption (50 of 200) → NOT used", () => {
      const b = makeBenefit({
        faceValue: 200,
        resetType: "calendar",
        resetConfig: { period: "annual" },
        usageRecords: [
          { usedDate: "2026-04-01", faceValue: 50, actualValue: 50, kind: "usage" },
        ],
      });
      expect(isBenefitUsedInPeriod(b, d("2026-04-10"))).toBe(false);
    });

    it("exact consumption (50+75+75=200 of 200) → USED", () => {
      const b = makeBenefit({
        faceValue: 200,
        resetType: "calendar",
        resetConfig: { period: "annual" },
        usageRecords: [
          { usedDate: "2026-02-01", faceValue: 50, actualValue: 50, kind: "usage" },
          { usedDate: "2026-03-15", faceValue: 75, actualValue: 75, kind: "usage" },
          { usedDate: "2026-04-02", faceValue: 75, actualValue: 75, kind: "usage" },
        ],
      });
      expect(isBenefitUsedInPeriod(b, d("2026-04-10"))).toBe(true);
    });

    it("over-consumption (50+75+80=205 of 200) → USED", () => {
      const b = makeBenefit({
        faceValue: 200,
        resetType: "calendar",
        resetConfig: { period: "annual" },
        usageRecords: [
          { usedDate: "2026-02-01", faceValue: 50, actualValue: 50, kind: "usage" },
          { usedDate: "2026-03-15", faceValue: 75, actualValue: 75, kind: "usage" },
          { usedDate: "2026-04-02", faceValue: 80, actualValue: 80, kind: "usage" },
        ],
      });
      expect(isBenefitUsedInPeriod(b, d("2026-04-10"))).toBe(true);
    });
  });

  describe("faceValue == 0: any usage record in the cycle → USED", () => {
    it("one usage record → USED", () => {
      const b = makeBenefit({
        faceValue: 0,
        resetType: "calendar",
        resetConfig: { period: "annual" },
        usageRecords: [
          { usedDate: "2026-04-05", faceValue: 0, actualValue: 0, kind: "usage" },
        ],
      });
      expect(isBenefitUsedInPeriod(b, d("2026-04-10"))).toBe(true);
    });

    it("only rollover record (no usage) → NOT used", () => {
      const b = makeBenefit({
        faceValue: 0,
        resetType: "calendar",
        resetConfig: { period: "annual" },
        usageRecords: [
          { usedDate: "2026-01-01", faceValue: 0, actualValue: 0, kind: "rollover" },
        ],
      });
      expect(isBenefitUsedInPeriod(b, d("2026-04-10"))).toBe(false);
    });

    it("no records → NOT used", () => {
      const b = makeBenefit({
        faceValue: 0,
        resetType: "calendar",
        resetConfig: { period: "annual" },
        usageRecords: [],
      });
      expect(isBenefitUsedInPeriod(b, d("2026-04-10"))).toBe(false);
    });
  });

  describe("subscription benefits follow the same cumulative rule", () => {
    it("subscription faceValue=20, single record faceValue=20 → USED", () => {
      const b = makeBenefit({
        faceValue: 20,
        resetType: "subscription",
        resetConfig: {},
        usageRecords: [
          { usedDate: "2026-04-05", faceValue: 20, actualValue: 20, kind: "usage" },
        ],
      });
      expect(isBenefitUsedInPeriod(b, d("2026-04-10"))).toBe(true);
    });

    it("subscription faceValue=20, partial record faceValue=5 → NOT used", () => {
      const b = makeBenefit({
        faceValue: 20,
        resetType: "subscription",
        resetConfig: {},
        usageRecords: [
          { usedDate: "2026-04-05", faceValue: 5, actualValue: 5, kind: "usage" },
        ],
      });
      expect(isBenefitUsedInPeriod(b, d("2026-04-10"))).toBe(false);
    });
  });

  describe("rollover accumulates totalFace, not consumption", () => {
    it("rolled-in 200 + face 200, consumed 200 → NOT used (remaining 200)", () => {
      const b = makeBenefit({
        faceValue: 200,
        rolloverable: true,
        rolloverMaxYears: 1,
        resetType: "calendar",
        resetConfig: { period: "semi_annual" },
        usageRecords: [
          // H1 rolled over
          { usedDate: "2026-01-01", faceValue: 0, actualValue: 0, kind: "rollover" },
          // H2 so far: 200 consumed
          { usedDate: "2026-07-15", faceValue: 200, actualValue: 200, kind: "usage" },
        ],
      });
      // H2 totalFace = 200 + 200 (rolled) = 400. Consumed = 200. Remaining = 200.
      expect(isBenefitUsedInPeriod(b, d("2026-07-20"))).toBe(false);
    });

    it("rolled-in 200 + face 200, consumed 400 → USED", () => {
      const b = makeBenefit({
        faceValue: 200,
        rolloverable: true,
        rolloverMaxYears: 1,
        resetType: "calendar",
        resetConfig: { period: "semi_annual" },
        usageRecords: [
          { usedDate: "2026-01-01", faceValue: 0, actualValue: 0, kind: "rollover" },
          { usedDate: "2026-07-15", faceValue: 200, actualValue: 200, kind: "usage" },
          { usedDate: "2026-08-10", faceValue: 200, actualValue: 200, kind: "usage" },
        ],
      });
      expect(isBenefitUsedInPeriod(b, d("2026-09-01"))).toBe(true);
    });
  });
});

describe("getConsumedInPeriod", () => {
  it("returns 0 for benefit with no records", () => {
    const b = makeBenefit({ usageRecords: [] });
    expect(getConsumedInPeriod(b, d("2026-04-10"))).toBe(0);
  });

  it("sums faceValue across multiple usage records in the current cycle", () => {
    const b = makeBenefit({
      faceValue: 200,
      resetType: "calendar",
      resetConfig: { period: "annual" },
      usageRecords: [
        { usedDate: "2026-02-01", faceValue: 30, actualValue: 30, kind: "usage" },
        { usedDate: "2026-03-15", faceValue: 70, actualValue: 60, kind: "usage" },
      ],
    });
    expect(getConsumedInPeriod(b, d("2026-04-10"))).toBe(100);
  });

  it("sums both usage and rollover kinds (rollover contributes 0 by convention)", () => {
    const b = makeBenefit({
      faceValue: 100,
      resetType: "calendar",
      resetConfig: { period: "quarterly" },
      usageRecords: [
        { usedDate: "2026-04-01", faceValue: 0, actualValue: 0, kind: "rollover" },
        { usedDate: "2026-05-10", faceValue: 60, actualValue: 60, kind: "usage" },
      ],
    });
    // Q2 2026 current cycle → rollover(0) + usage(60) = 60
    expect(getConsumedInPeriod(b, d("2026-05-20"))).toBe(60);
  });

  it("ignores records outside the current cycle", () => {
    const b = makeBenefit({
      faceValue: 100,
      resetType: "calendar",
      resetConfig: { period: "quarterly" },
      usageRecords: [
        { usedDate: "2026-01-15", faceValue: 100, actualValue: 100, kind: "usage" }, // Q1
        { usedDate: "2026-05-10", faceValue: 40, actualValue: 40, kind: "usage" }, // Q2
      ],
    });
    expect(getConsumedInPeriod(b, d("2026-05-20"))).toBe(40);
  });

  it("returns 0 for one_time and since_last_use (no cycle concept)", () => {
    const ot = makeBenefit({
      resetType: "one_time",
      resetConfig: {},
      usageRecords: [
        { usedDate: "2026-01-01", faceValue: 50, actualValue: 50, kind: "usage" },
      ],
    });
    expect(getConsumedInPeriod(ot, d("2026-04-10"))).toBe(0);

    const slu = makeBenefit({
      resetType: "since_last_use",
      resetConfig: { cooldownDays: 30 },
      usageRecords: [
        { usedDate: "2026-04-01", faceValue: 100, actualValue: 100, kind: "usage" },
      ],
    });
    expect(getConsumedInPeriod(slu, d("2026-04-10"))).toBe(0);
  });

  it("sums anniversary-cycle records using cardOpenDate", () => {
    const b = makeBenefit({
      faceValue: 500,
      resetType: "anniversary",
      resetConfig: {},
      usageRecords: [
        // Cycle A:2026 runs [2026-03-15, 2027-03-14]
        { usedDate: "2026-04-01", faceValue: 100, actualValue: 100, kind: "usage" },
        { usedDate: "2026-08-10", faceValue: 150, actualValue: 150, kind: "usage" },
        // Previous cycle A:2025 — should be excluded
        { usedDate: "2025-04-01", faceValue: 300, actualValue: 300, kind: "usage" },
      ],
    });
    expect(getConsumedInPeriod(b, d("2026-10-01"), "2024-03-15")).toBe(250);
  });
});


