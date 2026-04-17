import { useState, useMemo } from "react";
import type { Benefit, CreditCard, UsageRecord } from "../../models/types";
import type { DateRange } from "../../utils/period";
import { getPastPeriods, generateRolloverRecords } from "../../utils/rollover";
import { makeUsageRecord } from "../../utils/usageRecords";
import { useCardStore } from "../../stores/useCardStore";
import { AggregatedBenefitCard } from "../shared/AggregatedBenefitCard";
import type { BenefitDisplayItem } from "../../utils/benefitDisplay";
import "./BackfillDialog.css";

type StepType = "non_rollover" | "rollover" | "summary";

interface BackfillDialogProps {
  card: CreditCard;
  onDone: () => void;
}

interface NonRolloverEntry {
  benefitId: string;
  benefitName: string;
  faceValue: number;
  period: DateRange;
  periodLabel: string;
  checked: boolean;
  actualValue: number;
}

const formatPeriodLabel = (
  period: string,
  range: DateRange,
): string => {
  const start = new Date(range.start + "T00:00:00");
  const year = start.getFullYear();
  const month = start.getMonth() + 1;

  switch (period) {
    case "monthly":
      return `${String(year)}-${String(month).padStart(2, "0")}`;
    case "quarterly": {
      const q = Math.ceil(month / 3);
      return `${String(year)} Q${String(q)}`;
    }
    case "semi_annual": {
      const h = month <= 6 ? 1 : 2;
      return `${String(year)} H${String(h)}`;
    }
    case "annual":
      return String(year);
    default:
      return range.start;
  }
};

const buildNonRolloverEntries = (
  benefits: Benefit[],
  today: Date,
): NonRolloverEntry[] => {
  const entries: NonRolloverEntry[] = [];
  for (const b of benefits) {
    if (b.rolloverable) continue;
    if (b.resetType !== "calendar") continue;
    const period = b.resetConfig.period;
    if (!period) continue;

    const pastPeriods = getPastPeriods(period, today, 12);
    for (const range of pastPeriods) {
      entries.push({
        benefitId: b.id,
        benefitName: b.name,
        faceValue: b.faceValue,
        period: range,
        periodLabel: formatPeriodLabel(period, range),
        checked: false,
        actualValue: b.faceValue,
      });
    }
  }
  return entries;
};

const isMonthlyBenefit = (b: Benefit): boolean =>
  b.resetType === "calendar" && b.resetConfig.period === "monthly";

interface MonthlyGroup {
  benefit: Benefit;
  items: { entryIndex: number; month: number }[];
}

type DisplayUnit =
  | { kind: "flat"; entryIndex: number }
  | { kind: "monthly"; group: MonthlyGroup };

const buildDisplayUnits = (
  entries: NonRolloverEntry[],
  benefits: Benefit[],
): DisplayUnit[] => {
  const benefitById = new Map(benefits.map((b) => [b.id, b]));
  const units: DisplayUnit[] = [];
  const groupByBenefit = new Map<string, MonthlyGroup>();

  entries.forEach((entry, entryIndex) => {
    const benefit = benefitById.get(entry.benefitId);
    if (benefit && isMonthlyBenefit(benefit)) {
      let group = groupByBenefit.get(entry.benefitId);
      if (!group) {
        group = { benefit, items: [] };
        groupByBenefit.set(entry.benefitId, group);
        units.push({ kind: "monthly", group });
      }
      group.items.push({
        entryIndex,
        month: Number(entry.period.start.slice(5, 7)),
      });
    } else {
      units.push({ kind: "flat", entryIndex });
    }
  });

  return units;
};

const buildAggregatedItem = (
  card: CreditCard,
  group: MonthlyGroup,
  entries: NonRolloverEntry[],
): BenefitDisplayItem => {
  const months = group.items.map(({ entryIndex }) => {
    const e = entries[entryIndex];
    return {
      label: e.periodLabel,
      used: false,
      faceValue: e.faceValue,
      cycleStart: e.period.start,
      cycleEnd: e.period.end,
    };
  });
  return {
    benefit: group.benefit,
    card,
    key: `${group.benefit.id}::backfill-agg`,
    variant: "aggregated",
    aggregate: {
      kind: "unused",
      months,
      usedCount: 0,
      unusedCount: months.length,
      totalActualValue: 0,
      totalFaceValue: months.reduce((s, m) => s + m.faceValue, 0),
    },
  };
};

