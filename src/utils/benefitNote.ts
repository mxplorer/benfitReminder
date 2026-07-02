import type { Benefit, CreditCard } from "../models/types";
import { NOTE_MAX_LENGTH } from "../models/types";

/**
 * The key under which a benefit's generic ("通用") note is shared, or `null`
 * for custom benefits (no `templateBenefitId`) which keep a per-instance note.
 *
 * Benefits sharing a `templateBenefitId` (e.g. every Amex Aspire card's
 * `amex_aspire.resort_h1`) share one generic note, since the note describes the
 * benefit type rather than a physical card.
 */
export const sharedNoteKey = (benefit: Benefit): string | null =>
  benefit.templateBenefitId ?? null;

/**
 * Resolve the effective generic note for a benefit: template benefits read the
 * shared map (keyed by `templateBenefitId`); custom benefits fall back to
 * their per-instance `benefit.note`.
 */
export const resolveGenericNote = (
  benefit: Benefit,
  shared: Record<string, string>,
): string => {
  const key = sharedNoteKey(benefit);
  if (key !== null) return shared[key] ?? "";
  return benefit.note ?? "";
};

/**
 * One-time migration for data written before generic notes were shared.
 *
 * Collects per-instance generic notes off every template benefit into a map
 * keyed by `templateBenefitId`, then strips `note` from those benefits (their
 * generic note now lives in the shared map). Custom benefits keep their note.
 * Distinct non-empty notes for the same key are newline-joined so nothing is
 * lost; the result is clamped to `NOTE_MAX_LENGTH`.
 */
export const migrateSharedBenefitNotes = (
  cards: CreditCard[],
): { cards: CreditCard[]; sharedBenefitNotes: Record<string, string> } => {
  const collected = new Map<string, string[]>();
  for (const card of cards) {
    for (const b of card.benefits) {
      const key = b.templateBenefitId;
      const note = b.note?.trim();
      if (!key || !note) continue;
      const arr = collected.get(key) ?? [];
      if (!arr.includes(note)) arr.push(note);
      collected.set(key, arr);
    }
  }

  const sharedBenefitNotes: Record<string, string> = {};
  for (const [key, notes] of collected) {
    sharedBenefitNotes[key] = notes.join("\n").slice(0, NOTE_MAX_LENGTH);
  }

  const strippedCards = cards.map((card) => ({
    ...card,
    benefits: card.benefits.map((b) =>
      b.templateBenefitId && b.note !== undefined ? { ...b, note: undefined } : b,
    ),
  }));

  return { cards: strippedCards, sharedBenefitNotes };
};
