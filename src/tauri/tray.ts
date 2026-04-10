import { createLogger } from "../lib/logger";

const logger = createLogger("tauri.tray");

/**
 * Update the tray icon badge to reflect the current unused benefit count.
 * No-ops gracefully when running outside Tauri (dev browser mode).
 */
export const updateTrayBadge = async (count: number): Promise<void> => {
  if (!("__TAURI_INTERNALS__" in window)) return;

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("update_tray_badge", { count });
    logger.debug("Tray badge updated", { count });
  } catch {
    // Tauri command not available or failed
  }
};
