import { describe, it, expect } from "vitest";
import { resolveAutoRecurValue, formatMonthKey } from "./subscription";
import type { Benefit } from "../models/types";

const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "Test",
  description: "",
  faceValue: 20,
  category: "streaming",
  resetType: "subscription",
  resetConfig: { period: "monthly" },
  isHidden: false,
  autoRecur: true,
  rolloverable: false,
  rolloverMaxYears: 0,
  usageRecords: [],
  ...overrides,
});

describe("resolveAutoRecurValue", () => {
  it("returns the most-recent record's actualValue when records exist", () => {
    const benefit = makeBenefit({
      faceValue: 20,
      usageRecords: [
        { usedDate: "2026-02-01", faceValue: 20, actualValue: 15 },
        { usedDate: "2026-03-01", faceValue: 20, actualValue: 12 },
        { usedDate: "2026-01-01", faceValue: 20, actualValue: 20 },
      ],
    });
    expect(resolveAutoRecurValue(benefit)).toBe(12);
  });

  it("returns faceValue when no records exist", () => {
    const benefit = makeBenefit({ faceValue: 20, usageRecords: [] });
    expect(resolveAutoRecurValue(benefit)).toBe(20);
  });

  it("ignores record array order — sorts by usedDate descending", () => {
    const benefit = makeBenefit({
      faceValue: 20,
      usageRecords: [
        { usedDate: "2026-03-01", faceValue: 20, actualValue: 5 },
        { usedDate: "2026-01-01", faceValue: 20, actualValue: 99 },
      ],
    });
    expect(resolveAutoRecurValue(benefit)).toBe(5);
  });
});

describe("formatMonthKey", () => {
  it("formats Date as YYYY-MM", () => {
    expect(formatMonthKey(new Date(2026, 3, 14))).toBe("2026-04");
  });

  it("pads single-digit months", () => {
    expect(formatMonthKey(new Date(2026, 0, 1))).toBe("2026-01");
  });
});