export const BackfillDialog = ({ card, onDone }: BackfillDialogProps) => {
  const backfillBenefitUsage = useCardStore((s) => s.backfillBenefitUsage);
  const today = useMemo(() => new Date(), []);

  const nonRolloverBenefits = card.benefits.filter(
    (b) => !b.rolloverable && b.resetType === "calendar" && b.resetConfig.period,
  );
  const rolloverBenefits = card.benefits.filter((b) => b.rolloverable);

  const hasNonRollover = nonRolloverBenefits.length > 0;
  const hasRollover = rolloverBenefits.length > 0;

  const steps = useMemo(() => {
    const s: StepType[] = [];
    if (hasNonRollover) s.push("non_rollover");
    if (hasRollover) s.push("rollover");
    s.push("summary");
    return s;
  }, [hasNonRollover, hasRollover]);

  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = steps[stepIndex];

  // Step 1 state: non-rollover entries
  const [entries, setEntries] = useState<NonRolloverEntry[]>(() =>
    buildNonRolloverEntries(card.benefits, today),
  );

  // Step 2 state: rollover amounts per benefit
  const [rolloverAmounts, setRolloverAmounts] = useState<Record<string, number>>(
    () => Object.fromEntries(rolloverBenefits.map((b) => [b.id, 0])),
  );

  const goNext = () => {
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const handleNonRolloverCommit = () => {
    // Group checked entries by benefit and commit
    const byBenefit = new Map<string, UsageRecord[]>();
    for (const entry of entries) {
      if (!entry.checked) continue;
      const records = byBenefit.get(entry.benefitId) ?? [];
      records.push(
        makeUsageRecord({
          usedDate: entry.period.start,
          faceValue: entry.faceValue,
          actualValue: entry.actualValue,
        }),
      );
      byBenefit.set(entry.benefitId, records);
    }
    for (const [benefitId, records] of byBenefit) {
      backfillBenefitUsage(card.id, benefitId, records);
    }
    goNext();
  };

  const handleRolloverCommit = () => {
    for (const b of rolloverBenefits) {
      const amount = rolloverAmounts[b.id] ?? 0;
      if (amount <= 0) continue;
      const records = generateRolloverRecords(b, amount, today);
      if (records.length > 0) {
        backfillBenefitUsage(card.id, b.id, records);
      }
    }
    goNext();
  };

  const toggleEntry = (index: number) => {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, checked: !e.checked } : e)),
    );
  };

  const updateEntryValue = (index: number, value: number) => {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, actualValue: value } : e)),
    );
  };

  const updateRolloverAmount = (benefitId: string, value: number) => {
    setRolloverAmounts((prev) => ({ ...prev, [benefitId]: value }));
  };

  return (
    <div className="backfill-dialog__overlay">
      <div className="backfill-dialog">
        <h2 className="backfill-dialog__title">历史使用记录回填</h2>
        <p className="backfill-dialog__step-indicator">
          步骤 {stepIndex + 1} / {steps.length}
        </p>

        {currentStep === "non_rollover" && (
          <>
            <p className="backfill-dialog__hint">
              勾选过去已使用的权益期间，可修改实际使用金额。
            </p>
            {buildDisplayUnits(entries, card.benefits).map((unit) => {
              if (unit.kind === "flat") {
                const i = unit.entryIndex;
                const entry = entries[i];
                return (
                  <div key={`${entry.benefitId}-${entry.period.start}`} className="backfill-dialog__entry">
                    <label className="backfill-dialog__entry-label">
                      <input
                        type="checkbox"
                        checked={entry.checked}
                        onChange={() => { toggleEntry(i); }}
                      />
                      <span className="backfill-dialog__benefit-name">
                        {entry.benefitName}
                      </span>
                      <span className="backfill-dialog__period-label">
                        {entry.periodLabel}
                      </span>
                    </label>
                    {entry.checked && (
                      <input
                        type="number"
                        className="backfill-dialog__value-input"
                        value={entry.actualValue}
                        onChange={(e) => {
                          updateEntryValue(i, Number(e.target.value));
                        }}
                      />
                    )}
                  </div>
                );
              }
              const { group } = unit;
              const item = buildAggregatedItem(card, group, entries);
              const checkedMonths = new Set<number>();
              const values: Record<number, number> = {};
              for (const { entryIndex, month } of group.items) {
                values[month] = entries[entryIndex].actualValue;
                if (entries[entryIndex].checked) checkedMonths.add(month);
              }
              return (
                <div
                  key={`${group.benefit.id}-monthly-agg`}
                  className="backfill-dialog__entry"
                  data-testid={`backfill-monthly-agg-${group.benefit.id}`}
                >
                  <AggregatedBenefitCard
                    item={item}
                    pending={{
                      checkedMonths,
                      values,
                      onToggleMonth: (month) => {
                        const found = group.items.find((it) => it.month === month);
                        if (found) toggleEntry(found.entryIndex);
                      },
                      onValueChange: (month, value) => {
                        const found = group.items.find((it) => it.month === month);
                        if (found) updateEntryValue(found.entryIndex, value);
                      },
                    }}
                  />
                </div>
              );
            })}
            <div className="backfill-dialog__actions">
              <button
                className="backfill-dialog__btn"
                onClick={goNext}
              >
                跳过
              </button>
              <button
                className="backfill-dialog__btn backfill-dialog__btn--primary"
                onClick={handleNonRolloverCommit}
              >
                下一步
              </button>
            </div>
          </>
        )}

        {currentStep === "rollover" && (
          <>
            <p className="backfill-dialog__hint">
              输入每项权益累积的 rollover 额度（美元）。
            </p>
            {rolloverBenefits.map((b) => (
              <div key={b.id} className="backfill-dialog__entry">
                <span className="backfill-dialog__benefit-name">
                  {b.name}
                </span>
                <div className="backfill-dialog__rollover-input-row">
                  <span>累积的 rollover 额度：$</span>
                  <input
                    type="number"
                    className="backfill-dialog__value-input"
                    value={rolloverAmounts[b.id] ?? 0}
                    onChange={(e) => {
                      updateRolloverAmount(b.id, Number(e.target.value));
                    }}
                  />
                </div>
              </div>
            ))}
            <div className="backfill-dialog__actions">
              <button
                className="backfill-dialog__btn"
                onClick={goNext}
              >
                跳过
              </button>
              <button
                className="backfill-dialog__btn backfill-dialog__btn--primary"
                onClick={handleRolloverCommit}
              >
                下一步
              </button>
            </div>
          </>
        )}

        {currentStep === "summary" && (
          <>
            <p className="backfill-dialog__hint">回填完成。</p>
            <div className="backfill-dialog__actions">
              <button
                className="backfill-dialog__btn backfill-dialog__btn--primary"
                onClick={onDone}
              >
                完成
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
