import type { CreditCard } from "../models/types";
import { isApplicableNow, isBenefitUsedInPeriod } from "./period";
import { getBenefitsDueForReminder } from "./reminder";

export type TrayState = "clean" | "unused" | "urgent";

export interface TrayStatus {
  state: TrayState;
  unusedCount: number;
  urgentCount: number;
}

/**
 * Derive the tray icon state from card data.
 * - `urgent` > `unused` > `clean` (priority).
 * - `unused` counts applicable + unused + not-hidden benefits on enabled cards.
 * - `urgent` is the subset of `unused` whose deadline is within `reminderDays` days.
 */
export const computeTrayStatus = (
  cards: CreditCard[],
  today: Date,
  reminderDays: number,
): TrayStatus => {
  const urgentItems = getBenefitsDueForReminder(cards, today, reminderDays);

  let unusedCount = 0;
  for (const card of cards) {
    if (!card.isEnabled) continue;
    for (const benefit of card.benefits) {
      if (benefit.isHidden) continue;
      if (!isApplicableNow(benefit, today)) continue;
      if (isBenefitUsedInPeriod(benefit, today, card.cardOpenDate)) {
        continue;
      }
      unusedCount++;
    }
  }

  const urgentCount = urgentItems.length;
  const state: TrayState =
    urgentCount > 0 ? "urgent" : unusedCount > 0 ? "unused" : "clean";

  return { state, unusedCount, urgentCount };
};
