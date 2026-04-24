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
import { materializeSubscriptionPropagation } from "../utils/propagate";
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

interface AddBenefitUsageOpts {
  consumedFace: number;
  actualValue: number;
  usedDate: string;
  propagateNext?: boolean;
}

interface AddCycleUsageOpts {
  consumedFace: number;
  actualValue: number;
  usedDate?: string;
  propagateNext?: boolean;
}

interface UpdateUsageRecordPatch {
  consumedFace?: number;
  actualValue?: number;
  usedDate?: string;
  propagateNext?: boolean;
}

interface CardStoreActions {
  addCard: (card: CreditCard) => void;
  removeCard: (cardId: string) => void;
  updateCard: (cardId: string, partial: Partial<CreditCard>) => void;
  toggleCardEnabled: (cardId: string) => void;
  addBenefit: (cardId: string, benefit: Benefit) => void;
  removeBenefit: (cardId: string, benefitId: string) => void;
  toggleBenefitHidden: (cardId: string, benefitId: string) => void;
  /**
   * Primary record-level actions. Prefer these for new UI code.
   */
  addBenefitUsage: (cardId: string, benefitId: string, opts: AddBenefitUsageOpts) => void;
  addCycleUsage: (
    cardId: string,
    benefitId: string,
    cycleStart: string,
    cycleEnd: string,
    opts: AddCycleUsageOpts,
  ) => void;
  removeBenefitUsageRecord: (cardId: string, benefitId: string, recordIndex: number) => void;
  updateBenefitUsageRecord: (
    cardId: string,
    benefitId: string,
    recordIndex: number,
    patch: UpdateUsageRecordPatch,
  ) => void;
  removeCycleRecords: (
    cardId: string,
    benefitId: string,
    cycleStart: string,
    cycleEnd: string,
  ) => void;
  /**
   * DEPRECATED: prefer `addBenefitUsage` / `removeBenefitUsageRecord` for new code.
   * Thin wrapper kept for backward compatibility; preserves the prefer-usage-
   * over-rollover undo behavior.
   */
  toggleBenefitUsage: (cardId: string, benefitId: string, actualValue?: number, usedDate?: string) => void;
  /**
   * DEPRECATED: prefer `addCycleUsage` / `removeCycleRecords` / `updateBenefitUsageRecord`
   * for new code. Upsert-style wrapper kept for backward compatibility.
   */
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
  theme: "system",
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

