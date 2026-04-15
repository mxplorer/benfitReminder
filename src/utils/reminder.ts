import type { Benefit, CreditCard } from "../models/types";
import { getDeadline, getDaysRemaining, isBenefitUsedInPeriod, isApplicableNow } from "./period";

export interface ReminderItem {
  card: CreditCard;
  benefit: Benefit;
  deadline: string;
  daysRemaining: number;
}

export const getBenefitsDueForReminder = (
  cards: CreditCard[],
  today: Date,
  reminderDays: number,
): ReminderItem[] => {
  const items: ReminderItem[] = [];

  for (const card of cards) {
    if (!card.isEnabled) continue;

    for (const benefit of card.benefits) {
      if (benefit.isHidden) continue;
      if (!isApplicableNow(benefit, today)) continue;
      if (isBenefitUsedInPeriod(benefit, today, card.cardOpenDate, card.statementClosingDay)) continue;

      const deadline = getDeadline(today, {
        resetType: benefit.resetType,
        resetConfig: benefit.resetConfig,
        cardOpenDate: card.cardOpenDate,
        statementClosingDay: card.statementClosingDay,
      });
      if (!deadline) continue;

      const daysRemaining = getDaysRemaining(today, deadline);
      if (daysRemaining < 0 || daysRemaining > reminderDays) continue;

      items.push({ card, benefit, deadline, daysRemaining });
    }
  }

  items.sort((a, b) => a.daysRemaining - b.daysRemaining);
  return items;
};
