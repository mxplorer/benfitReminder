import { createLogger } from "../lib/logger";
import { BUILTIN_CARD_TYPES } from "../models/templates";
import { useCardStore } from "../stores/useCardStore";
import { useCardTypeStore } from "../stores/useCardTypeStore";
import { formatDate } from "../utils/period";
import { syncAllCardsWithTemplates } from "../utils/templateSync";
import { loadData, saveData } from "./bridge";
import { loadUserCardTypes } from "./cardTypePersistence";

const logger = createLogger("tauri.persistence");

/** Event name emitted when any window mutates the store, so sibling windows can re-sync. */
const DATA_CHANGED_EVENT = "ccb:data-changed";

let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** Last JSON we wrote/received — used to break feedback loops between windows. */
let lastSyncedJson: string | null = null;

const debouncedSave = (json: string, delayMs = 500) => {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void saveData(json);
    saveTimer = null;
  }, delayMs);
};

/** Emit a Tauri event so every other webview window can update its store. */
const emitDataChanged = async (json: string): Promise<void> => {
  if (!("__TAURI_INTERNALS__" in window)) return;
  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit(DATA_CHANGED_EVENT, json);
  } catch (err) {
    logger.warn("Failed to emit data-changed event", { error: String(err) });
  }
};

/** Listen for data-changed events from other windows and refresh local store. */
const subscribeDataChanged = async (): Promise<void> => {
  if (!("__TAURI_INTERNALS__" in window)) return;
  try {
    const { listen } = await import("@tauri-apps/api/event");
    await listen<string>(DATA_CHANGED_EVENT, (event) => {
      const json = event.payload;
      if (json === lastSyncedJson) return; // already up to date
      lastSyncedJson = json;
      try {
        useCardStore.getState().importData(json);
        logger.debug("Store re-synced from cross-window event");
      } catch (err) {
        logger.warn("Failed to import data from event", { error: String(err) });
      }
    });
  } catch (err) {
    logger.warn("Failed to subscribe to data-changed event", { error: String(err) });
  }
};

/**
 * Initialize the card type registry:
 * 1. Load built-in card types (from Vite glob — always available)
 * 2. Load user card types from disk (Tauri only)
 */
export const initCardTypeRegistry = async (): Promise<void> => {
  useCardTypeStore.getState().setBuiltinCardTypes(BUILTIN_CARD_TYPES);
  logger.info("Built-in card types loaded", { count: BUILTIN_CARD_TYPES.length });

  // Load user card types from disk
  try {
    const userTypes = await loadUserCardTypes();
    for (const ut of userTypes) {
      try {
        useCardTypeStore.getState().addUserCardType(ut);
      } catch (err) {
        logger.warn("Skipped user card type due to conflict", {
          slug: ut.slug,
          error: String(err),
        });
      }
    }
    if (userTypes.length > 0) {
      logger.info("User card types loaded", { count: userTypes.length });
    }
  } catch (err) {
    logger.warn("Failed to load user card types", { error: String(err) });
  }
};

/**
 * Initialize Tauri file persistence:
 * 1. Load data from disk and hydrate the store.
 * 2. Subscribe to local store changes → debounced save to disk + emit to other windows.
 * 3. Subscribe to cross-window events → refresh local store when siblings mutate.
 *
 * Safe to call from every window (main + tray) — each window needs its own store sync.
 */
export const initPersistence = async (): Promise<void> => {
  // 0. Initialize card type registry (built-in + user templates)
  await initCardTypeRegistry();

  // 1. Hydrate from disk
  try {
    const json = await loadData();
    if (json) {
      useCardStore.getState().importData(json);
      lastSyncedJson = json;
      logger.info("Store hydrated from disk");
    }
  } catch (err) {
    logger.warn("Failed to hydrate store from disk", { error: String(err) });
  }

  // 1.5 Sync cards with current templates (silent, idempotent).
  //     Runs in BOTH windows; fast path makes concurrent calls cheap.
  {
    const cards = useCardStore.getState().cards;
    const templates = useCardTypeStore.getState().cardTypes;
    const today = formatDate(new Date());
    const result = syncAllCardsWithTemplates(cards, templates, today);
    if (result.hasChanges) {
      useCardStore.getState().loadData(result.cards, useCardStore.getState().settings);
      logger.info("Cards synced with templates");
    }
  }

  // 2. Subscribe for auto-save + cross-window emit.
  //    Set up BEFORE generateAutoRecurRecords so the generated records get persisted.
  useCardStore.subscribe((state) => {
    const json = state.exportData();
    if (json === lastSyncedJson) return; // redundant change (e.g. just imported)
    lastSyncedJson = json;
    debouncedSave(json);
    void emitDataChanged(json);
  });

  // 3. Initial recalculate (generation + now bump) after data load (triggers subscribe → save).
  useCardStore.getState().recalculate();

  // 4. Listen for cross-window data changes.
  void subscribeDataChanged();

  logger.info("Persistence initialized");
};
