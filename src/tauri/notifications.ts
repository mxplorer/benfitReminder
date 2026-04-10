import { createLogger } from "../lib/logger";
import { getMetrics } from "../lib/transports";
import { getBenefitsDueForReminder } from "../utils/reminder";
import { getCardDisplayName } from "../models/types";
import type { CreditCard, AppSettings } from "../models/types";
import { formatDate } from "../utils/period";

const logger = createLogger("tauri.notifications");

/**
 * Check notification permission and send reminders for benefits approaching deadlines.
 * No-ops gracefully when running outside Tauri.
 *
 * @param cards - All cards in the store
 * @param settings - Current app settings (reminderDays, dismissedDate)
 * @param today - Current date (injectable for testability)
 */
export const checkAndSendReminders = async (
  cards: CreditCard[],
  settings: AppSettings,
  today: Date = new Date(),
): Promise<void> => {
  if (!settings.reminderEnabled) return;

  // Skip if user dismissed reminders today
  const todayStr = formatDate(today);
  if (settings.dismissedDate === todayStr) return;

  // Skip if not in Tauri (browser dev mode)
  if (!("__TAURI_INTERNALS__" in window)) return;

  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      "@tauri-apps/plugin-notification"
    );

    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === "granted";
    }
    if (!permissionGranted) {
      logger.warn("Notification permission denied");
      return;
    }

    const items = getBenefitsDueForReminder(cards, today, settings.reminderDays);
    logger.info(`Sending ${String(items.length)} reminder notifications`);

    for (const item of items) {
      const cardName = getCardDisplayName(item.card);
      sendNotification({
        title: `${item.benefit.name} 即将到期`,
        body: `${cardName} · 剩余 ${String(item.daysRemaining)} 天 · 面值 $${String(item.benefit.faceValue)}`,
      });
      try {
        getMetrics().count("notification.sent");
      } catch {
        // metrics not initialized
      }
    }
  } catch (err) {
    logger.error("Failed to send notifications", { error: String(err) });
  }
};
