import { useEffect, useRef, useState } from "react";
import type { BenefitDisplayItem } from "../../utils/benefitDisplay";
import { useToday } from "../../stores/useToday";
import { formatDate, getConsumedInPeriod, getCurrentPeriodRange } from "../../utils/period";
import { getTotalFaceWithRollover } from "../../utils/rollover";
import { latestHasPropagate } from "../../utils/usageRecords";
import { BenefitUsagePrompt } from "./BenefitUsagePrompt";
import { GlassContainer } from "./GlassContainer";
import "./AggregatedBenefitCard.css";

interface AddCycleUsageOpts {
  consumedFace: number;
  actualValue: number;
  usedDate?: string;
  propagateNext?: boolean;
}

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
  onAddCycleUsage?: (
    cardId: string,
    benefitId: string,
    cycleStart: string,
    cycleEnd: string,
    opts: AddCycleUsageOpts,
  ) => void;
  onManageUsage?: (cardId: string, benefitId: string) => void;
  onToggleHidden?: (cardId: string, benefitId: string) => void;
  onDelete?: (cardId: string, benefitId: string) => void;
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
  onAddCycleUsage,
  onManageUsage,
  onToggleHidden,
  onDelete,
  pending,
}: AggregatedBenefitCardProps) => {
  const [expanded, setExpanded] = useState(pending?.defaultExpanded ?? false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [promptingCycleStart, setPromptingCycleStart] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const today = useToday();
  const todayIso = formatDate(today);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => { document.removeEventListener("mousedown", handler); };
  }, [menuOpen]);

  const agg = item.aggregate;
  if (!agg) return null;

  const pendingChecked = pending ? toCheckedSet(pending.checkedMonths) : null;
  const summary = pending ? buildPendingSummary(item, pending) : buildSummary(item);

  const { benefit, card } = item;
  const hasMenu = !pending && (onManageUsage || onToggleHidden || (onDelete && !benefit.templateBenefitId));

  // Current-month progress (only when not in pending mode). Compute from the
  // benefit's records directly so it stays accurate even when the current
  // cycle doesn't appear in agg.months — 未使用 excludes cycles with any
  // records, 已使用 excludes cycles with partial consumption, so a partially-
  // consumed current month falls into neither bucket. The live summary must
  // still reflect reality.
  const currentRange = !pending ? getCurrentPeriodRange(today, {
    resetType: benefit.resetType,
    resetConfig: benefit.resetConfig,
    cardOpenDate: card.cardOpenDate,
  }) : null;
  const inCurrentRange = currentRange
    ? todayIso >= currentRange.start && todayIso <= currentRange.end
    : false;
  const currentConsumed = inCurrentRange
    ? getConsumedInPeriod(benefit, today, card.cardOpenDate)
    : 0;
  const currentFace = getTotalFaceWithRollover(benefit, today);
  const currentPct = currentFace > 0
    ? Math.max(0, Math.min(100, (currentConsumed / currentFace) * 100))
    : 0;
  const currentStatus: "used" | "partial" | "empty" =
    currentConsumed >= currentFace && currentFace > 0
      ? "used"
      : currentConsumed > 0
        ? "partial"
        : "empty";

  return (
    <GlassContainer className="agg-benefit-card">
      <div className="agg-benefit-card__head">
        <button
          className="agg-benefit-card__summary"
          data-testid="agg-expand"
          onClick={() => { setExpanded((e) => !e); }}
        >
          <span className="agg-benefit-card__summary-text">{summary}</span>
          <span className="agg-benefit-card__chevron">{expanded ? "▴" : "▾"}</span>
        </button>
        {hasMenu && (
          <div className="agg-benefit-card__menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="agg-benefit-card__icon-btn"
              onClick={() => { setMenuOpen((o) => !o); }}
              aria-label="更多操作"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="更多操作"
            >
              <span aria-hidden="true">⋯</span>
            </button>
            <div
              className={`agg-benefit-card__menu${menuOpen ? " agg-benefit-card__menu--open" : ""}`}
              role="menu"
            >
              {onManageUsage && (
                <button
                  type="button"
                  role="menuitem"
                  className="agg-benefit-card__menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onManageUsage(card.id, benefit.id);
                  }}
                  aria-label="管理使用"
                >
                  管理使用
                </button>
              )}
              {onToggleHidden && (
                <button
                  type="button"
                  role="menuitem"
                  className="agg-benefit-card__menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onToggleHidden(card.id, benefit.id);
                  }}
                  aria-label={benefit.isHidden ? "取消隐藏" : "隐藏"}
                >
                  {benefit.isHidden ? "取消隐藏" : "隐藏"}
                </button>
              )}
              {onDelete && !benefit.templateBenefitId && (
                <button
                  type="button"
                  role="menuitem"
                  className="agg-benefit-card__menu-item agg-benefit-card__menu-item--danger"
                  onClick={() => {
                    setMenuOpen(false);
                    if (window.confirm(`确定删除权益 "${benefit.name}" 吗？`)) {
                      onDelete(card.id, benefit.id);
                    }
                  }}
                  aria-label="删除权益"
                >
                  删除权益
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {!pending && currentFace > 0 && inCurrentRange && (
        <div
          className={`agg-benefit-card__current agg-benefit-card__current--${currentStatus}`}
          data-testid="agg-current-month"
        >
          <div className="agg-benefit-card__current-row">
            <span className="agg-benefit-card__current-label">本月</span>
            <span className="agg-benefit-card__current-value">
              ${String(Math.round(currentConsumed))}/${String(currentFace)}
            </span>
          </div>
          <div
            className="agg-benefit-card__current-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(currentPct)}
            aria-label={`本月已用 $${String(Math.round(currentConsumed))} / $${String(currentFace)}`}
          >
            <div
              className={`agg-benefit-card__current-bar-fill agg-benefit-card__current-bar-fill--${currentStatus}`}
              style={{ width: `${String(currentPct)}%` }}
            />
          </div>
        </div>
      )}

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
            const remaining = Math.max(0, m.faceValue - consumed);
            const isPrompting = promptingCycleStart === m.cycleStart;
            const valueText = m.used && m.record
              ? `$${String(m.record.actualValue)}`
              : isPartial
                ? `已用 $${String(consumed)} / $${String(m.faceValue)}`
                : `$${String(m.faceValue)}`;
            return (
              <li
                key={m.label}
                data-testid={`agg-month-row-${m.label}`}
                className={`agg-benefit-card__row${m.used ? " agg-benefit-card__row--used" : ""}${isPartial ? " agg-benefit-card__row--partial" : ""}${isPrompting ? " agg-benefit-card__row--prompting" : ""}`}
              >
                <span className="agg-benefit-card__row-label">{m.label}</span>
                <span className="agg-benefit-card__row-value">{valueText}</span>
                {!isPrompting && m.used && (
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
                )}
                {!isPrompting && !m.used && isPartial && onAddCycleUsage && (
                  <button
                    data-testid={`agg-month-continue-${m.label}`}
                    className="agg-benefit-card__row-continue"
                    onClick={() => { setPromptingCycleStart(m.cycleStart); }}
                    aria-label="再用一次"
                    title="再用一次"
                  >
                    + 再用一次 (${String(remaining)} 剩)
                  </button>
                )}
                {!isPrompting && !m.used && !isPartial && (
                  onSetCycleUsed ? (
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
                  ) : onToggleUsage ? (
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
                  ) : null
                )}
                {isPrompting && (
                  <BenefitUsagePrompt
                    cardId={item.card.id}
                    benefitId={item.benefit.id}
                    mode="add"
                    cycleStart={m.cycleStart}
                    cycleEnd={m.cycleEnd}
                    initial={{
                      consumedFace: remaining,
                      actualValue: remaining,
                      usedDate:
                        todayIso >= m.cycleStart && todayIso <= m.cycleEnd
                          ? todayIso
                          : m.cycleStart,
                      propagateNext: latestHasPropagate(item.benefit),
                    }}
                    monthlyLike={true}
                    dateRequired={false}
                    todayIso={todayIso}
                    onAddCycleUsage={onAddCycleUsage}
                    onSetCycleUsed={onSetCycleUsed}
                    onToggleUsage={onToggleUsage}
                    onClose={() => { setPromptingCycleStart(null); }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </GlassContainer>
  );
};
