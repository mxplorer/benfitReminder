export type { LogLevel } from "../lib/logger";

// --- Template types (built-in, read-only) ---

export type BenefitCategory =
  | "airline"
  | "hotel"
  | "dining"
  | "travel"
  | "streaming"
  | "shopping"
  | "wellness"
  | "transportation"
  | "entertainment"
  | "other";

export type ResetType =
  | "calendar"
  | "anniversary"
  | "since_last_use"
  | "subscription"
  | "one_time";

export type CalendarPeriod =
  | "monthly"
  | "quarterly"
  | "semi_annual"
  | "annual"
  | "every_4_years";

export interface ResetConfig {
  period?: CalendarPeriod;
  applicableMonths?: number[];
  cooldownDays?: number;
  expiresDate?: string;
}

export interface BenefitTemplate {
  name: string;
  description: string;
  faceValue: number;
  category: BenefitCategory;
  resetType: ResetType;
  resetConfig: ResetConfig;
}

export interface CardType {
  slug: string;
  name: string;
  defaultAnnualFee: number;
  color: string;
  defaultBenefits: BenefitTemplate[];
}

// --- User data types (persisted to JSON) ---

export interface UsageRecord {
  usedDate: string;
  faceValue: number;
  actualValue: number;
}

export interface Benefit {
  id: string;
  name: string;
  description: string;
  faceValue: number;
  category: BenefitCategory;
  resetType: ResetType;
  resetConfig: ResetConfig;
  isHidden: boolean;
  autoRecur: boolean;
  usageRecords: UsageRecord[];
}

export interface CreditCard {
  id: string;
  owner: string;
  cardTypeSlug: string;
  customName?: string;
  alias?: string;
  cardNumber?: string;
  annualFee: number;
  cardOpenDate: string;
  color: string;
  isEnabled: boolean;
  benefits: Benefit[];
}

export interface AppSettings {
  logLevel: "debug" | "info" | "warn" | "error";
  debugLogEnabled: boolean;
  reminderEnabled: boolean;
  reminderDays: number;
  dismissedDate: string | null;
}

export interface AppData {
  version: number;
  cards: CreditCard[];
  settings: AppSettings;
}

// --- Display name ---

export const CARD_TYPE_NAMES: Partial<Record<string, string>> = {
  amex_platinum: "Amex Platinum",
  amex_aspire: "Hilton Aspire",
  chase_sapphire_preferred: "Chase Sapphire Preferred",
  chase_sapphire_reserve: "Chase Sapphire Reserve",
  chase_marriott_boundless: "Chase Marriott Boundless",
};

export const getCardDisplayName = (card: CreditCard): string => {
  if (card.alias) return card.alias;

  const typeName = CARD_TYPE_NAMES[card.cardTypeSlug];

  if (typeName && card.cardNumber && card.cardNumber.length >= 4) {
    const last4 = card.cardNumber.slice(-4);
    return `${typeName} ···${last4}`;
  }

  if (card.customName) return card.customName;

  return typeName ?? "Unknown Card";
};
