import { invoke } from "@tauri-apps/api/core";
import { createLogger } from "../lib/logger";

const logger = createLogger("tauri.tray");

/**
 * Update the tray icon badge to reflect the current unused benefit count.
 * No-ops gracefully when running outside Tauri (dev browser mode).
 */
export const updateTrayBadge = async (count: number): Promise<void> => {
  try {
    await invoke("update_tray_badge", { count });
    logger.debug("Tray badge updated", { count });
  } catch {
    // Running in browser dev mode — tray commands are unavailable
  }
};
