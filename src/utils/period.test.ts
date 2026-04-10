import { describe, it, expect } from "vitest";
import type { Benefit } from "../models/types";
import {
  getCurrentPeriodRange,
  formatDate,
  lastDay,
  getMonthRange,
  isBenefitUsedInPeriod,
  isApplicableNow,
  getDeadline,
  getDaysRemaining,
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
  autoRecur: false,
  usageRecords: [],
  ...overrides,
});

describe("isBenefitUsedInPeriod", () => {
  it("returns true when usage record is in current calendar month", () => {
    const benefit = makeBenefit({
      usageRecords: [{ usedDate: "2026-04-05", faceValue: 100, actualValue: 100 }],
    });
    expect(isBenefitUsedInPeriod(benefit, d("2026-04-10"))).toBe(true);
  });

  it("returns false when usage record is in prior month", () => {
    const benefit = makeBenefit({
      usageRecords: [{ usedDate: "2026-03-15", faceValue: 100, actualValue: 100 }],
    });
    expect(isBenefitUsedInPeriod(benefit, d("2026-04-10"))).toBe(false);
  });

  it("returns true for subscription with autoRecur=true regardless of records", () => {
    const benefit = makeBenefit({
      resetType: "subscription",
      resetConfig: {},
      autoRecur: true,
      usageRecords: [],
    });
    expect(isBenefitUsedInPeriod(benefit, d("2026-04-10"))).toBe(true);
  });

  it("returns false for subscription with autoRecur=false when no records this month", () => {
    const benefit = makeBenefit({
      resetType: "subscription",
      resetConfig: {},
      autoRecur: false,
      usageRecords: [],
    });
    expect(isBenefitUsedInPeriod(benefit, d("2026-04-10"))).toBe(false);
  });

  it("returns true for since_last_use within cooldown", () => {
    const benefit = makeBenefit({
      resetType: "since_last_use",
      resetConfig: { cooldownDays: 30 },
      usageRecords: [{ usedDate: "2026-04-01", faceValue: 100, actualValue: 100 }],
    });
    expect(isBenefitUsedInPeriod(benefit, d("2026-04-10"))).toBe(true);
  });

  it("returns false for since_last_use when cooldown expired", () => {
    const benefit = makeBenefit({
      resetType: "since_last_use",
      resetConfig: { cooldownDays: 5 },
      usageRecords: [{ usedDate: "2026-04-01", faceValue: 100, actualValue: 100 }],
    });
    expect(isBenefitUsedInPeriod(benefit, d("2026-04-10"))).toBe(false);
  });

  it("returns false for since_last_use with cooldown=0", () => {
    const benefit = makeBenefit({
      resetType: "since_last_use",
      resetConfig: { cooldownDays: 0 },
      usageRecords: [{ usedDate: "2026-04-01", faceValue: 100, actualValue: 100 }],
    });
    expect(isBenefitUsedInPeriod(benefit, d("2026-04-10"))).toBe(false);
  });

  it("returns true for anniversary when used in current membership year", () => {
    const benefit = makeBenefit({
      resetType: "anniversary",
      resetConfig: {},
      usageRecords: [{ usedDate: "2026-04-01", faceValue: 50, actualValue: 50 }],
    });
    expect(isBenefitUsedInPeriod(benefit, d("2026-04-10"), "2024-03-15")).toBe(true);
  });

  it("returns true for one_time when has any records", () => {
    const benefit = makeBenefit({
      resetType: "one_time",
      resetConfig: {},
      usageRecords: [{ usedDate: "2020-01-01", faceValue: 100, actualValue: 100 }],
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

  it("returns null for subscription with autoRecur", () => {
    expect(
      getDeadline(d("2026-04-10"), {
        resetType: "subscription",
        resetConfig: {},
        autoRecur: true,
      }),
    ).toBeNull();
  });

  it("returns end of month for subscription without autoRecur", () => {
    expect(
      getDeadline(d("2026-04-10"), {
        resetType: "subscription",
        resetConfig: {},
        autoRecur: false,
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
