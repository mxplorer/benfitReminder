import { createLogger } from "../lib/logger";
import { useCardStore } from "../stores/useCardStore";
import { loadData, saveData } from "./bridge";

const logger = createLogger("tauri.persistence");

let saveTimer: ReturnType<typeof setTimeout> | null = null;

const debouncedSave = (json: string, delayMs = 500) => {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void saveData(json);
    saveTimer = null;
  }, delayMs);
};

/**
 * Initialize Tauri file persistence:
 * 1. Load data from disk and hydrate the store.
 * 2. Subscribe to store changes and auto-save (debounced).
 *
 * Call this once at app startup inside MainWindow (not TrayPanel — only one writer needed).
 */
export const initPersistence = async (): Promise<void> => {
  // 1. Hydrate
  try {
    const json = await loadData();
    if (json) {
      useCardStore.getState().importData(json);
      logger.info("Store hydrated from disk");
    }
  } catch (err) {
    logger.warn("Failed to hydrate store from disk", { error: String(err) });
  }

  // 2. Subscribe for auto-save
  useCardStore.subscribe((state) => {
    const json = state.exportData();
    debouncedSave(json);
  });

  logger.info("Persistence initialized");
};
