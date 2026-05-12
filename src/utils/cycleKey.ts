import type { Benefit, UsageRecord } from "../models/types";
import { formatDate, lastDay } from "./period";

// A cycle key is an intrinsic identifier for "which cycle does this date/record
// belong to". Computed purely from the date + benefit definition. Two records
// with the same key belong to the same cycle; a record matches a PeriodCycle
// iff their keys are equal.
export type CycleKey = string;

const parseIsoDate = (iso: string): Date => new Date(iso + "T00:00:00");

const anniversaryYearOf = (dateIso: string, cardOpenDate: string): number => {
  const date = parseIsoDate(dateIso);
  const open = parseIsoDate(cardOpenDate);
  const y = date.getFullYear();
  const maxDay = lastDay(y, open.getMonth() + 1);
  const anniv = new Date(y, open.getMonth(), Math.min(open.getDate(), maxDay));
  return date >= anniv ? y : y - 1;
};

export const cycleKeyForDate = (
  dateIso: string,
  benefit: Benefit,
  cardOpenDate: string,
): CycleKey => {
  const { resetType, resetConfig } = benefit;
  if (resetType === "subscription") {
    return `M:${dateIso.slice(0, 7)}`;
  }
  if (resetType === "calendar") {
    const d = parseIsoDate(dateIso);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    switch (resetConfig.period) {
      case "monthly":
        return `M:${String(y)}-${String(m).padStart(2, "0")}`;
      case "quarterly": {
        const q = Math.floor((m - 1) / 3) + 1;
        return `Q:${String(y)}-Q${String(q)}`;
      }
      case "semi_annual":
        return `H:${String(y)}-H${m <= 6 ? "1" : "2"}`;
      case "annual":
        return `Y:${String(y)}`;
      case "every_4_years":
        return `E4:${String(y - (y % 4))}`;
      default:
        return `?:${dateIso}`;
    }
  }
  if (resetType === "anniversary") {
    return `A:${String(anniversaryYearOf(dateIso, cardOpenDate))}`;
  }
  if (resetType === "one_time") {
    return "OT:1";
  }
  // since_last_use: each record is its own cycle.
  return `SLU:${dateIso}`;
};

export const cycleKeyForRecord = (
  record: UsageRecord,
  benefit: Benefit,
  cardOpenDate: string,
): CycleKey => cycleKeyForDate(record.usedDate, benefit, cardOpenDate);

export const currentCycleKey = (
  today: Date,
  benefit: Benefit,
  cardOpenDate?: string,
): CycleKey | null => {
  const { resetType } = benefit;
  if (resetType === "one_time") return "OT:1";
  if (resetType === "since_last_use") return null;
  if (resetType === "anniversary" && !cardOpenDate) return null;
  return cycleKeyForDate(formatDate(today), benefit, cardOpenDate ?? "");
};

export const cycleKeyLabel = (key: CycleKey): string => {
  const colonIdx = key.indexOf(":");
  if (colonIdx < 0) return key;
  const tag = key.slice(0, colonIdx);
  const rest = key.slice(colonIdx + 1);

  switch (tag) {
    case "M": {
      const m = /^(\d{4})-(\d{2})$/.exec(rest);
      if (!m) return key;
      const year = m[1];
      const month = String(parseInt(m[2], 10));
      return `${year} 年 ${month} 月`;
    }
    case "Q": {
      const m = /^(\d{4})-Q([1-4])$/.exec(rest);
      if (!m) return key;
      return `${m[1]} Q${m[2]}`;
    }
    case "H": {
      const m = /^(\d{4})-H([12])$/.exec(rest);
      if (!m) return key;
      return `${m[1]} ${m[2] === "1" ? "上半年" : "下半年"}`;
    }
    case "Y": {
      if (!/^\d{4}$/.test(rest)) return key;
      return `${rest} 年`;
    }
    case "E4": {
      if (!/^\d{4}$/.test(rest)) return key;
      const startYear = parseInt(rest, 10);
      return `${String(startYear)}–${String(startYear + 3)}`;
    }
    case "A": {
      if (!/^\d{4}$/.test(rest)) return key;
      return `${rest} 会员年`;
    }
    case "OT":
      return "全期";
    case "SLU":
      return `${rest} 起`;
    default:
      return key;
  }
};

export const cycleKeySortValue = (key: CycleKey): number => {
  const colonIdx = key.indexOf(":");
  if (colonIdx < 0) return 0;
  const tag = key.slice(0, colonIdx);
  const rest = key.slice(colonIdx + 1);

  switch (tag) {
    case "M": {
      const m = /^(\d{4})-(\d{2})$/.exec(rest);
      if (!m) return 0;
      return parseInt(m[1], 10) * 10000 + parseInt(m[2], 10) * 100;
    }
    case "Q": {
      const m = /^(\d{4})-Q([1-4])$/.exec(rest);
      if (!m) return 0;
      return parseInt(m[1], 10) * 10000 + parseInt(m[2], 10) * 300;
    }
    case "H": {
      const m = /^(\d{4})-H([12])$/.exec(rest);
      if (!m) return 0;
      return parseInt(m[1], 10) * 10000 + parseInt(m[2], 10) * 600;
    }
    case "Y":
    case "E4":
    case "A": {
      if (!/^\d{4}$/.test(rest)) return 0;
      return parseInt(rest, 10) * 10000;
    }
    case "SLU": {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rest);
      if (!m) return 0;
      return (
        parseInt(m[1], 10) * 10000 +
        parseInt(m[2], 10) * 100 +
        parseInt(m[3], 10)
      );
    }
    default:
      return 0;
  }
};
