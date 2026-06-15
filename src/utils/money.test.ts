import { describe, it, expect } from "vitest";
import { roundMoney, formatMoney } from "./money";

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

describe("formatMoney", () => {
  it("eliminates the subtraction artifact behind the $13.700000000000045 bug", () => {
    // Amex Platinum: $895 fee minus $881.30 redeemed
    expect(formatMoney(895 - 881.3)).toBe("13.7");
  });

  it("caps at two decimal places", () => {
    expect(formatMoney(12.955)).toBe("12.96");
    expect(formatMoney(12.954)).toBe("12.95");
  });

  it("leaves already-clean values unchanged (no forced trailing zeros)", () => {
    expect(formatMoney(895)).toBe("895");
    expect(formatMoney(240.5)).toBe("240.5");
    expect(formatMoney(12.95)).toBe("12.95");
    expect(formatMoney(0)).toBe("0");
  });

  it("preserves negative amounts", () => {
    expect(formatMoney(-13.700000000000045)).toBe("-13.7");
  });
});
