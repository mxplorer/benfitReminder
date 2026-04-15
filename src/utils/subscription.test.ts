import { describe, it, expect } from "vitest";
import { formatMonthKey } from "./subscription";

describe("formatMonthKey", () => {
  it("formats Date as YYYY-MM", () => {
    expect(formatMonthKey(new Date(2026, 3, 14))).toBe("2026-04");
  });

  it("pads single-digit months", () => {
    expect(formatMonthKey(new Date(2026, 0, 1))).toBe("2026-01");
  });
});
