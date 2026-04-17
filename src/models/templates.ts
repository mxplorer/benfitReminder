import { loadBuiltinCardTypes } from "./cardTypeLoader";
import type { CardType } from "./types";

const jsonModules = import.meta.glob<Record<string, unknown>>(
  "../assets/card-types/*.json",
  { eager: true, import: "default" },
);

const imageModules = import.meta.glob<string>(
  "../assets/card-types/*.webp",
  { eager: true, import: "default" },
);

export const BUILTIN_CARD_TYPES: CardType[] = loadBuiltinCardTypes(jsonModules, imageModules);
