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
  /** When resetType === "anniversary", align the cycle to the next statement
   * close on-or-after the anniversary date. Requires CreditCard.statementClosingDay. */
  resetsAtStatementClose?: boolean;
}

export interface BenefitTemplate {
  name: string;
  description: string;
  faceValue: number;
  category: BenefitCategory;
  resetType: ResetType;
  resetConfig: ResetConfig;
  rolloverable?: boolean;
  rolloverMaxYears?: number;
}

export interface CardType {
  slug: string;
  name: string;
  defaultAnnualFee: number;
  color: string;
  image?: string;       // optional card face image URL
  isBuiltin: boolean;   // true for built-in, false for user-created
  defaultBenefits: BenefitTemplate[];
}

// --- User data types (persisted to JSON) ---

export interface UsageRecord {
  usedDate: string;
  faceValue: number;
  actualValue: number;
  isRollover?: boolean;
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
  rolloverable: boolean;
  rolloverMaxYears: number;
  usageRecords: UsageRecord[];
  /**
   * Months (YYYY-MM) where the user explicitly cancelled the auto-replicate
   * record for a monthly autoRecur subscription. Only meaningful when
   * resetType === "subscription" && autoRecur === true && resetConfig.period === "monthly".
   */
  cancelledMonths?: string[];
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
  /** Day of month (1-31) that the card's statement closes. Used by
   * resetsAtStatementClose benefits. Clamped to last day of short months. */
  statementClosingDay?: number;
}

export interface AppSettings {
  logLevel: "debug" | "info" | "warn" | "error";
  debugLogEnabled: boolean;
  reminderEnabled: boolean;
  reminderDays: number;
  dismissedDate: string | null;
  /** Tray panel background opacity 0–100. */
  trayOpacity: number;
}

export interface AppData {
  version: number;
  cards: CreditCard[];
  settings: AppSettings;
}

// --- Display name ---

export const getCardDisplayName = (card: CreditCard, typeName?: string): string => {
  if (card.alias) return card.alias;

  if (typeName && card.cardNumber && card.cardNumber.length >= 4) {
    const last4 = card.cardNumber.slice(-4);
    return `${typeName} ···${last4}`;
  }

  if (card.customName) return card.customName;

  return typeName ?? "Unknown Card";
};
