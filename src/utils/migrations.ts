import type { Benefit, CreditCard } from "../models/types";

/** Returns a shallow copy of obj without the given key. */
function omitKey<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const result = { ...obj };
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete result[key];
  return result;
}

/**
 * Converts legacy autoRecur=true + cancelledMonths pattern to per-record
 * propagateNext flags. Sets autoRecur to false and strips cancelledMonths
 * so the old "set once forever" behavior no longer fires.
 */
const migrateAutoRecur = (benefit: Benefit): Benefit => {
  if (!benefit.autoRecur) {
    // If cancelledMonths hangs around without autoRecur, still drop it.
    if (benefit.cancelledMonths === undefined) return benefit;
    return omitKey(benefit, "cancelledMonths") as Benefit;
  }

  const cancelled = new Set(benefit.cancelledMonths ?? []);
  const isMonthlyLike =
    benefit.resetType === "subscription" ||
    (benefit.resetType === "calendar" && benefit.resetConfig.period === "monthly");

  const records = isMonthlyLike
    ? benefit.usageRecords.map((r) =>
        cancelled.has(r.usedDate.slice(0, 7)) || r.propagateNext !== undefined
          ? r
          : { ...r, propagateNext: true },
      )
    : benefit.usageRecords;

  return {
    ...omitKey(benefit, "cancelledMonths"),
    autoRecur: false,
    usageRecords: records,
  } as Benefit;
};

/**
 * Patches existing user cards for template changes that shipped after cards
 * were already created. Idempotent — safe to run on every load.
 */
export const migrateCards = (cards: CreditCard[]): CreditCard[] => {
  return cards.map((card) => ({
    ...card,
    benefits: card.benefits.map((benefit) => {
      let next = benefit;

      // Marriott Boundless H2 2026 airline credit: ship `availableFromDate`
      // so it hides from "available" until 2026-07-01.
      if (
        next.resetType === "one_time" &&
        next.name === "$50 Airline Credit (H2 2026)" &&
        !next.resetConfig.availableFromDate
      ) {
        next = {
          ...next,
          resetConfig: {
            ...next.resetConfig,
            availableFromDate: "2026-07-01",
          },
        };
      }

      // autoRecur + cancelledMonths → per-record propagateNext
      next = migrateAutoRecur(next);

      return next;
    }),
  }));
};
