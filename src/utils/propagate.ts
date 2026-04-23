import type { Benefit, CreditCard, UsageRecord } from "../models/types";
import { formatDate } from "./period";
import { cycleStartForDate, makeUsageRecord } from "./usageRecords";

/** First day of the month following `iso` (YYYY-MM-DD), in YYYY-MM-01 form. */
const nextMonthStart = (iso: string): string => {
  // usedDate is stored as YYYY-MM-DD; construct a UTC-agnostic Date by hand
  // to avoid DST/timezone drift when bumping months.
  const [y, m] = iso.split("-").map(Number);
  if (!y || !m) return iso;
  const nextYear = m === 12 ? y + 1 : y;
  const nextMonth = m === 12 ? 1 : m + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(nextYear)}-${pad(nextMonth)}-01`;
};

/** Index of the record in `records` whose usedDate is latest and whose
 * propagateNext is true. Returns -1 when none qualify. */
const findLatestPropagateIndex = (records: UsageRecord[]): number => {
  let bestIdx = -1;
  let bestDate = "";
  for (let i = 0; i < records.length; i += 1) {
    const r = records[i];
    if (r.propagateNext !== true) continue;
    if (r.usedDate > bestDate) {
      bestDate = r.usedDate;
      bestIdx = i;
    }
  }
  return bestIdx;
};

/** Cycle-start (YYYY-MM-01) of the monthly cycle containing `iso`. */
const cycleStartOfIso = (iso: string): string => {
  const [y, m] = iso.split("-").map(Number);
  if (!y || !m) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(y)}-${pad(m)}-01`;
};

/** Walk the propagate chain for a single subscription benefit and return
 * an augmented usageRecords array with materialized records appended.
 *
 * Fixpoint rules (see batch-6 spec):
 *  1. Find latest record with `propagateNext === true`.
 *  2. nextCycleStart = first day of the month AFTER that record's cycle.
 *  3. If `nextCycleStart > todayCycleStart` → stop.
 *  4. If a record with matching `usedDate === nextCycleStart` already exists
 *     → stop (don't overwrite; user may have edited).
 *  5. Else append a new usage record carrying faceValue/actualValue from
 *     the source, `propagateNext: true`, kind: "usage".
 *  6. Repeat until 3 or 4 triggers. */
const materializeBenefit = (
  benefit: Benefit,
  todayCycleStart: string,
): Benefit => {
  if (benefit.resetType !== "subscription") return benefit;

  // Shallow copy of the records array; we only push new records and never
  // mutate existing ones so identity of source records is preserved.
  let records = benefit.usageRecords;
  let mutated = false;

  // TODO(batch-7): multi-source-per-cycle propagation — currently only the
  // latest source record per chain is followed.
  // Safety cap: a maximum of 240 iterations (20 years of months) prevents
  // runaway loops if data somehow resists the fixpoint (shouldn't happen
  // given steps 3 and 4, but costless insurance).
  for (let guard = 0; guard < 240; guard += 1) {
    const srcIdx = findLatestPropagateIndex(records);
    if (srcIdx === -1) break;
    const src = records[srcIdx];
    const srcCycleStart = cycleStartOfIso(src.usedDate);
    const targetCycleStart = nextMonthStart(srcCycleStart);
    if (targetCycleStart > todayCycleStart) break;
    const alreadyExists = records.some((r) => r.usedDate === targetCycleStart);
    if (alreadyExists) break;

    const newRecord: UsageRecord = makeUsageRecord({
      usedDate: targetCycleStart,
      faceValue: src.faceValue,
      actualValue: src.actualValue,
      propagateNext: true,
    });
    if (!mutated) {
      records = [...records];
      mutated = true;
    }
    records.push(newRecord);
  }

  if (!mutated) return benefit;
  return { ...benefit, usageRecords: records };
};

/** Walk every card and materialize subscription propagateNext records up
 * to today's monthly cycle. Pure; returns a new cards array when any
 * benefit changed, otherwise the input reference.
 *
 * Idempotent: re-running on the output produces identity (no new records). */
export const materializeSubscriptionPropagation = (
  cards: CreditCard[],
  today: Date,
): CreditCard[] => {
  const todayCycleStart = cycleStartForDate(today, "monthly");
  // Fallback: if cycleStartForDate somehow returned a bad value, fall back
  // to formatting today as YYYY-MM-01 via formatDate (imported for parity
  // with the rest of the codebase).
  const safeCycleStart = todayCycleStart || formatDate(today).slice(0, 7) + "-01";

  const nextCards = cards.map((card) => {
    const nextBenefits = card.benefits.map((benefit) =>
      materializeBenefit(benefit, safeCycleStart),
    );
    // If every benefit reference is identical to the input, this card is
    // unchanged — preserve reference equality so callers can cheap-check.
    const changed = nextBenefits.some((b, i) => b !== card.benefits[i]);
    if (!changed) return card;
    return { ...card, benefits: nextBenefits };
  });

  const cardsChanged = nextCards.some((c, i) => c !== cards[i]);
  return cardsChanged ? nextCards : cards;
};
