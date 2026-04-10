import { create } from "zustand";
import type { AppData, AppSettings, Benefit, CreditCard, UsageRecord } from "../models/types";
import { formatDate, getMonthRange, isBenefitUsedInPeriod, isApplicableNow } from "../utils/period";

interface CardStoreState {
  cards: CreditCard[];
  settings: AppSettings;
}

interface CardStoreActions {
  addCard: (card: CreditCard) => void;
  removeCard: (cardId: string) => void;
  updateCard: (cardId: string, partial: Partial<CreditCard>) => void;
  toggleCardEnabled: (cardId: string) => void;
  addBenefit: (cardId: string, benefit: Benefit) => void;
  removeBenefit: (cardId: string, benefitId: string) => void;
  toggleBenefitHidden: (cardId: string, benefitId: string) => void;
  toggleBenefitAutoRecur: (cardId: string, benefitId: string) => void;
  toggleBenefitUsage: (cardId: string, benefitId: string, actualValue?: number) => void;
  getUnusedBenefitCount: () => number;
  updateSettings: (partial: Partial<AppSettings>) => void;
  loadData: (cards: CreditCard[], settings: AppSettings) => void;
  exportData: () => string;
  importData: (json: string) => void;
  generateAutoRecurRecords: () => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  logLevel: "info",
  debugLogEnabled: false,
  reminderEnabled: true,
  reminderDays: 3,
  dismissedDate: null,
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

  toggleBenefitAutoRecur: (cardId, benefitId) => {
    set((state) => ({
      cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
        ...b,
        autoRecur: !b.autoRecur,
      })),
    }));
  },

  toggleBenefitUsage: (cardId, benefitId, actualValue?) => {
    const today = new Date();
    set((state) => {
      const card = state.cards.find((c) => c.id === cardId);
      if (!card) return state;
      const benefit = card.benefits.find((b) => b.id === benefitId);
      if (!benefit) return state;

      const isUsed = isBenefitUsedInPeriod(benefit, today, card.cardOpenDate);

      if (isUsed) {
        // Remove most recent record
        const records = [...benefit.usageRecords];
        records.pop();
        return {
          cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
            ...b,
            usageRecords: records,
          })),
        };
      }

      // Add new record with faceValue snapshot
      const newRecord: UsageRecord = {
        usedDate: formatDate(today),
        faceValue: benefit.faceValue,
        actualValue: actualValue ?? benefit.faceValue,
      };
      return {
        cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
          ...b,
          usageRecords: [...b.usageRecords, newRecord],
        })),
      };
    });
  },

  getUnusedBenefitCount: () => {
    const { cards } = get();
    const today = new Date();
    let count = 0;
    for (const card of cards) {
      if (!card.isEnabled) continue;
      for (const benefit of card.benefits) {
        if (benefit.isHidden) continue;
        if (benefit.resetType === "subscription" && benefit.autoRecur) continue;
        if (!isApplicableNow(benefit, today)) continue;
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

    set({
      cards: data.cards as CreditCard[],
      settings: (data.settings as AppSettings | undefined) ?? { ...DEFAULT_SETTINGS },
    });
  },

  generateAutoRecurRecords: () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const monthRange = getMonthRange(year, month);
    const firstOfMonth = monthRange.start;

    set((state) => ({
      cards: state.cards.map((card) => ({
        ...card,
        benefits: card.benefits.map((benefit) => {
          if (benefit.resetType !== "subscription" || !benefit.autoRecur) return benefit;

          const hasRecordThisMonth = benefit.usageRecords.some(
            (r) => r.usedDate >= monthRange.start && r.usedDate <= monthRange.end,
          );
          if (hasRecordThisMonth) return benefit;

          const newRecord: UsageRecord = {
            usedDate: firstOfMonth,
            faceValue: benefit.faceValue,
            actualValue: benefit.faceValue,
          };
          return { ...benefit, usageRecords: [...benefit.usageRecords, newRecord] };
        }),
      })),
    }));
  },
}));
