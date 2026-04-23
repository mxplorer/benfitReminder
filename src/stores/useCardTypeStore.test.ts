import { describe, it, expect, beforeEach } from "vitest";
import { useCardTypeStore } from "./useCardTypeStore";
import type { CardType } from "../models/types";

const mockBuiltin: CardType = {
  slug: "amex_platinum",
  name: "Amex Platinum",
  issuer: "Amex",
  defaultAnnualFee: 895,
  color: "#8E9EAF",
  image: "/amex.webp",
  isBuiltin: true,
  version: 0,
  defaultBenefits: [],
};

const mockUser: CardType = {
  slug: "custom_card",
  name: "My Custom Card",
  issuer: "Chase",
  defaultAnnualFee: 200,
  color: "#FF0000",
  isBuiltin: false,
  version: 0,
  defaultBenefits: [],
};

describe("useCardTypeStore", () => {
  beforeEach(() => {
    useCardTypeStore.getState().reset();
  });

  it("starts with empty registry", () => {
    expect(useCardTypeStore.getState().cardTypes).toEqual([]);
  });

  it("setBuiltinCardTypes populates registry", () => {
    useCardTypeStore.getState().setBuiltinCardTypes([mockBuiltin]);
    expect(useCardTypeStore.getState().cardTypes).toHaveLength(1);
    expect(useCardTypeStore.getState().cardTypes[0].isBuiltin).toBe(true);
  });

  it("addUserCardType adds a user template", () => {
    useCardTypeStore.getState().setBuiltinCardTypes([mockBuiltin]);
    useCardTypeStore.getState().addUserCardType(mockUser);
    expect(useCardTypeStore.getState().cardTypes).toHaveLength(2);
  });

  it("addUserCardType throws on slug collision with built-in", () => {
    useCardTypeStore.getState().setBuiltinCardTypes([mockBuiltin]);
    const collision = { ...mockUser, slug: "amex_platinum" };
    expect(() => { useCardTypeStore.getState().addUserCardType(collision); }).toThrow();
  });

  it("removeUserCardType removes user template", () => {
    useCardTypeStore.getState().setBuiltinCardTypes([mockBuiltin]);
    useCardTypeStore.getState().addUserCardType(mockUser);
    useCardTypeStore.getState().removeUserCardType("custom_card");
    expect(useCardTypeStore.getState().cardTypes).toHaveLength(1);
  });

  it("removeUserCardType throws when trying to remove built-in", () => {
    useCardTypeStore.getState().setBuiltinCardTypes([mockBuiltin]);
    expect(() => { useCardTypeStore.getState().removeUserCardType("amex_platinum"); }).toThrow();
  });

  it("getCardType returns the correct entry", () => {
    useCardTypeStore.getState().setBuiltinCardTypes([mockBuiltin]);
    expect(useCardTypeStore.getState().getCardType("amex_platinum")?.name).toBe("Amex Platinum");
    expect(useCardTypeStore.getState().getCardType("nonexistent")).toBeUndefined();
  });

  it("getCardImage returns image or undefined", () => {
    useCardTypeStore.getState().setBuiltinCardTypes([mockBuiltin]);
    expect(useCardTypeStore.getState().getCardImage("amex_platinum")).toBe("/amex.webp");
    expect(useCardTypeStore.getState().getCardImage("nonexistent")).toBeUndefined();
  });
});
