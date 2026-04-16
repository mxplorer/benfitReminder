import { create } from "zustand";
import type { AppData, AppSettings, Benefit, CreditCard, UsageRecord } from "../models/types";
import { formatDate, isBenefitUsedInPeriod, isInCurrentCycle } from "../utils/period";
import { formatMonthKey } from "../utils/subscription";
import { migrateCards } from "../utils/migrations";
import { syncAllCardsWithTemplates } from "../utils/templateSync";
import { generateRolloverRecords } from "../utils/rollover";
import { cycleStartForDate, makeUsageRecord } from "../utils/usageRecords";
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

      const isUsed = isBenefitUsedInPeriod(benefit, today, card.cardOpenDate, card.statementClosingDay);

      if (isUsed) {
        // Remove the most recent non-rollover record. Popping blindly would
        // discard a concurrent rollover marker on rolloverable benefits.
        const records = [...benefit.usageRecords];
        for (let i = records.length - 1; i >= 0; i -= 1) {
          if (records[i].kind !== "rollover") {
            records.splice(i, 1);
            break;
          }
        }
        return {
          cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
            ...b,
            usageRecords: records,
          })),
        };
      }

      // Add new record with faceValue snapshot
      const newRecord: UsageRecord = makeUsageRecord({
        usedDate: usedDate ?? formatDate(today),
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

  setBenefitCycleUsed: (cardId, benefitId, cycleStart, cycleEnd, used, opts) => {
    set((state) => {
      const card = state.cards.find((c) => c.id === cardId);
      if (!card) return state;
      const benefit = card.benefits.find((b) => b.id === benefitId);
      if (!benefit) return state;

      const existingInCycle = benefit.usageRecords.find(
        (r) => r.usedDate >= cycleStart && r.usedDate <= cycleEnd,
      );

      if (used) {
        if (existingInCycle) {
          const updated: UsageRecord = {
            ...existingInCycle,
            actualValue: opts?.actualValue ?? existingInCycle.actualValue,
            usedDate: opts?.usedDate ?? existingInCycle.usedDate,
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
        const todayIso = formatDate(new Date());
        const defaultDate =
          todayIso >= cycleStart && todayIso <= cycleEnd ? todayIso : cycleStart;
        const newRecord: UsageRecord = makeUsageRecord({
          usedDate: opts?.usedDate ?? defaultDate,
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

      // Past-cycle editor: keep usage records and any current-cycle rollover
      // marker (written by the ⟳ shortcut), replace only past-cycle rollovers.
      const currentCycleStart = cycleStartForDate(today, period);
      const preserved = benefit.usageRecords.filter(
        (r) => r.kind !== "rollover" || r.usedDate >= currentCycleStart,
      );
      const regenerated = generateRolloverRecords(benefit, rolloverAmount, today);
      return {
        cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
          ...b,
          usageRecords: [...preserved, ...regenerated],
        })),
      };
    });
  },

  clearRolloverRecords: (cardId, benefitId) => {
    const today = new Date();
    set((state) => {
      const card = state.cards.find((c) => c.id === cardId);
      if (!card) return state;
      const benefit = card.benefits.find((b) => b.id === benefitId);
      if (!benefit) return state;
      const period = benefit.resetConfig.period;
      // Mirror replaceRolloverRecords: clear past-cycle only, keep current-cycle ⟳.
      const currentCycleStart = period ? cycleStartForDate(today, period) : undefined;
      return {
        cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
          ...b,
          usageRecords: b.usageRecords.filter(
            (r) =>
              r.kind !== "rollover" ||
              (currentCycleStart !== undefined && r.usedDate >= currentCycleStart),
          ),
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
        if (isBenefitUsedInPeriod(benefit, today, card.cardOpenDate, card.statementClosingDay)) continue;
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
