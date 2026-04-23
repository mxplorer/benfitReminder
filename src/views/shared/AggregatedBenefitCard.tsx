import { useState } from "react";
import type { BenefitDisplayItem } from "../../utils/benefitDisplay";
import { GlassContainer } from "./GlassContainer";
import "./AggregatedBenefitCard.css";

export interface AggregatedBenefitPending {
  checkedMonths: Set<number> | number[];
  values: Record<number, number>;
  onToggleMonth: (month: number) => void;
  onValueChange: (month: number, value: number) => void;
  defaultExpanded?: boolean;
}

interface AggregatedBenefitCardProps {
  item: BenefitDisplayItem;
  onToggleUsage?: (cardId: string, benefitId: string, actualValue?: number, usedDate?: string) => void;
  onSetCycleUsed?: (
    cardId: string,
    benefitId: string,
    cycleStart: string,
    cycleEnd: string,
    used: boolean,
    opts?: { actualValue?: number; usedDate?: string },
  ) => void;
  pending?: AggregatedBenefitPending;
}

const monthNumFromCycleStart = (cycleStart: string): number =>
  Number(cycleStart.slice(5, 7));

const toCheckedSet = (m: Set<number> | number[]): Set<number> =>
  m instanceof Set ? m : new Set(m);

const buildSummary = (item: BenefitDisplayItem): string => {
  const agg = item.aggregate;
  if (!agg) return "";
  const name = item.benefit.name;
  if (agg.kind === "used") {
    return `${name} · ${String(agg.usedCount)} 次 · 共 $${String(agg.totalActualValue)}`;
  }
  if (agg.kind === "unused") {
    const totalUnusedFace = agg.months
      .filter((m) => !m.used)
      .reduce((s, m) => s + m.faceValue, 0);
    return `${name} · 未使用 ${String(agg.unusedCount)} 个月 · 共 $${String(totalUnusedFace)}`;
  }
  return `${name} · ${String(agg.months.length)} 个月 · 已用 ${String(agg.usedCount)} · 未用 ${String(agg.unusedCount)} · $${String(agg.totalActualValue)} / $${String(agg.totalFaceValue)}`;
};

const buildPendingSummary = (
  item: BenefitDisplayItem,
  pending: AggregatedBenefitPending,
): string => {
  const total = item.aggregate?.months.length ?? 0;
  const checked = toCheckedSet(pending.checkedMonths).size;
  return `${item.benefit.name} · 已选 ${String(checked)} / ${String(total)} 个月`;
};

export const AggregatedBenefitCard = ({
  item,
  onToggleUsage,
  onSetCycleUsed,
  pending,
}: AggregatedBenefitCardProps) => {
  const [expanded, setExpanded] = useState(pending?.defaultExpanded ?? false);
  const agg = item.aggregate;
  if (!agg) return null;

  const pendingChecked = pending ? toCheckedSet(pending.checkedMonths) : null;
  const summary = pending ? buildPendingSummary(item, pending) : buildSummary(item);

  return (
    <GlassContainer className="agg-benefit-card">
      <button
        className="agg-benefit-card__summary"
        data-testid="agg-expand"
        onClick={() => { setExpanded((e) => !e); }}
      >
        <span className="agg-benefit-card__summary-text">{summary}</span>
        <span className="agg-benefit-card__chevron">{expanded ? "▴" : "▾"}</span>
      </button>
      {expanded && pending && pendingChecked && (
        <ul className="agg-benefit-card__rows">
          {agg.months.map((m) => {
            const monthNum = monthNumFromCycleStart(m.cycleStart);
            const isChecked = pendingChecked.has(monthNum);
            const value = pending.values[monthNum] ?? m.faceValue;
            return (
              <li
                key={m.label}
                data-testid={`agg-pending-row-${m.label}`}
                className={`agg-benefit-card__row${isChecked ? " agg-benefit-card__row--used" : ""}`}
              >
                <label className="agg-benefit-card__row-label agg-benefit-card__pending-label">
                  <input
                    type="checkbox"
                    data-testid={`agg-pending-check-${m.label}`}
                    checked={isChecked}
                    onChange={() => { pending.onToggleMonth(monthNum); }}
                  />
                  <span>{m.label}</span>
                </label>
                {isChecked ? (
                  <input
                    type="number"
                    data-testid={`agg-pending-value-${m.label}`}
                    className="agg-benefit-card__pending-value"
                    value={value}
                    onChange={(e) => {
                      pending.onValueChange(monthNum, Number(e.target.value));
                    }}
                  />
                ) : (
                  <span className="agg-benefit-card__row-value">${String(m.faceValue)}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {expanded && !pending && (
        <ul className="agg-benefit-card__rows">
          {agg.months.map((m) => {
            const consumed = m.consumedValue ?? 0;
            // Partial: not fully used (still in unused bucket) but has some
            // cumulative consumption this cycle. Surface it so users can see
            // they've used part of the credit already.
            const isPartial = !m.used && consumed > 0 && consumed < m.faceValue;
            const valueText = m.used && m.record
              ? `$${String(m.record.actualValue)}`
              : isPartial
                ? `已用 $${String(consumed)} / $${String(m.faceValue)}`
                : `$${String(m.faceValue)}`;
            return (
              <li
                key={m.label}
                data-testid={`agg-month-row-${m.label}`}
                className={`agg-benefit-card__row${m.used ? " agg-benefit-card__row--used" : ""}${isPartial ? " agg-benefit-card__row--partial" : ""}`}
              >
                <span className="agg-benefit-card__row-label">{m.label}</span>
                <span className="agg-benefit-card__row-value">{valueText}</span>
                {m.used ? (
                  <>
                    <span className="agg-benefit-card__row-date">{m.record?.usedDate ?? ""}</span>
                    {onSetCycleUsed && (
                      <button
                        data-testid={`agg-month-uncheck-${m.label}`}
                        className="agg-benefit-card__row-uncheck"
                        onClick={() => {
                          onSetCycleUsed(
                            item.card.id,
                            item.benefit.id,
                            m.cycleStart,
                            m.cycleEnd,
                            false,
                          );
                        }}
                        aria-label="取消使用"
                      >
                        ✕
                      </button>
                    )}
                  </>
                ) : onSetCycleUsed ? (
                  <button
                    data-testid={`agg-month-check-${m.label}`}
                    className="agg-benefit-card__row-check"
                    onClick={() => {
                      onSetCycleUsed(
                        item.card.id,
                        item.benefit.id,
                        m.cycleStart,
                        m.cycleEnd,
                        true,
                        { actualValue: m.faceValue },
                      );
                    }}
                    aria-label="标记使用"
                  >
                    ✓
                  </button>
                ) : (
                  onToggleUsage && (
                    <button
                      data-testid={`agg-month-check-${m.label}`}
                      className="agg-benefit-card__row-check"
                      onClick={() => {
                        onToggleUsage(
                          item.card.id,
                          item.benefit.id,
                          m.faceValue,
                          m.cycleStart,
                        );
                      }}
                      aria-label="标记使用"
                    >
                      ✓
                    </button>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </GlassContainer>
  );
};
