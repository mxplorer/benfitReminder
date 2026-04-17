import { createLogger } from "../lib/logger";
import type { TrayStatus } from "../utils/trayState";

const logger = createLogger("tauri.tray");

/**
 * Update the tray icon + tooltip to reflect the current benefit status.
 * No-ops gracefully when running outside Tauri (dev browser mode).
 */
export const updateTrayStatus = async (status: TrayStatus): Promise<void> => {
  if (!("__TAURI_INTERNALS__" in window)) return;

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("update_tray_status", {
      state: status.state,
      unusedCount: status.unusedCount,
      urgentCount: status.urgentCount,
    });
    logger.debug("Tray status updated", { ...status });
  } catch {
    // Tauri command not available or failed
  }
};
