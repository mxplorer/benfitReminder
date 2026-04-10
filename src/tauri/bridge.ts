import { createLogger } from "../lib/logger";
import { getMetrics } from "../lib/transports";

const logger = createLogger("tauri.bridge");

const DATA_FILENAME = "data.json";

/**
 * Get the path to the app config data file.
 * Only callable inside Tauri runtime.
 */
const getDataPath = async (): Promise<string> => {
  const { appConfigDir } = await import("@tauri-apps/api/path");
  const { join } = await import("@tauri-apps/api/path");
  const dir = await appConfigDir();
  return join(dir, DATA_FILENAME);
};

/**
 * Load persisted app data from the config directory.
 * Returns null if the file does not exist yet.
 */
export const loadData = async (): Promise<string | null> => {
  if (!("__TAURI_INTERNALS__" in window)) return null;

  const t0 = Date.now();
  try {
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await getDataPath();
    const text = await readTextFile(path);
    try {
      getMetrics().timing("store.hydrate_ms", Date.now() - t0);
    } catch { /* metrics not initialized */ }
    logger.info("Data loaded from disk");
    return text;
  } catch {
    // File doesn't exist yet on first launch — not an error
    logger.info("No existing data file found (first launch)");
    return null;
  }
};

/**
 * Save app data JSON string to the config directory.
 * Creates the directory if it doesn't exist.
 */
export const saveData = async (json: string): Promise<void> => {
  if (!("__TAURI_INTERNALS__" in window)) return;

  const t0 = Date.now();
  try {
    const { writeTextFile, mkdir } = await import("@tauri-apps/plugin-fs");
    const { appConfigDir, join } = await import("@tauri-apps/api/path");
    const dir = await appConfigDir();
    await mkdir(dir, { recursive: true });
    const path = await join(dir, DATA_FILENAME);
    await writeTextFile(path, json);
    try {
      getMetrics().timing("store.persist_ms", Date.now() - t0);
    } catch { /* metrics not initialized */ }
    logger.debug("Data saved to disk");
  } catch (err) {
    logger.error("Failed to save data", { error: String(err) });
  }
};

/**
 * Open a save dialog and export the data JSON to a user-chosen file.
 */
export const exportToFile = async (json: string): Promise<void> => {
  if (!("__TAURI_INTERNALS__" in window)) return;

  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");

    const filePath = await save({
      filters: [{ name: "JSON", extensions: ["json"] }],
      defaultPath: "ccb-export.json",
    });

    if (!filePath) return; // user cancelled
    await writeTextFile(filePath, json);
    logger.info("Data exported to file", { path: filePath });
  } catch (err) {
    logger.error("Export failed", { error: String(err) });
  }
};

/**
 * Open a file picker, read the selected JSON file, return its contents.
 * Returns null if user cancels or read fails.
 */
export const importFromFile = async (): Promise<string | null> => {
  if (!("__TAURI_INTERNALS__" in window)) return null;

  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");

    const selected = await open({
      filters: [{ name: "JSON", extensions: ["json"] }],
      multiple: false,
    });

    if (!selected || typeof selected !== "string") return null;
    const text = await readTextFile(selected);
    logger.info("Data imported from file", { path: selected });
    return text;
  } catch (err) {
    logger.error("Import failed", { error: String(err) });
    return null;
  }
};
