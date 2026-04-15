import type { CreditCard } from "../models/types";

/**
 * Patches existing user cards for template changes that shipped after cards
 * were already created. Idempotent — safe to run on every load.
 */
export const migrateCards = (cards: CreditCard[]): CreditCard[] => {
  return cards.map((card) => ({
    ...card,
    benefits: card.benefits.map((benefit) => {
      // Marriott Boundless H2 2026 airline credit: ship `availableFromDate`
      // so it hides from "available" until 2026-07-01.
      if (
        benefit.resetType === "one_time" &&
        benefit.name === "$50 Airline Credit (H2 2026)" &&
        !benefit.resetConfig.availableFromDate
      ) {
        return {
          ...benefit,
          resetConfig: {
            ...benefit.resetConfig,
            availableFromDate: "2026-07-01",
          },
        };
      }
      return benefit;
    }),
  }));
};
