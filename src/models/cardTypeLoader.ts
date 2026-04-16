import type { BenefitTemplate, CardType } from "./types";

export const extractSlugFromPath = (path: string): string => {
  const filename = path.split("/").pop() ?? "";
  return filename.replace(/\.\w+$/, "");
};

export const parseCardTypeJson = (raw: unknown): Omit<CardType, "isBuiltin"> => {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Card type JSON must be an object");
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.slug !== "string" || !obj.slug) {
    throw new Error("Card type missing required field: slug");
  }
  if (typeof obj.name !== "string" || !obj.name) {
    throw new Error("Card type missing required field: name");
  }
  if (typeof obj.color !== "string" || !obj.color) {
    throw new Error("Card type missing required field: color");
  }

  return {
    slug: obj.slug,
    name: obj.name,
    defaultAnnualFee: typeof obj.defaultAnnualFee === "number" ? obj.defaultAnnualFee : 0,
    color: obj.color,
    version: typeof obj.version === "number" ? obj.version : 0,
    defaultBenefits: Array.isArray(obj.defaultBenefits)
      ? (obj.defaultBenefits as BenefitTemplate[])
      : [],
  };
};

export const loadBuiltinCardTypes = (
  jsonModules: Record<string, unknown>,
  imageModules: Record<string, string>,
): CardType[] => {
  const results: CardType[] = [];

  for (const [path, raw] of Object.entries(jsonModules)) {
    const slug = extractSlugFromPath(path);
    const parsed = parseCardTypeJson(raw);
    const imageEntry = Object.entries(imageModules).find(
      ([imgPath]) => extractSlugFromPath(imgPath) === slug,
    );
    results.push({
      ...parsed,
      isBuiltin: true,
      image: imageEntry?.[1],
    });
  }

  return results;
};

export const mergeCardTypes = (builtins: CardType[], userTypes: CardType[]): CardType[] => {
  const builtinSlugs = new Set(builtins.map((b) => b.slug));

  for (const ut of userTypes) {
    if (builtinSlugs.has(ut.slug)) {
      throw new Error(
        `User card type slug "${ut.slug}" conflicts with a built-in card type. Choose a different slug.`,
      );
    }
  }

  return [...builtins, ...userTypes];
};
