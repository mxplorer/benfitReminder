import { create } from "zustand";
import type { AppData, AppSettings, Benefit, CreditCard, UsageRecord } from "../models/types";
import {
  formatDate,
  isBenefitUsedInPeriod,
  isInCurrentCycle,
} from "../utils/period";
import { cycleKeyForDate, cycleKeyForRecord, currentCycleKey } from "../utils/cycleKey";
import { formatMonthKey } from "../utils/subscription";
import { migrateCards } from "../utils/migrations";
import { syncAllCardsWithTemplates } from "../utils/templateSync";
import { generateRolloverRecords } from "../utils/rollover";
import { cycleStartForDate, makeRolloverRecord, makeUsageRecord } from "../utils/usageRecords";
import { useCardTypeStore } from "./useCardTypeStore";

interface CardStoreState {
  cards: CreditCard[];
  settings: AppSettings;
  /** "Current moment" the UI reads for today-dependent calculations.
   * Will be bumped by a `recalculate()` action on focus/midnight refresh. */
  now: Date;
}

interface CardStoreActions {
  addCard: (card: CreditCard) => void;
  removeCard: (cardId: string) => void;
  updateCard: (cardId: string, partial: Partial<CreditCard>) => void;
  toggleCardEnabled: (cardId: string) => void;
  addBenefit: (cardId: string, benefit: Benefit) => void;
  removeBenefit: (cardId: string, benefitId: string) => void;
  toggleBenefitHidden: (cardId: string, benefitId: string) => void;
  toggleBenefitUsage: (cardId: string, benefitId: string, actualValue?: number, usedDate?: string) => void;
  setBenefitCycleUsed: (
    cardId: string,
    benefitId: string,
    cycleStart: string,
    cycleEnd: string,
    used: boolean,
    opts?: { actualValue?: number; usedDate?: string; propagateNext?: boolean },
  ) => void;
  replaceRolloverRecords: (cardId: string, benefitId: string, rolloverAmount: number) => void;
  clearRolloverRecords: (cardId: string, benefitId: string) => void;
  backfillBenefitUsage: (cardId: string, benefitId: string, records: UsageRecord[]) => void;
  getUnusedBenefitCount: () => number;
  updateSettings: (partial: Partial<AppSettings>) => void;
  loadData: (cards: CreditCard[], settings: AppSettings) => void;
  exportData: () => string;
  importData: (json: string) => void;
  generateAutoRecurRecords: () => void;
  recalculate: () => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  logLevel: "info",
  debugLogEnabled: false,
  reminderEnabled: true,
  reminderDays: 3,
  dismissedDate: null,
  trayOpacity: 100,
};

const updateBenefitInCards = (
  cards: CreditCard[],
  cardId: string,
  benefitId: string,
  updater: (benefit: Benefit) => Benefit,
): CreditCard[] =>
  cards.map((card) => {
    if (card.id !== cardId) return card;
    return {
      ...card,
      benefits: card.benefits.map((b) => (b.id === benefitId ? updater(b) : b)),
    };
  });

