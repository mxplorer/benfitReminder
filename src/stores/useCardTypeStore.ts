import { create } from "zustand";
import type { CardType } from "../models/types";

interface CardTypeStoreState {
  cardTypes: CardType[];
}

interface CardTypeStoreActions {
  setBuiltinCardTypes: (builtins: CardType[]) => void;
  addUserCardType: (cardType: CardType) => void;
  removeUserCardType: (slug: string) => void;
  getCardType: (slug: string) => CardType | undefined;
  getCardImage: (slug: string) => string | undefined;
  reset: () => void;
}

export const useCardTypeStore = create<CardTypeStoreState & CardTypeStoreActions>()(
  (set, get) => ({
    cardTypes: [],

    setBuiltinCardTypes: (builtins) => {
      set((state) => {
        const userTypes = state.cardTypes.filter((ct) => !ct.isBuiltin);
        return { cardTypes: [...builtins, ...userTypes] };
      });
    },

    addUserCardType: (cardType) => {
      const existing = get().cardTypes.find((ct) => ct.slug === cardType.slug);
      if (existing) {
        throw new Error(
          `Card type slug "${cardType.slug}" already exists. Choose a different slug.`,
        );
      }
      set((state) => ({
        cardTypes: [...state.cardTypes, { ...cardType, isBuiltin: false }],
      }));
    },

    removeUserCardType: (slug) => {
      const ct = get().cardTypes.find((c) => c.slug === slug);
      if (ct?.isBuiltin) {
        throw new Error(`Cannot remove built-in card type "${slug}".`);
      }
      set((state) => ({
        cardTypes: state.cardTypes.filter((c) => c.slug !== slug),
      }));
    },

    getCardType: (slug) => get().cardTypes.find((ct) => ct.slug === slug),

    getCardImage: (slug) => get().cardTypes.find((ct) => ct.slug === slug)?.image,

    reset: () => { set({ cardTypes: [] }); },
  }),
);
