import { describe, it, expect } from "vitest";
import type { Benefit, CreditCard } from "../models/types";
import { NOTE_MAX_LENGTH } from "../models/types";
import {
  sharedNoteKey,
  resolveGenericNote,
  migrateSharedBenefitNotes,
} from "./benefitNote";

const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "Test Benefit",
  description: "",
  faceValue: 100,
  category: "other",
  resetType: "calendar",
  resetConfig: { period: "monthly" },
  isHidden: false,
  rolloverable: false,
  rolloverMaxYears: 2,
  usageRecords: [],
  ...overrides,
});

const makeCard = (id: string, benefits: Benefit[]): CreditCard => ({
  id,
  owner: "Test",
  cardTypeSlug: "amex_aspire",
  annualFee: 550,
  cardOpenDate: "2024-01-01",
  color: "#000",
  isEnabled: true,
  benefits,
});

describe("sharedNoteKey", () => {
  it("returns the templateBenefitId for template benefits", () => {
    expect(sharedNoteKey(makeBenefit({ templateBenefitId: "amex_aspire.resort_h1" }))).toBe(
      "amex_aspire.resort_h1",
    );
  });

  it("returns null for custom benefits with no templateBenefitId", () => {
    expect(sharedNoteKey(makeBenefit())).toBeNull();
  });
});

describe("resolveGenericNote", () => {
  it("reads the shared map for template benefits", () => {
    const b = makeBenefit({ templateBenefitId: "amex_aspire.resort_h1" });
    expect(resolveGenericNote(b, { "amex_aspire.resort_h1": "book FHR" })).toBe("book FHR");
  });

  it("returns empty string when the shared key is absent", () => {
    const b = makeBenefit({ templateBenefitId: "amex_aspire.resort_h1" });
    expect(resolveGenericNote(b, {})).toBe("");
  });

  it("ignores benefit.note for template benefits (shared map is the source)", () => {
    const b = makeBenefit({ templateBenefitId: "amex_aspire.resort_h1", note: "stale" });
    expect(resolveGenericNote(b, { "amex_aspire.resort_h1": "fresh" })).toBe("fresh");
  });

  it("falls back to benefit.note for custom benefits", () => {
    expect(resolveGenericNote(makeBenefit({ note: "custom note" }), {})).toBe("custom note");
  });

  it("returns empty string for a custom benefit with no note", () => {
    expect(resolveGenericNote(makeBenefit(), {})).toBe("");
  });
});

describe("migrateSharedBenefitNotes", () => {
  it("collects a single template note into the shared map keyed by templateBenefitId", () => {
    const cards = [
      makeCard("c1", [makeBenefit({ templateBenefitId: "amex_aspire.resort_h1", note: "book FHR" })]),
    ];
    const { sharedBenefitNotes } = migrateSharedBenefitNotes(cards);
    expect(sharedBenefitNotes).toEqual({ "amex_aspire.resort_h1": "book FHR" });
  });

  it("strips note off template benefits after collecting", () => {
    const cards = [
      makeCard("c1", [makeBenefit({ templateBenefitId: "amex_aspire.resort_h1", note: "book FHR" })]),
    ];
    const { cards: out } = migrateSharedBenefitNotes(cards);
    expect(out[0].benefits[0].note).toBeUndefined();
  });

  it("collapses identical notes across cards to a single value", () => {
    const cards = [
      makeCard("c1", [makeBenefit({ templateBenefitId: "amex_aspire.resort_h1", note: "same" })]),
      makeCard("c2", [makeBenefit({ templateBenefitId: "amex_aspire.resort_h1", note: "same" })]),
    ];
    const { sharedBenefitNotes } = migrateSharedBenefitNotes(cards);
    expect(sharedBenefitNotes["amex_aspire.resort_h1"]).toBe("same");
  });

  it("newline-joins distinct notes across cards for the same key", () => {
    const cards = [
      makeCard("c1", [makeBenefit({ templateBenefitId: "amex_aspire.resort_h1", note: "first" })]),
      makeCard("c2", [makeBenefit({ templateBenefitId: "amex_aspire.resort_h1", note: "second" })]),
    ];
    const { sharedBenefitNotes } = migrateSharedBenefitNotes(cards);
    expect(sharedBenefitNotes["amex_aspire.resort_h1"]).toBe("first\nsecond");
  });

  it("leaves custom benefits' notes untouched and out of the map", () => {
    const cards = [makeCard("c1", [makeBenefit({ note: "custom" })])];
    const { cards: out, sharedBenefitNotes } = migrateSharedBenefitNotes(cards);
    expect(out[0].benefits[0].note).toBe("custom");
    expect(sharedBenefitNotes).toEqual({});
  });

  it("clamps the joined result to NOTE_MAX_LENGTH", () => {
    const cards = [
      makeCard("c1", [makeBenefit({ templateBenefitId: "k", note: "a".repeat(400) })]),
      makeCard("c2", [makeBenefit({ templateBenefitId: "k", note: "b".repeat(400) })]),
    ];
    const { sharedBenefitNotes } = migrateSharedBenefitNotes(cards);
    expect(sharedBenefitNotes["k"].length).toBe(NOTE_MAX_LENGTH);
  });

  it("returns an empty map when there are no template notes", () => {
    const cards = [makeCard("c1", [makeBenefit()])];
    expect(migrateSharedBenefitNotes(cards).sharedBenefitNotes).toEqual({});
  });
});
