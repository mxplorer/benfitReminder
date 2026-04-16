import { describe, it, expect, beforeEach } from "vitest";
import {
  parseUserCardTypeDir,
  serializeUserCardType,
  saveAndSyncUserCardType,
} from "./cardTypePersistence";
import type { CardType, CreditCard } from "../models/types";
import { useCardTypeStore } from "../stores/useCardTypeStore";
import { useCardStore } from "../stores/useCardStore";

describe("parseUserCardTypeDir", () => {
  it("pairs JSON files with optional WebP images", () => {
    const files = ["custom_card.json", "custom_card.webp", "other_card.json"];
    const result = parseUserCardTypeDir(files);
    expect(result).toEqual([
      { slug: "custom_card", jsonFile: "custom_card.json", imageFile: "custom_card.webp" },
      { slug: "other_card", jsonFile: "other_card.json", imageFile: undefined },
    ]);
  });

  it("ignores non-JSON/WebP files", () => {
    const files = ["readme.txt", "card.json", "card.png"];
    const result = parseUserCardTypeDir(files);
    expect(result).toEqual([
      { slug: "card", jsonFile: "card.json", imageFile: undefined },
    ]);
  });
});

describe("serializeUserCardType", () => {
  const baseCardType = (overrides: Partial<CardType> = {}): CardType => ({
    slug: "my_card",
    name: "My Card",
    defaultAnnualFee: 0,
    color: "#fff",
    isBuiltin: false,
    version: 1,
    defaultBenefits: [
      {
        templateBenefitId: "my_card.benefit_a",
        name: "Benefit A",
        description: "Desc",
        faceValue: 100,
        category: "other",
        resetType: "one_time",
        resetConfig: {},
      },
    ],
    ...overrides,
  });

  it("includes version field in serialized output", () => {
    const json = serializeUserCardType(baseCardType({ version: 3 }));
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.version).toBe(3);
  });

  it("includes templateBenefitId on each benefit", () => {
    const json = serializeUserCardType(baseCardType());
    const parsed = JSON.parse(json) as { defaultBenefits: { templateBenefitId: string }[] };
    expect(parsed.defaultBenefits[0].templateBenefitId).toBe("my_card.benefit_a");
  });

  it("excludes derived fields (isBuiltin, image)", () => {
    const json = serializeUserCardType(baseCardType({ image: "http://example.com/img.webp" }));
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.isBuiltin).toBeUndefined();
    expect(parsed.image).toBeUndefined();
  });
});

describe("saveAndSyncUserCardType", () => {
  beforeEach(() => {
    useCardTypeStore.getState().reset();
    useCardStore.setState({ cards: [] });
  });

  const baseCardType = (overrides: Partial<CardType> = {}): CardType => ({
    slug: "my_card",
    name: "My Card",
    defaultAnnualFee: 0,
    color: "#fff",
    isBuiltin: false,
    version: 1,
    defaultBenefits: [
      {
        templateBenefitId: "my_card.existing",
        name: "Existing",
        description: "D",
        faceValue: 100,
        category: "other",
        resetType: "one_time",
        resetConfig: {},
      },
      {
        templateBenefitId: "", // new benefit, no ID yet
        name: "New Benefit",
        description: "D",
        faceValue: 50,
        category: "other",
        resetType: "one_time",
        resetConfig: {},
      },
    ],
    ...overrides,
  });

  it("bumps version and backfills empty templateBenefitIds", async () => {
    // Pre-register the user card type (since saveAndSync expects to update an existing entry)
    useCardTypeStore.getState().addUserCardType(baseCardType());

    const result = await saveAndSyncUserCardType(baseCardType({ version: 1 }));

    expect(result.version).toBe(2);
    expect(result.defaultBenefits[0].templateBenefitId).toBe("my_card.existing");
    expect(result.defaultBenefits[1].templateBenefitId).toBeTruthy();
    expect(result.defaultBenefits[1].templateBenefitId).not.toBe("");
  });

  it("updates the registry with the new version", async () => {
    useCardTypeStore.getState().addUserCardType(baseCardType({ version: 1 }));

    await saveAndSyncUserCardType(baseCardType({ version: 1 }));

    const registered = useCardTypeStore.getState().getCardType("my_card");
    expect(registered).toBeDefined();
    expect(registered?.version).toBe(2);
  });

  it("re-syncs cards using the template", async () => {
    useCardTypeStore.getState().addUserCardType(baseCardType({ version: 1 }));

    // Card using this template at v1
    const card: CreditCard = {
      id: "c1",
      owner: "u",
      cardTypeSlug: "my_card",
      annualFee: 0,
      cardOpenDate: "2025-01-01",
      color: "#fff",
      isEnabled: true,
      templateVersion: 1,
      benefits: [
        {
          id: "b-existing",
          templateBenefitId: "my_card.existing",
          name: "Existing",
          description: "D",
          faceValue: 100,
          category: "other",
          resetType: "one_time",
          resetConfig: {},
          isHidden: false,
          rolloverable: false,
          rolloverMaxYears: 2,
          usageRecords: [],
        },
      ],
    };
    useCardStore.setState({ cards: [card] });

    // Save with renamed existing benefit, so sync should propagate the rename
    const updated: CardType = {
      ...baseCardType({ version: 1 }),
      defaultBenefits: [
        {
          templateBenefitId: "my_card.existing",
          name: "Renamed Existing",
          description: "D",
          faceValue: 100,
          category: "other",
          resetType: "one_time",
          resetConfig: {},
        },
      ],
    };

    await saveAndSyncUserCardType(updated);

    const syncedCard = useCardStore.getState().cards[0];
    expect(syncedCard.templateVersion).toBe(2);
    expect(syncedCard.benefits[0].name).toBe("Renamed Existing");
  });
});
