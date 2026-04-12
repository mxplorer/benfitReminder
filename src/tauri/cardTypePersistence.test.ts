import { describe, it, expect } from "vitest";
import { parseUserCardTypeDir } from "./cardTypePersistence";

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
