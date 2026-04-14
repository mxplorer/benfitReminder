import { describe, it, expect } from "vitest";
import { getScopeWindow } from "./cycles";

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