  addBenefitUsage: (cardId, benefitId, opts) => {
    const today = new Date();
    set((state) => {
      const card = state.cards.find((c) => c.id === cardId);
      if (!card) return state;
      const benefit = card.benefits.find((b) => b.id === benefitId);
      if (!benefit) return state;

      // since_last_use has no cycle boundary; don't clamp.
      const isSinceLastUse = benefit.resetType === "since_last_use";
      const todayIso = formatDate(today);
      const requested = opts.usedDate;
      const effectiveUsedDate = (() => {
        if (isSinceLastUse) return requested;
        const currentKey = currentCycleKey(today, benefit, card.cardOpenDate);
        if (!currentKey) return todayIso;
        const requestedKey = cycleKeyForDate(requested, benefit, card.cardOpenDate);
        return requestedKey === currentKey ? requested : todayIso;
      })();

      const newRecord: UsageRecord = makeUsageRecord({
        usedDate: effectiveUsedDate,
        faceValue: opts.consumedFace,
        actualValue: opts.actualValue,
        ...(opts.propagateNext !== undefined ? { propagateNext: opts.propagateNext } : {}),
      });
      return {
        cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
          ...b,
          usageRecords: [...b.usageRecords, newRecord],
        })),
      };
    });
  },

  addCycleUsage: (cardId, benefitId, cycleStart, _cycleEnd, opts) => {
    set((state) => {
      const card = state.cards.find((c) => c.id === cardId);
      if (!card) return state;
      const benefit = card.benefits.find((b) => b.id === benefitId);
      if (!benefit) return state;

      const targetKey = cycleKeyForDate(cycleStart, benefit, card.cardOpenDate);
      const todayIso = formatDate(new Date());
      const todayKey = cycleKeyForDate(todayIso, benefit, card.cardOpenDate);
      const defaultDate = todayKey === targetKey ? todayIso : cycleStart;

      const clampUsedDate = (d: string | undefined): string => {
        if (d === undefined) return defaultDate;
        const k = cycleKeyForDate(d, benefit, card.cardOpenDate);
        if (k !== targetKey) return defaultDate;
        return d;
      };

      const newRecord: UsageRecord = makeUsageRecord({
        usedDate: clampUsedDate(opts.usedDate),
        faceValue: opts.consumedFace,
        actualValue: opts.actualValue,
        ...(opts.propagateNext !== undefined ? { propagateNext: opts.propagateNext } : {}),
      });
      return {
        cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
          ...b,
          usageRecords: [...b.usageRecords, newRecord],
        })),
      };
    });
  },

  removeBenefitUsageRecord: (cardId, benefitId, recordIndex) => {
    set((state) => {
      const card = state.cards.find((c) => c.id === cardId);
      if (!card) return state;
      const benefit = card.benefits.find((b) => b.id === benefitId);
      if (!benefit) return state;
      if (recordIndex < 0 || recordIndex >= benefit.usageRecords.length) return state;
      return {
        cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
          ...b,
          usageRecords: b.usageRecords.filter((_, i) => i !== recordIndex),
        })),
      };
    });
  },

  updateBenefitUsageRecord: (cardId, benefitId, recordIndex, patch) => {
    set((state) => {
      const card = state.cards.find((c) => c.id === cardId);
      if (!card) return state;
      const benefit = card.benefits.find((b) => b.id === benefitId);
      if (!benefit) return state;
      if (recordIndex < 0 || recordIndex >= benefit.usageRecords.length) return state;

      return {
        cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
          ...b,
          usageRecords: b.usageRecords.map((r, i) => {
            if (i !== recordIndex) return r;
            const next: UsageRecord = { ...r };
            // consumedFace (API) → faceValue (storage).
            if (patch.consumedFace !== undefined) next.faceValue = patch.consumedFace;
            if (patch.actualValue !== undefined) next.actualValue = patch.actualValue;
            if (patch.usedDate !== undefined) next.usedDate = patch.usedDate;
            // `!== undefined` so an explicit `false` override wins.
            if (patch.propagateNext !== undefined) next.propagateNext = patch.propagateNext;
            return next;
          }),
        })),
      };
    });
  },

  removeCycleRecords: (cardId, benefitId, cycleStart, _cycleEnd) => {
    set((state) => {
      const card = state.cards.find((c) => c.id === cardId);
      if (!card) return state;
      const benefit = card.benefits.find((b) => b.id === benefitId);
      if (!benefit) return state;
      const targetKey = cycleKeyForDate(cycleStart, benefit, card.cardOpenDate);
      return {
        cards: updateBenefitInCards(state.cards, cardId, benefitId, (b) => ({
          ...b,
          usageRecords: b.usageRecords.filter(
            (r) => cycleKeyForRecord(r, benefit, card.cardOpenDate) !== targetKey,
          ),
        })),
      };
    });
  },

  toggleBenefitUsage: (cardId, benefitId, actualValue?, usedDate?) => {
    const today = new Date();
    const { cards } = get();
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    const benefit = card.benefits.find((b) => b.id === benefitId);
    if (!benefit) return;

    const isUsed = isBenefitUsedInPeriod(benefit, today, card.cardOpenDate);

    if (!isUsed) {
      // Add path — defer to addBenefitUsage which clamps usedDate into the
      // current cycle and preserves the old behavior.
      const todayIso = formatDate(today);
      get().addBenefitUsage(cardId, benefitId, {
        consumedFace: benefit.faceValue,
        actualValue: actualValue ?? benefit.faceValue,
        usedDate: usedDate ?? todayIso,
      });
      return;
    }

    // Undo path — preserve prefer-usage-over-rollover ordering by finding
    // the target record's index and delegating to removeBenefitUsageRecord.
    const isSinceLastUse = benefit.resetType === "since_last_use";
    const currentKey = isSinceLastUse
      ? null
      : currentCycleKey(today, benefit, card.cardOpenDate);
    const matchesCurrent = (r: UsageRecord): boolean => {
      if (isSinceLastUse) return true;
      if (!currentKey) return false;
      return cycleKeyForRecord(r, benefit, card.cardOpenDate) === currentKey;
    };
    let removeIndex = -1;
    for (let i = benefit.usageRecords.length - 1; i >= 0; i -= 1) {
      if (matchesCurrent(benefit.usageRecords[i]) && benefit.usageRecords[i].kind !== "rollover") {
        removeIndex = i;
        break;
      }
    }
    if (removeIndex === -1) {
      for (let i = benefit.usageRecords.length - 1; i >= 0; i -= 1) {
        if (matchesCurrent(benefit.usageRecords[i]) && benefit.usageRecords[i].kind === "rollover") {
          removeIndex = i;
          break;
        }
      }
    }
    if (removeIndex === -1) return;
    get().removeBenefitUsageRecord(cardId, benefitId, removeIndex);
  },

  setBenefitCycleUsed: (cardId, benefitId, cycleStart, cycleEnd, used, opts) => {
    const { cards } = get();
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    const benefit = card.benefits.find((b) => b.id === benefitId);
    if (!benefit) return;

    if (!used) {
      get().removeCycleRecords(cardId, benefitId, cycleStart, cycleEnd);
      return;
    }

    // Used path — upsert: if a record already exists in the target cycle,
    // patch it in place; otherwise append via addCycleUsage.
    const targetKey = cycleKeyForDate(cycleStart, benefit, card.cardOpenDate);
    const existingIndex = benefit.usageRecords.findIndex(
      (r) => cycleKeyForRecord(r, benefit, card.cardOpenDate) === targetKey,
    );

    if (existingIndex !== -1) {
      // Clamp any user-supplied usedDate into the target cycle; an out-of-
      // cycle date falls back to today (if in-cycle) or cycleStart.
      const todayIso = formatDate(new Date());
      const todayKey = cycleKeyForDate(todayIso, benefit, card.cardOpenDate);
      const defaultDate = todayKey === targetKey ? todayIso : cycleStart;
      const existing = benefit.usageRecords[existingIndex];
      const clampedUsedDate = (() => {
        if (opts?.usedDate === undefined) return existing.usedDate;
        const k = cycleKeyForDate(opts.usedDate, benefit, card.cardOpenDate);
        return k === targetKey ? opts.usedDate : defaultDate;
      })();

      const patch: UpdateUsageRecordPatch = {
        usedDate: clampedUsedDate,
      };
      if (opts?.actualValue !== undefined) patch.actualValue = opts.actualValue;
      if (opts?.propagateNext !== undefined) patch.propagateNext = opts.propagateNext;
      get().updateBenefitUsageRecord(cardId, benefitId, existingIndex, patch);
      return;
    }

    get().addCycleUsage(cardId, benefitId, cycleStart, cycleEnd, {
      consumedFace: benefit.faceValue,
      actualValue: opts?.actualValue ?? benefit.faceValue,
      ...(opts?.usedDate !== undefined ? { usedDate: opts.usedDate } : {}),
      ...(opts?.propagateNext !== undefined ? { propagateNext: opts.propagateNext } : {}),
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
      // marked it consumed, don't overwrite. The marker uses the full
      // benefit faceValue (legacy "fully rolled" semantic) because the user
      // has explicitly opted into this cycle being handled.
      const hasCurrentUsage = preserved.some(
        (r) => r.usedDate >= currentCycleStart && r.kind === "usage",
      );
      const currentMarker = hasCurrentUsage
        ? []
        : [makeRolloverRecord(currentCycleStart, benefit.faceValue)];

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
    const todayDate = new Date();
    const today = formatDate(todayDate);
    const { cards: synced } = syncAllCardsWithTemplates(migrated, templates, today);
    // Batch-6: after migration + template sync, walk every subscription
    // benefit and auto-create propagateNext records for missed months so
    // consumers don't have to virtually compute forward chains. Idempotent.
    const materialized = materializeSubscriptionPropagation(synced, todayDate);

    set({
      cards: materialized,
      // Merge onto defaults so imports from older versions don't leave
      // newly-added fields (e.g. theme) undefined.
      settings: {
        ...DEFAULT_SETTINGS,
        ...((data.settings as Partial<AppSettings> | undefined) ?? {}),
      },
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