export const useCardStore = create<CardStoreState & CardStoreActions>()((set, get) => ({
  cards: [],
  settings: { ...DEFAULT_SETTINGS },
  now: new Date(),

  addCard: (card) => {
    set((state) => ({ cards: [...state.cards, card] }));
  },

  removeCard: (cardId) => {
    set((state) => ({ cards: state.cards.filter((c) => c.id !== cardId) }));
  },

  updateCard: (cardId, partial) => {
    set((state) => ({
      cards: state.cards.map((c) => (c.id === cardId ? { ...c, ...partial } : c)),
    }));
  },

  toggleCardEnabled: (cardId) => {
    set((state) => ({
      cards: state.cards.map((c) => (c.id === cardId ? { ...c, isEnabled: !c.isEnabled } : c)),
    }));
  },

  addBenefit: (cardId, benefit) => {
    set((state) => ({
      cards: state.cards.map((c) =>
        c.id === cardId ? { ...c, benefits: [...c.benefits, benefit] } : c,
      ),
    }));
  },

  removeBenefit: (cardId, benefitId) => {
    set((state) => ({
      cards: state.cards.map((c) =>
        c.id === cardId ? { ...c, benefits: c.benefits.filter((b) => b.id !== benefitId) } : c,
      ),
    }));
  },

  toggleBenefitHidden: (cardId, benefitId) => {
    set((state) => ({
      cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
        ...b,
        isHidden: !b.isHidden,
      })),
    }));
  },

  toggleBenefitUsage: (cardId, benefitId, actualValue?, usedDate?) => {
    const today = new Date();
    set((state) => {
      const card = state.cards.find((c) => c.id === cardId);
      if (!card) return state;
      const benefit = card.benefits.find((b) => b.id === benefitId);
      if (!benefit) return state;

      const isUsed = isBenefitUsedInPeriod(benefit, today, card.cardOpenDate);

      // Record attribution is by intrinsic cycle key, not by usedDate range.
      // since_last_use has no cycle boundary — match any record when undoing,
      // don't clamp when creating.
      const isSinceLastUse = benefit.resetType === "since_last_use";
      const currentKey = isSinceLastUse
        ? null
        : currentCycleKey(today, benefit, card.cardOpenDate);
      const matchesCurrent = (r: UsageRecord): boolean => {
        if (isSinceLastUse) return true;
        if (!currentKey) return false;
        return cycleKeyForRecord(r, benefit, card.cardOpenDate) === currentKey;
      };

      if (isUsed) {
        // Prefer usage over rollover so unchecking an actually-used cycle
        // clears the usage while unchecking a rolled-forward cycle clears the
        // rollover.
        const records = [...benefit.usageRecords];
        let removeIndex = -1;
        for (let i = records.length - 1; i >= 0; i -= 1) {
          if (matchesCurrent(records[i]) && records[i].kind !== "rollover") {
            removeIndex = i;
            break;
          }
        }
        if (removeIndex === -1) {
          for (let i = records.length - 1; i >= 0; i -= 1) {
            if (matchesCurrent(records[i]) && records[i].kind === "rollover") {
              removeIndex = i;
              break;
            }
          }
        }
        if (removeIndex === -1) return state;
        records.splice(removeIndex, 1);
        return {
          cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
            ...b,
            usageRecords: records,
          })),
        };
      }

      // Force the new record to attribute to the current cycle. If the user-
      // supplied usedDate maps to a different cycle (e.g., picked last year's
      // date by mistake), fall back to today — today's cycleKey is guaranteed
      // to match the current cycle.
      const todayIso = formatDate(today);
      const requested = usedDate ?? todayIso;
      const requestedKey = isSinceLastUse
        ? null
        : cycleKeyForDate(requested, benefit, card.cardOpenDate);
      const effectiveUsedDate =
        isSinceLastUse || requestedKey === currentKey ? requested : todayIso;
      const newRecord: UsageRecord = makeUsageRecord({
        usedDate: effectiveUsedDate,
        faceValue: benefit.faceValue,
        actualValue: actualValue ?? benefit.faceValue,
      });
      return {
        cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
          ...b,
          usageRecords: [...b.usageRecords, newRecord],
        })),
      };
    });
  },

  setBenefitCycleUsed: (cardId, benefitId, cycleStart, _cycleEnd, used, opts) => {
    set((state) => {
      const card = state.cards.find((c) => c.id === cardId);
      if (!card) return state;
      const benefit = card.benefits.find((b) => b.id === benefitId);
      if (!benefit) return state;

      // Identify the target cycle by intrinsic cycle key.
      const targetKey = cycleKeyForDate(cycleStart, benefit, card.cardOpenDate);
      const existingInCycle = benefit.usageRecords.find(
        (r) => cycleKeyForRecord(r, benefit, card.cardOpenDate) === targetKey,
      );

      // Force any user-supplied usedDate into the target cycle. An out-of-
      // cycle date means the user picked the wrong date; fall back to today
      // if it's in-cycle, else cycleStart.
      const todayIso = formatDate(new Date());
      const todayKey = cycleKeyForDate(todayIso, benefit, card.cardOpenDate);
      const defaultDate = todayKey === targetKey ? todayIso : cycleStart;
      const clampUsedDate = (d: string | undefined, fallback: string): string => {
        if (d === undefined) return fallback;
        const k = cycleKeyForDate(d, benefit, card.cardOpenDate);
        if (k !== targetKey) return defaultDate;
        return d;
      };

      if (used) {
        if (existingInCycle) {
          const updated: UsageRecord = {
            ...existingInCycle,
            actualValue: opts?.actualValue ?? existingInCycle.actualValue,
            usedDate: clampUsedDate(opts?.usedDate, existingInCycle.usedDate),
            // `!== undefined` (not `??`) so an explicit `false` override wins.
            propagateNext:
              opts?.propagateNext !== undefined
                ? opts.propagateNext
                : existingInCycle.propagateNext,
          };
          return {
            cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
              ...b,
              usageRecords: b.usageRecords.map((r) =>
                r === existingInCycle ? updated : r,
              ),
            })),
          };
        }
        const newRecord: UsageRecord = makeUsageRecord({
          usedDate: clampUsedDate(opts?.usedDate, defaultDate),
          faceValue: benefit.faceValue,
          actualValue: opts?.actualValue ?? benefit.faceValue,
          ...(opts?.propagateNext !== undefined ? { propagateNext: opts.propagateNext } : {}),
        });
        return {
          cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
            ...b,
            usageRecords: [...b.usageRecords, newRecord],
          })),
        };
      }

      if (!existingInCycle) return state;
      return {
        cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
          ...b,
          usageRecords: b.usageRecords.filter((r) => r !== existingInCycle),
        })),
      };
    });
  },

  replaceRolloverRecords: (cardId, benefitId, rolloverAmount) => {
    const today = new Date();
    set((state) => {
      const card = state.cards.find((c) => c.id === cardId);
      if (!card) return state;
      const benefit = card.benefits.find((b) => b.id === benefitId);
      if (!benefit || !benefit.rolloverable) return state;
      const period = benefit.resetConfig.period;
      if (!period) return state;

      const currentCycleStart = cycleStartForDate(today, period);
      // Drop all existing rollover records; keep every usage record.
      const preserved = benefit.usageRecords.filter((r) => r.kind !== "rollover");
      const pastRegenerated = generateRolloverRecords(benefit, rolloverAmount, today);

      // Saving the dialog also decides the current cycle: write a rollover
      // marker so the benefit shows as used in this cycle. Skip when a usage
      // record already exists in the current cycle — the user explicitly
      // marked it consumed, don't overwrite.
      const hasCurrentUsage = preserved.some(
        (r) => r.usedDate >= currentCycleStart && r.kind === "usage",
      );
      const currentMarker = hasCurrentUsage ? [] : [makeRolloverRecord(currentCycleStart)];

      return {
        cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
          ...b,
          usageRecords: [...preserved, ...pastRegenerated, ...currentMarker],
        })),
      };
    });
  },

  clearRolloverRecords: (cardId, benefitId) => {
    set((state) => {
      const card = state.cards.find((c) => c.id === cardId);
      if (!card) return state;
      const benefit = card.benefits.find((b) => b.id === benefitId);
      if (!benefit) return state;
      return {
        cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
          ...b,
          usageRecords: b.usageRecords.filter((r) => r.kind !== "rollover"),
        })),
      };
    });
  },

  backfillBenefitUsage: (cardId, benefitId, records) => {
    set((state) => ({
      cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
        ...b,
        usageRecords: [...b.usageRecords, ...records],
      })),
    }));
  },

  getUnusedBenefitCount: () => {
    const { cards } = get();
    const today = new Date();
    let count = 0;
    for (const card of cards) {
      if (!card.isEnabled) continue;
      for (const benefit of card.benefits) {
        if (benefit.isHidden) continue;
        if (!isInCurrentCycle(benefit, today)) continue;
        if (isBenefitUsedInPeriod(benefit, today, card.cardOpenDate)) continue;
        count++;
      }
    }
    return count;
  },

  updateSettings: (partial) => {
    set((state) => ({ settings: { ...state.settings, ...partial } }));
  },

  loadData: (cards, settings) => {
    set({ cards, settings });
  },

  exportData: () => {
    const { cards, settings } = get();
    const data: AppData = { version: 1, cards, settings };
    return JSON.stringify(data);
  },

  importData: (json) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json) as unknown;
    } catch {
      throw new Error("Invalid JSON format");
    }

    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("Import data must be an object");
    }

    const data = parsed as Record<string, unknown>;
    if (typeof data.version !== "number") {
      throw new Error("Missing or invalid version field");
    }
    if (!Array.isArray(data.cards)) {
      throw new Error("Missing or invalid cards array");
    }

    const migrated = migrateCards(data.cards as CreditCard[]);
    const templates = useCardTypeStore.getState().cardTypes;
    const today = formatDate(new Date());
    const { cards: synced } = syncAllCardsWithTemplates(migrated, templates, today);

    set({
      cards: synced,
      settings: (data.settings as AppSettings | undefined) ?? { ...DEFAULT_SETTINGS },
    });
  },

  generateAutoRecurRecords: () => {
    const today = get().now;
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const prevMonthKey = formatMonthKey(
      new Date(today.getFullYear(), today.getMonth() - 1, 1),
    );
    const currentMonthKey = formatMonthKey(today);
    const currentMonthStartIso = formatDate(currentMonthStart);

    set((state) => ({
      cards: state.cards.map((card) => ({
        ...card,
        benefits: card.benefits.map((benefit) => {
          const isMonthlyLike =
            benefit.resetType === "subscription" ||
            (benefit.resetType === "calendar" && benefit.resetConfig.period === "monthly");
          if (!isMonthlyLike) return benefit;

          const hasCurrent = benefit.usageRecords.some(
            (r) => r.usedDate.slice(0, 7) === currentMonthKey,
          );
          if (hasCurrent) return benefit;

          const prev = benefit.usageRecords.find(
            (r) => r.usedDate.slice(0, 7) === prevMonthKey,
          );
          if (!prev || prev.propagateNext !== true) return benefit;

          const newRecord: UsageRecord = makeUsageRecord({
            usedDate: currentMonthStartIso,
            faceValue: benefit.faceValue,
            actualValue: prev.actualValue,
            propagateNext: true,
          });
          return { ...benefit, usageRecords: [...benefit.usageRecords, newRecord] };
        }),
      })),
    }));
  },

  recalculate: () => {
    set({ now: new Date() });
    get().generateAutoRecurRecords();
  },
}));
