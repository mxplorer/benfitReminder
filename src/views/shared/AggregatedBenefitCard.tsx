import { useState } from "react";
import type { BenefitDisplayItem } from "../../utils/benefitDisplay";
import { GlassContainer } from "./GlassContainer";
import "./AggregatedBenefitCard.css";

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
}

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

export const AggregatedBenefitCard = ({
  item,
  onToggleUsage,
  onSetCycleUsed,
}: AggregatedBenefitCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const agg = item.aggregate;
  if (!agg) return null;

  return (
    <GlassContainer className="agg-benefit-card">
      <button
        className="agg-benefit-card__summary"
        data-testid="agg-expand"
        onClick={() => { setExpanded((e) => !e); }}
      >
        <span className="agg-benefit-card__summary-text">{buildSummary(item)}</span>
        <span className="agg-benefit-card__chevron">{expanded ? "▴" : "▾"}</span>
      </button>
      {expanded && (
        <ul className="agg-benefit-card__rows">
          {agg.months.map((m) => (
            <li
              key={m.label}
              data-testid={`agg-month-row-${m.label}`}
              className={`agg-benefit-card__row${m.used ? " agg-benefit-card__row--used" : ""}`}
            >
              <span className="agg-benefit-card__row-label">{m.label}</span>
              <span className="agg-benefit-card__row-value">
                {m.used && m.record
                  ? `$${String(m.record.actualValue)}`
                  : `$${String(m.faceValue)}`}
              </span>
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
          ))}
        </ul>
      )}
    </GlassContainer>
  );
};
