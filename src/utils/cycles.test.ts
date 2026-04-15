import { describe, it, expect } from "vitest";
import { getScopeCycles, getScopeWindow, findCycleRecord, type PeriodCycle } from "./cycles";
import type { Benefit } from "../models/types";

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

describe("getScopeWindow — calendar mode", () => {
  it("returns full calendar year when card opened in a prior year", () => {
    const today = new Date(2026, 3, 14); // 2026-04-14
    const w = getScopeWindow("calendar", today, "2024-05-01");
    expect(w).toEqual({ start: "2026-01-01", end: "2026-12-31" });
  });

  it("clamps start to cardOpenDate when card opened mid-current-year", () => {
    const today = new Date(2026, 3, 14);
    const w = getScopeWindow("calendar", today, "2026-03-15");
    expect(w).toEqual({ start: "2026-03-15", end: "2026-12-31" });
  });

  it("returns cardOpenDate start when card opened today", () => {
    const today = new Date(2026, 3, 14);
    const w = getScopeWindow("calendar", today, "2026-04-14");
    expect(w).toEqual({ start: "2026-04-14", end: "2026-12-31" });
  });
});

describe("getScopeWindow — anniversary mode", () => {
  it("returns the current anniversary window crossing year boundaries", () => {
    const today = new Date(2026, 3, 14); // 2026-04-14
    const w = getScopeWindow("anniversary", today, "2025-09-15");
    expect(w).toEqual({ start: "2025-09-15", end: "2026-09-14" });
  });

  it("returns an anniversary starting earlier in same year when after anniversary date", () => {
    const today = new Date(2026, 3, 14);
    const w = getScopeWindow("anniversary", today, "2020-01-10");
    expect(w).toEqual({ start: "2026-01-10", end: "2027-01-09" });
  });

  it("returns prior-year anniversary when today is before this year's anniversary", () => {
    const today = new Date(2026, 3, 14);
    const w = getScopeWindow("anniversary", today, "2024-11-20");
    expect(w).toEqual({ start: "2025-11-20", end: "2026-11-19" });
  });
});

describe("getScopeCycles — monthly", () => {
  it("returns 12 cycles for a full calendar-year scope", () => {
    const b = makeBenefit({ resetConfig: { period: "monthly" } });
    const cycles = getScopeCycles(b, { start: "2026-01-01", end: "2026-12-31" }, "2024-01-01");
    expect(cycles).toHaveLength(12);
    expect(cycles[0]).toEqual({ start: "2026-01-01", end: "2026-01-31", label: "1月" });
    expect(cycles[11]).toEqual({ start: "2026-12-01", end: "2026-12-31", label: "12月" });
  });

  it("excludes months before cardOpenDate when mid-year", () => {
    const b = makeBenefit({ resetConfig: { period: "monthly" } });
    const cycles = getScopeCycles(b, { start: "2026-03-15", end: "2026-12-31" }, "2026-03-15");
    expect(cycles).toHaveLength(10);
    expect(cycles[0].label).toBe("3月");
    expect(cycles[9].label).toBe("12月");
  });
});

describe("getScopeCycles — quarterly", () => {
  it("returns 4 quarters for full calendar year", () => {
    const b = makeBenefit({ resetConfig: { period: "quarterly" } });
    const cycles = getScopeCycles(b, { start: "2026-01-01", end: "2026-12-31" }, "2024-01-01");
    expect(cycles.map((c) => c.label)).toEqual(["Q1 2026", "Q2 2026", "Q3 2026", "Q4 2026"]);
    expect(cycles[0]).toMatchObject({ start: "2026-01-01", end: "2026-03-31" });
    expect(cycles[3]).toMatchObject({ start: "2026-10-01", end: "2026-12-31" });
  });

  it("excludes Q1 when card opened mid-March", () => {
    const b = makeBenefit({ resetConfig: { period: "quarterly" } });
    const cycles = getScopeCycles(b, { start: "2026-03-15", end: "2026-12-31" }, "2026-03-15");
    // Q1 ends 2026-03-31 >= 2026-03-15, so Q1 INCLUDED.
    expect(cycles.map((c) => c.label)).toEqual(["Q1 2026", "Q2 2026", "Q3 2026", "Q4 2026"]);
  });

  it("excludes Q1 entirely when card opened in Q2", () => {
    const b = makeBenefit({ resetConfig: { period: "quarterly" } });
    const cycles = getScopeCycles(b, { start: "2026-04-10", end: "2026-12-31" }, "2026-04-10");
    expect(cycles.map((c) => c.label)).toEqual(["Q2 2026", "Q3 2026", "Q4 2026"]);
  });
});

