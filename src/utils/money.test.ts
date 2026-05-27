import { describe, it, expect } from "vitest";
import { roundMoney } from "./money";

describe("roundMoney", () => {
  it("eliminates float subtraction artifacts (9.99 - 2.69)", () => {
    expect(roundMoney(9.99 - 2.69)).toBe(7.3);
  });

  it("eliminates float addition artifacts (0.1 + 0.2)", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it("rounds to nearest cent", () => {
    expect(roundMoney(7.305)).toBe(7.31);
    expect(roundMoney(7.304)).toBe(7.3);
  });

  it("leaves clean values unchanged", () => {
    expect(roundMoney(20)).toBe(20);
    expect(roundMoney(7.3)).toBe(7.3);
    expect(roundMoney(0)).toBe(0);
  });

  it("preserves negative amounts", () => {
    expect(roundMoney(-2.5)).toBe(-2.5);
  });
});
