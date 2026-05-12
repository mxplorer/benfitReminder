import { describe, it, expect } from "vitest";
import { cycleKeyLabel, cycleKeySortValue } from "./cycleKey";

describe("cycleKeyLabel", () => {
  it("formats monthly key as Chinese year/month", () => {
    expect(cycleKeyLabel("M:2026-05")).toBe("2026 年 5 月");
  });

  it("strips leading zero in month label", () => {
    expect(cycleKeyLabel("M:2026-01")).toBe("2026 年 1 月");
  });

  it("formats quarterly key", () => {
    expect(cycleKeyLabel("Q:2026-Q2")).toBe("2026 Q2");
  });

  it("formats H1 semi-annual as 上半年", () => {
    expect(cycleKeyLabel("H:2026-H1")).toBe("2026 上半年");
  });

  it("formats H2 semi-annual as 下半年", () => {
    expect(cycleKeyLabel("H:2026-H2")).toBe("2026 下半年");
  });

  it("formats annual key", () => {
    expect(cycleKeyLabel("Y:2026")).toBe("2026 年");
  });

  it("formats every_4_years as block span", () => {
    expect(cycleKeyLabel("E4:2024")).toBe("2024–2027");
  });

  it("formats anniversary key", () => {
    expect(cycleKeyLabel("A:2026")).toBe("2026 会员年");
  });

  it("formats one_time key", () => {
    expect(cycleKeyLabel("OT:1")).toBe("全期");
  });

  it("formats since_last_use key with the use date", () => {
    expect(cycleKeyLabel("SLU:2026-05-12")).toBe("2026-05-12 起");
  });

  it("returns the original key for unknown shapes", () => {
    expect(cycleKeyLabel("X:weird")).toBe("X:weird");
  });
});

describe("cycleKeySortValue", () => {
  it("sorts monthly keys chronologically", () => {
    const keys = ["M:2026-01", "M:2026-12", "M:2025-06"];
    const sorted = [...keys].sort(
      (a, b) => cycleKeySortValue(b) - cycleKeySortValue(a),
    );
    expect(sorted).toEqual(["M:2026-12", "M:2026-01", "M:2025-06"]);
  });

  it("places newer annual before older annual", () => {
    expect(cycleKeySortValue("Y:2026")).toBeGreaterThan(cycleKeySortValue("Y:2025"));
  });

  it("places Q4 after Q1 of the same year", () => {
    expect(cycleKeySortValue("Q:2026-Q4")).toBeGreaterThan(
      cycleKeySortValue("Q:2026-Q1"),
    );
  });

  it("places H2 after H1 of the same year", () => {
    expect(cycleKeySortValue("H:2026-H2")).toBeGreaterThan(
      cycleKeySortValue("H:2026-H1"),
    );
  });

  it("returns 0 for unknown shapes (stable fallback)", () => {
    expect(cycleKeySortValue("X:weird")).toBe(0);
  });
});