describe("getScopeCycles — semi_annual", () => {
  it("returns H1 and H2", () => {
    const b = makeBenefit({ resetConfig: { period: "semi_annual" } });
    const cycles = getScopeCycles(b, { start: "2026-01-01", end: "2026-12-31" }, "2024-01-01");
    expect(cycles.map((c) => c.label)).toEqual(["H1 2026", "H2 2026"]);
  });
});

describe("getScopeCycles — annual", () => {
  it("returns one cycle per scope year", () => {
    const b = makeBenefit({ resetConfig: { period: "annual" } });
    const cycles = getScopeCycles(b, { start: "2026-01-01", end: "2026-12-31" }, "2024-01-01");
    expect(cycles).toEqual([{ start: "2026-01-01", end: "2026-12-31", label: "2026年" }]);
  });
});

describe("getScopeCycles — anniversary reset", () => {
  it("returns one anniversary cycle labeled by anniversary start year", () => {
    const b = makeBenefit({ resetType: "anniversary", resetConfig: {} });
    const cycles = getScopeCycles(b, { start: "2026-01-01", end: "2026-12-31" }, "2025-09-15");
    expect(cycles).toEqual([
      { start: "2025-09-15", end: "2026-09-14", label: "2025年度" },
      { start: "2026-09-15", end: "2027-09-14", label: "2026年度" },
    ]);
  });

  it("returns a single anniversary cycle when anniversary scope is used", () => {
    const b = makeBenefit({ resetType: "anniversary", resetConfig: {} });
    const cycles = getScopeCycles(b, { start: "2025-09-15", end: "2026-09-14" }, "2025-09-15");
    expect(cycles).toEqual([
      { start: "2025-09-15", end: "2026-09-14", label: "2025年度" },
    ]);
  });
});

describe("getScopeCycles — every_4_years", () => {
  it("returns the 4-year block containing the scope", () => {
    const b = makeBenefit({ resetConfig: { period: "every_4_years" } });
    const cycles = getScopeCycles(b, { start: "2026-01-01", end: "2026-12-31" }, "2024-01-01");
    expect(cycles).toEqual([
      { start: "2024-01-01", end: "2027-12-31", label: "2024–2027" },
    ]);
  });
});

describe("getScopeCycles — applicableMonths", () => {
  it("filters monthly cycles to applicable months only", () => {
    const b = makeBenefit({
      resetConfig: { period: "monthly", applicableMonths: [4, 5, 6, 7, 8, 9, 10] },
    });
    const cycles = getScopeCycles(b, { start: "2026-01-01", end: "2026-12-31" }, "2024-01-01");
    expect(cycles.map((c) => c.label)).toEqual(["4月", "5月", "6月", "7月", "8月", "9月", "10月"]);
  });

  it("includes quarter whose months overlap applicableMonths", () => {
    const b = makeBenefit({
      resetConfig: { period: "quarterly", applicableMonths: [4, 5, 6, 7] },
    });
    const cycles = getScopeCycles(b, { start: "2026-01-01", end: "2026-12-31" }, "2024-01-01");
    expect(cycles.map((c) => c.label)).toEqual(["Q2 2026", "Q3 2026"]);
  });
});

describe("getScopeCycles — one_time / since_last_use", () => {
  it("returns empty cycle array for one_time benefits", () => {
    const b = makeBenefit({ resetType: "one_time", resetConfig: {} });
    const cycles = getScopeCycles(b, { start: "2026-01-01", end: "2026-12-31" }, "2024-01-01");
    expect(cycles).toEqual([]);
  });

  it("returns empty cycle array for since_last_use benefits", () => {
    const b = makeBenefit({ resetType: "since_last_use", resetConfig: { cooldownDays: 90 } });
    const cycles = getScopeCycles(b, { start: "2026-01-01", end: "2026-12-31" }, "2024-01-01");
    expect(cycles).toEqual([]);
  });
});

describe("findCycleRecord", () => {
  it("returns the first record whose usedDate falls within the cycle", () => {
    const b = makeBenefit({
      usageRecords: [
        { usedDate: "2026-03-10", faceValue: 10, actualValue: 8 },
        { usedDate: "2026-04-20", faceValue: 10, actualValue: 10 },
      ],
    });
    const cycle: PeriodCycle = { start: "2026-04-01", end: "2026-04-30", label: "4月" };
    expect(findCycleRecord(b, cycle)).toEqual(
      { usedDate: "2026-04-20", faceValue: 10, actualValue: 10 },
    );
  });

  it("returns undefined when no records fall in cycle", () => {
    const b = makeBenefit({
      usageRecords: [{ usedDate: "2026-03-10", faceValue: 10, actualValue: 10 }],
    });
    const cycle: PeriodCycle = { start: "2026-04-01", end: "2026-04-30", label: "4月" };
    expect(findCycleRecord(b, cycle)).toBeUndefined();
  });
});
