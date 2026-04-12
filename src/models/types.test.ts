import { describe, it, expect } from "vitest";
import type { CardType, CreditCard } from "./types";
import { getCardDisplayName } from "./types";

const makeCard = (overrides: Partial<CreditCard> = {}): CreditCard => ({
  id: "test-id",
  owner: "Test User",
  cardTypeSlug: "amex_platinum",
  annualFee: 895,
  cardOpenDate: "2024-01-15",
  color: "#8E9EAF",
  isEnabled: true,
  benefits: [],
  ...overrides,
});

describe("getCardDisplayName", () => {
  it("returns alias when present", () => {
    const card = makeCard({ alias: "小号白金", cardNumber: "1234567890" });
    expect(getCardDisplayName(card, "Amex Platinum")).toBe("小号白金");
  });

  it("returns typeName with last 4 digits when no alias but cardNumber present", () => {
    const card = makeCard({ cardNumber: "3782123456" });
    expect(getCardDisplayName(card, "Amex Platinum")).toBe("Amex Platinum ···3456");
  });

  it("returns customName for custom card type", () => {
    const card = makeCard({ cardTypeSlug: "custom", customName: "My Local Card" });
    expect(getCardDisplayName(card)).toBe("My Local Card");
  });

  it("returns type name as fallback", () => {
    const card = makeCard();
    expect(getCardDisplayName(card, "Amex Platinum")).toBe("Amex Platinum");
  });

  it("returns 'Unknown Card' for unrecognized slug without customName", () => {
    const card = makeCard({ cardTypeSlug: "unknown_card" });
    expect(getCardDisplayName(card)).toBe("Unknown Card");
  });
});

describe("CardType", () => {
  it("supports image and isBuiltin fields", () => {
    const ct: CardType = {
      slug: "test",
      name: "Test",
      defaultAnnualFee: 0,
      color: "#000",
      defaultBenefits: [],
      image: "/path.webp",
      isBuiltin: true,
    };
    expect(ct.image).toBe("/path.webp");
    expect(ct.isBuiltin).toBe(true);
  });

  it("image is optional", () => {
    const ct: CardType = {
      slug: "test",
      name: "Test",
      defaultAnnualFee: 0,
      color: "#000",
      defaultBenefits: [],
      isBuiltin: false,
    };
    expect(ct.image).toBeUndefined();
  });
});
