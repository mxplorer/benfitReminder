import { createLogger } from "../lib/logger";
import { parseCardTypeJson } from "../models/cardTypeLoader";
import type { CardType } from "../models/types";
import { syncAllCardsWithTemplates } from "../utils/templateSync";
import { useCardStore } from "../stores/useCardStore";
import { useCardTypeStore } from "../stores/useCardTypeStore";
import { formatDate } from "../utils/period";

const logger = createLogger("tauri.cardTypePersistence");
const CARD_TYPES_DIR = "card-types";

interface UserCardTypeEntry {
  slug: string;
  jsonFile: string;
  imageFile?: string;
}

/**
 * Parse a list of filenames into slug → json/image pairs.
 * Only considers .json and .webp files.
 */
export const parseUserCardTypeDir = (filenames: string[]): UserCardTypeEntry[] => {
  const jsonFiles = filenames.filter((f) => f.endsWith(".json"));
  const webpFiles = new Set(filenames.filter((f) => f.endsWith(".webp")));

  return jsonFiles.map((jsonFile) => {
    const slug = jsonFile.replace(/\.json$/, "");
    const imageFile = `${slug}.webp`;
    return {
      slug,
      jsonFile,
      imageFile: webpFiles.has(imageFile) ? imageFile : undefined,
    };
  });
};

/**
 * Load all user-created card types from appConfigDir/card-types/.
 * Returns empty array outside Tauri or if directory doesn't exist.
 */
export const loadUserCardTypes = async (): Promise<CardType[]> => {
  if (!("__TAURI_INTERNALS__" in window)) return [];

  try {
    const { readDir, readTextFile } = await import("@tauri-apps/plugin-fs");
    const { appConfigDir, join } = await import("@tauri-apps/api/path");
    const { convertFileSrc } = await import("@tauri-apps/api/core");

    const baseDir = await appConfigDir();
    const typesDir = await join(baseDir, CARD_TYPES_DIR);

    let entries: { name?: string }[];
    try {
      entries = await readDir(typesDir);
    } catch {
      return [];
    }

    const filenames = entries.map((e) => e.name).filter((n): n is string => !!n);
    const pairs = parseUserCardTypeDir(filenames);
    const results: CardType[] = [];

    for (const { slug, jsonFile, imageFile } of pairs) {
      try {
        const jsonPath = await join(typesDir, jsonFile);
        const text = await readTextFile(jsonPath);
        const raw = JSON.parse(text) as unknown;
        const parsed = parseCardTypeJson(raw);

        let image: string | undefined;
        if (imageFile) {
          const imagePath = await join(typesDir, imageFile);
          image = convertFileSrc(imagePath);
        }

        results.push({ ...parsed, slug, isBuiltin: false, image });
      } catch (err) {
        logger.warn("Failed to load user card type", { slug, error: String(err) });
      }
    }

    return results;
  } catch (err) {
    logger.warn("Failed to read user card types directory", { error: String(err) });
    return [];
  }
};

/**
 * Serialize a CardType for disk storage. Excludes derived fields (isBuiltin, image)
 * which are reconstructed at load time. Exported for testing.
 */
export const serializeUserCardType = (cardType: CardType): string => {
  const data = {
    slug: cardType.slug,
    name: cardType.name,
    defaultAnnualFee: cardType.defaultAnnualFee,
    color: cardType.color,
    version: cardType.version,
    defaultBenefits: cardType.defaultBenefits,
  };
  return JSON.stringify(data, null, 2);
};

/**
 * Save a user card type JSON to appConfigDir/card-types/{slug}.json.
 */
export const saveUserCardType = async (cardType: CardType): Promise<void> => {
  if (!("__TAURI_INTERNALS__" in window)) return;

  const { writeTextFile, mkdir } = await import("@tauri-apps/plugin-fs");
  const { appConfigDir, join } = await import("@tauri-apps/api/path");

  const baseDir = await appConfigDir();
  const typesDir = await join(baseDir, CARD_TYPES_DIR);
  await mkdir(typesDir, { recursive: true });

  const jsonPath = await join(typesDir, `${cardType.slug}.json`);
  await writeTextFile(jsonPath, serializeUserCardType(cardType));
  logger.info("User card type saved", { slug: cardType.slug });
};

/**
 * Save a user card type with auto-incremented version, backfill missing
 * `templateBenefitId`s, persist to disk, refresh the registry, then re-sync
 * any cards using this template.
 */
export const saveAndSyncUserCardType = async (cardType: CardType): Promise<CardType> => {
  const updated: CardType = {
    ...cardType,
    version: cardType.version + 1,
    defaultBenefits: cardType.defaultBenefits.map((b) => ({
      ...b,
      templateBenefitId: b.templateBenefitId || crypto.randomUUID(),
    })),
  };

  // Persist template (no-op outside Tauri)
  await saveUserCardType(updated);

  // Refresh registry — addUserCardType throws on collision, so remove first
  try {
    useCardTypeStore.getState().removeUserCardType(updated.slug);
  } catch {
    // not registered yet — fine
  }
  useCardTypeStore.getState().addUserCardType(updated);

  // Re-sync any cards using this template
  const cards = useCardStore.getState().cards;
  const templates = useCardTypeStore.getState().cardTypes;
  const today = formatDate(new Date());
  const result = syncAllCardsWithTemplates(cards, templates, today);
  if (result.hasChanges) {
    useCardStore.getState().loadData(result.cards, useCardStore.getState().settings);
  }

  return updated;
};

/**
 * Delete a user card type's JSON and optional image from disk.
 */
export const deleteUserCardType = async (slug: string): Promise<void> => {
  if (!("__TAURI_INTERNALS__" in window)) return;

  const { remove } = await import("@tauri-apps/plugin-fs");
  const { appConfigDir, join } = await import("@tauri-apps/api/path");

  const baseDir = await appConfigDir();
  const typesDir = await join(baseDir, CARD_TYPES_DIR);

  try {
    await remove(await join(typesDir, `${slug}.json`));
  } catch {
    // file may not exist
  }
  try {
    await remove(await join(typesDir, `${slug}.webp`));
  } catch {
    // image may not exist
  }
  logger.info("User card type deleted", { slug });
};
