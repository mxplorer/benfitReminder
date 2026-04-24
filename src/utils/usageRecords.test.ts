import { describe, it, expect } from "vitest";
import type { Benefit, UsageRecord } from "../models/types";
import {
  cycleStartForDate,
  getLatestRecord,
  latestHasPropagate,
  makeRolloverRecord,
  makeUsageRecord,
} from "./usageRecords";

const makeRecord = (overrides: Partial<UsageRecord> = {}): UsageRecord => ({
  usedDate: "2026-01-01",
  faceValue: 10,
  actualValue: 10,
  kind: "usage",
  ...overrides,
});

const makeBenefit = (records: UsageRecord[]): Benefit => ({
  id: "b1",
  name: "test",
  description: "",
  faceValue: 10,
  category: "dining",
  resetType: "subscription",
  resetConfig: {},
  isHidden: false,
  rolloverable: false,
  rolloverMaxYears: 0,
  usageRecords: records,
});

describe("getLatestRecord", () => {
  it("returns undefined for empty array", () => {
    expect(getLatestRecord([])).toBeUndefined();
  });

  it("returns the single record when only one exists", () => {
    const only = makeRecord({ usedDate: "2026-03-15" });
    expect(getLatestRecord([only])).toEqual(only);
  });

  it("returns the record with the largest usedDate when multiple exist", () => {
    const a = makeRecord({ usedDate: "2026-01-01", actualValue: 1 });
    const b = makeRecord({ usedDate: "2026-03-01", actualValue: 3 });
    const c = makeRecord({ usedDate: "2026-02-01", actualValue: 2 });
    expect(getLatestRecord([a, b, c])).toEqual(b);
  });

  it("does not leak propagateNext from earlier records when latest has none", () => {
    // Earlier record opted in to propagate, but the newest record did not.
    // getLatestRecord must return the newest record regardless.
    const earlier = makeRecord({ usedDate: "2026-01-01", propagateNext: true });
    const latest = makeRecord({ usedDate: "2026-02-01" });
    const result = getLatestRecord([earlier, latest]);
    expect(result).toEqual(latest);
    expect(result?.propagateNext).toBeUndefined();
  });

  it("does not mutate the input array", () => {
    const a = makeRecord({ usedDate: "2026-01-01" });
    const b = makeRecord({ usedDate: "2026-03-01" });
    const input = [a, b];
    getLatestRecord(input);
    expect(input).toEqual([a, b]);
  });
});

describe("latestHasPropagate", () => {
  it("returns false for a benefit with no records", () => {
    expect(latestHasPropagate(makeBenefit([]))).toBe(false);
  });

  it("returns true when latest record has propagateNext: true", () => {
    const b = makeBenefit([makeRecord({ usedDate: "2026-02-01", propagateNext: true })]);
    expect(latestHasPropagate(b)).toBe(true);
  });

  it("returns false when latest record has propagateNext: false", () => {
    const b = makeBenefit([makeRecord({ usedDate: "2026-02-01", propagateNext: false })]);
    expect(latestHasPropagate(b)).toBe(false);
  });

  it("returns false when latest record has propagateNext undefined", () => {
    const b = makeBenefit([makeRecord({ usedDate: "2026-02-01" })]);
    expect(latestHasPropagate(b)).toBe(false);
  });

  it("returns false when an earlier record propagated but the latest did not (chain break)", () => {
    const b = makeBenefit([
      makeRecord({ usedDate: "2026-01-01", propagateNext: true }),
      makeRecord({ usedDate: "2026-02-01", propagateNext: false }),
    ]);
    expect(latestHasPropagate(b)).toBe(false);
  });
});

describe("makeUsageRecord", () => {
  it("tags the record as 'usage' and preserves core fields", () => {
    const r = makeUsageRecord({ usedDate: "2026-03-15", faceValue: 100, actualValue: 80 });
    expect(r).toEqual({
      usedDate: "2026-03-15",
      faceValue: 100,
      actualValue: 80,
      kind: "usage",
    });
  });

  it("forwards propagateNext when supplied", () => {
    const r = makeUsageRecord({
      usedDate: "2026-03-15",
      faceValue: 25,
      actualValue: 25,
      propagateNext: true,
    });
    expect(r.propagateNext).toBe(true);
    expect(r.kind).toBe("usage");
  });

  it("omits propagateNext when undefined (no stray property)", () => {
    const r = makeUsageRecord({ usedDate: "2026-03-15", faceValue: 10, actualValue: 10 });
    expect("propagateNext" in r).toBe(false);
  });
});

describe("makeRolloverRecord", () => {
  it("stores the supplied faceValue, zero actualValue, and cycleStart usedDate", () => {
    const r = makeRolloverRecord("2026-01-01", 300);
    expect(r).toEqual({
      usedDate: "2026-01-01",
      faceValue: 300,
      actualValue: 0,
      kind: "rollover",
    });
  });

  it("accepts a partial amount (< benefit faceValue) — factory does not clamp", () => {
    // Callers (generateRolloverRecords, store write paths) are responsible
    // for capping. The factory just records what it's told.
    const r = makeRolloverRecord("2026-01-01", 23);
    expect(r.faceValue).toBe(23);
    expect(r.kind).toBe("rollover");
  });

  it("accepts faceValue=0 (legacy shape — callers migrate before reading)", () => {
    const r = makeRolloverRecord("2026-01-01", 0);
    expect(r.faceValue).toBe(0);
  });
});

describe("cycleStartForDate", () => {
  const d = (iso: string) => new Date(iso + "T00:00:00");
  it("monthly: first of month", () => {
    expect(cycleStartForDate(d("2026-03-15"), "monthly")).toBe("2026-03-01");
  });
  it("quarterly: first of quarter", () => {
    expect(cycleStartForDate(d("2026-05-20"), "quarterly")).toBe("2026-04-01");
    expect(cycleStartForDate(d("2026-01-10"), "quarterly")).toBe("2026-01-01");
    expect(cycleStartForDate(d("2026-12-31"), "quarterly")).toBe("2026-10-01");
  });
  it("semi_annual: H1/H2 boundary", () => {
    expect(cycleStartForDate(d("2026-06-30"), "semi_annual")).toBe("2026-01-01");
    expect(cycleStartForDate(d("2026-07-01"), "semi_annual")).toBe("2026-07-01");
  });
  it("annual: Jan 1", () => {
    expect(cycleStartForDate(d("2026-08-15"), "annual")).toBe("2026-01-01");
  });
  it("every_4_years: block start", () => {
    expect(cycleStartForDate(d("2026-08-15"), "every_4_years")).toBe("2024-01-01");
    expect(cycleStartForDate(d("2028-01-01"), "every_4_years")).toBe("2028-01-01");
  });
});
