import { describe, it, expect } from "vitest";
import type { Benefit, UsageRecord } from "../models/types";
import { getLatestRecord, latestHasPropagate } from "./usageRecords";

const makeRecord = (overrides: Partial<UsageRecord>): UsageRecord => ({
  usedDate: "2026-01-01",
  faceValue: 10,
  actualValue: 10,
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
