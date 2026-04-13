import { describe, it, expect } from "vitest";
import type { Benefit } from "../models/types";
import {
  getPeriodRangeAt,
  getPreviousPeriodStart,
  getAvailableValue,
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
  autoRecur: false,
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
          faceValue: 0,
          actualValue: 0,
          isRollover: true,
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
          faceValue: 0,
          actualValue: 0,
          isRollover: true,
        },
        {
          usedDate: "2026-04-15",
          faceValue: 0,
          actualValue: 0,
          isRollover: true,
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
        { usedDate: "2026-01-15", faceValue: 100, actualValue: 80 }, // actual use Q1
        {
          usedDate: "2026-04-15",
          faceValue: 0,
          actualValue: 0,
          isRollover: true,
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
          faceValue: 0,
          actualValue: 0,
          isRollover: true,
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
          faceValue: 0,
          actualValue: 0,
          isRollover: true,
        },
        {
          usedDate: "2025-07-15",
          faceValue: 0,
          actualValue: 0,
          isRollover: true,
        },
        {
          usedDate: "2026-01-15",
          faceValue: 0,
          actualValue: 0,
          isRollover: true,
        },
      ],
    });
    // max 1yr = 2 periods -> count 2026H1 + 2025H2 = 300+300+300 = 900
    expect(getAvailableValue(b, d("2026-07-15"))).toBe(900);
  });
  it("ignores rollover for non-calendar reset types", () => {
    const b = makeBenefit({
      resetType: "anniversary",
      rolloverable: true,
      usageRecords: [
        {
          usedDate: "2026-01-15",
          faceValue: 0,
          actualValue: 0,
          isRollover: true,
        },
      ],
    });
    expect(getAvailableValue(b, d("2026-07-15"))).toBe(300);
  });
});
