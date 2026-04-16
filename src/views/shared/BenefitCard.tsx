import { useState } from "react";
import type { Benefit, CreditCard, ResetType, UsageRecord } from "../../models/types";
import { formatDate, getDeadline, getDaysRemaining, isBenefitUsedInPeriod } from "../../utils/period";
import { getAvailableValue } from "../../utils/rollover";
import { latestHasPropagate } from "../../utils/usageRecords";
import { useToday } from "../../stores/useToday";
import { GlassContainer } from "./GlassContainer";
import { StatusTag } from "./StatusTag";

/** Reset types where the refresh date depends on when the benefit was used. */
const DATE_REQUIRED_RESET_TYPES: ReadonlySet<ResetType> = new Set(["anniversary", "since_last_use"]);

interface BenefitCardProps {
  benefit: Benefit;
  card: CreditCard;
  onToggleUsage: (cardId: string, benefitId: string, actualValue?: number, usedDate?: string) => void;
  onEditRollover?: (cardId: string, benefitId: string) => void;
  onToggleHidden?: (cardId: string, benefitId: string) => void;
  onDelete?: (cardId: string, benefitId: string) => void;
  compact?: boolean;
  periodLabel?: string;
  cycleRecord?: UsageRecord;
  cycleUsed?: boolean;
  cycleStart?: string;
  cycleEnd?: string;
  onSetCycleUsed?: (
    cardId: string,
    benefitId: string,
    cycleStart: string,
    cycleEnd: string,
    used: boolean,
    opts?: { actualValue?: number; usedDate?: string; propagateNext?: boolean },
  ) => void;
}

const isMonthlyLikeBenefit = (b: Benefit): boolean =>
  b.resetType === "subscription" ||
  (b.resetType === "calendar" && b.resetConfig.period === "monthly");

const PERIOD_LABELS: Record<string, string> = {
  monthly: "每月",
  quarterly: "每季度",
  semi_annual: "半年",
  annual: "每年",
  every_4_years: "每4年",
};

const getResetLabel = (benefit: Benefit): string => {
  if (benefit.resetType === "subscription") return latestHasPropagate(benefit) ? "订阅·自动" : "订阅";
  if (benefit.resetType === "anniversary") return "周年";
  if (benefit.resetType === "since_last_use") return "按使用";
  if (benefit.resetType === "one_time") return "一次性";
  return PERIOD_LABELS[benefit.resetConfig.period ?? ""] ?? "";
};

export const BenefitCard = ({
  benefit,
  card,
  onToggleUsage,
  onEditRollover,
  onToggleHidden,
  onDelete,
  compact = false,
  periodLabel,
  cycleRecord,
  cycleUsed,
  cycleStart,
  cycleEnd,
  onSetCycleUsed,
}: BenefitCardProps) => {
  const today = useToday();
  const isUsed = cycleUsed ?? isBenefitUsedInPeriod(benefit, today, card.cardOpenDate, card.statementClosingDay);
  const availableValue = getAvailableValue(benefit, today);
  const displayValue = cycleRecord ? cycleRecord.actualValue : availableValue;
  const cycleContext = cycleStart && cycleEnd ? { start: cycleStart, end: cycleEnd } : null;
  const todayIso = formatDate(today);
  const defaultPendingDate = cycleContext
    ? todayIso >= cycleContext.start && todayIso <= cycleContext.end
      ? todayIso
      : cycleContext.start
    : todayIso;
  // When not-yet-used benefit is clicked we open an inline prompt so the user
  // can record the *actual* amount redeemed (may differ from faceValue).
  const [pendingValue, setPendingValue] = useState<string | null>(null);
  const [pendingDate, setPendingDate] = useState<string>(defaultPendingDate);
  const [pendingPropagate, setPendingPropagate] = useState<boolean>(false);
  const [editMode, setEditMode] = useState<"add" | "edit">("add");
  const dateRequired = DATE_REQUIRED_RESET_TYPES.has(benefit.resetType);
  const monthlyLike = isMonthlyLikeBenefit(benefit);

  const deadline = getDeadline(today, {
    resetType: benefit.resetType,
    resetConfig: benefit.resetConfig,
    cardOpenDate: card.cardOpenDate,
    statementClosingDay: card.statementClosingDay,
  });
  const daysRemaining = deadline ? getDaysRemaining(today, deadline) : null;

  const cardClasses = [
    isUsed ? "used" : "",
    benefit.isHidden ? "hidden-benefit" : "",
    daysRemaining !== null && daysRemaining <= 7 && !isUsed ? "urgent" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleClick = () => {
    if (isUsed) {
      // Monthly-like benefits with cycle context: open edit prompt pre-filled
      if (monthlyLike && cycleContext && onSetCycleUsed && cycleRecord) {
        setPendingValue(String(cycleRecord.actualValue));
        setPendingDate(cycleRecord.usedDate);
        setPendingPropagate(cycleRecord.propagateNext === true);
        setEditMode("edit");
        return;
      }
      if (cycleContext && onSetCycleUsed) {
        onSetCycleUsed(card.id, benefit.id, cycleContext.start, cycleContext.end, false);
        return;
      }
      onToggleUsage(card.id, benefit.id);
      return;
    }
    setPendingValue(String(benefit.faceValue));
    setPendingDate(defaultPendingDate);
    setPendingPropagate(latestHasPropagate(benefit));
    setEditMode("add");
  };

  const handleConfirm = () => {
    if (pendingValue === null) return;
    const value = Number(pendingValue);
    if (isNaN(value) || value < 0) return;
    if (dateRequired && !pendingDate) return;
    const propagateOpt = monthlyLike ? { propagateNext: pendingPropagate } : {};
    if (cycleContext && onSetCycleUsed) {
      onSetCycleUsed(card.id, benefit.id, cycleContext.start, cycleContext.end, true, {
        actualValue: value,
        usedDate: pendingDate || undefined,
        ...propagateOpt,
      });
    } else {
      onToggleUsage(card.id, benefit.id, value, pendingDate || undefined);
    }
    setPendingValue(null);
  };

  const handleDelete = () => {
    if (cycleContext && onSetCycleUsed) {
      onSetCycleUsed(card.id, benefit.id, cycleContext.start, cycleContext.end, false);
    }
    setPendingValue(null);
  };

  const handleCancel = () => {
    setPendingValue(null);
  };

  return (
    <GlassContainer className={`benefit-card ${cardClasses}`}>
      <div className="benefit-card__header">
        <StatusTag daysRemaining={daysRemaining} isUsed={isUsed} />
        <span
          className="benefit-card__period"
          title={
            benefit.resetType === "subscription" && latestHasPropagate(benefit)
              ? "自动填充上月金额，可修改或取消"
              : undefined
          }
        >
          {periodLabel ?? getResetLabel(benefit)}
        </span>
        {benefit.rolloverable && (
          <span className="benefit-card__rollover-badge">可Roll</span>
        )}
      </div>
      <span className={`benefit-card__name ${isUsed ? "benefit-card__name--used" : ""}`}>
        {benefit.name}
      </span>
      {!compact && benefit.description && (
        <span className="benefit-card__description">{benefit.description}</span>
      )}
      <div className="benefit-card__footer">
        {pendingValue === null && (
          <span className="benefit-card__value">
            {displayValue > 0 ? `$${String(displayValue)}` : "—"}
          </span>
        )}
        {pendingValue === null ? (
          <div className="benefit-card__actions">
            {onToggleHidden && (
              <button
                className="benefit-card__action-btn"
                onClick={() => { onToggleHidden(card.id, benefit.id); }}
                aria-label={benefit.isHidden ? "取消隐藏" : "隐藏"}
                title={benefit.isHidden ? "取消隐藏" : "隐藏"}
              >
                {benefit.isHidden ? "👁" : "🙈"}
              </button>
            )}
            {onDelete && !benefit.templateBenefitId && (
              <button
                className="benefit-card__action-btn benefit-card__action-btn--danger"
                onClick={() => {
                  if (window.confirm(`确定删除权益 "${benefit.name}" 吗？`)) {
                    onDelete(card.id, benefit.id);
                  }
                }}
                aria-label="删除权益"
                title="删除权益"
              >
                ✕
              </button>
            )}
            {onEditRollover && benefit.rolloverable && (
              <button
                className="benefit-card__action-btn benefit-card__rollover-btn"
                onClick={() => { onEditRollover(card.id, benefit.id); }}
                aria-label="Rollover 设置"
                title="Rollover 设置"
              >
                <span className="benefit-card__rollover-icon">⟳</span>
              </button>
            )}
            <button
              className={`benefit-card__check-btn ${isUsed ? "benefit-card__check-btn--checked" : ""}`}
              onClick={handleClick}
              aria-label={isUsed ? "取消使用" : "标记使用"}
            >
              {isUsed ? "✓" : ""}
            </button>
          </div>
        ) : (
          <div className="benefit-card__prompt" role="group">
            <div className="benefit-card__prompt-fields">
              <label className="benefit-card__prompt-label">
                实际到手
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pendingValue}
                  onChange={(e) => { setPendingValue(e.target.value); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleConfirm();
                    if (e.key === "Escape") handleCancel();
                  }}
                  aria-label="实际到手"
                  autoFocus
                  className="benefit-card__prompt-input"
                />
              </label>
              <label className="benefit-card__prompt-label">
                {dateRequired ? "使用日期*" : "使用日期"}
                <input
                  type="date"
                  value={pendingDate}
                  onChange={(e) => { setPendingDate(e.target.value); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleConfirm();
                    if (e.key === "Escape") handleCancel();
                  }}
                  aria-label="使用日期"
                  required={dateRequired}
                  className="benefit-card__prompt-input benefit-card__prompt-input--date"
                />
              </label>
              {monthlyLike && (
                <label className="benefit-card__prompt-label benefit-card__prompt-label--checkbox">
                  <input
                    type="checkbox"
                    checked={pendingPropagate}
                    onChange={(e) => { setPendingPropagate(e.target.checked); }}
                    aria-label="自动续期下月"
                  />
                  自动续期下月
                </label>
              )}
            </div>
            {editMode === "edit" && cycleContext && onSetCycleUsed && (
              <button
                className="benefit-card__action-btn benefit-card__action-btn--danger"
                onClick={handleDelete}
                aria-label="删除记录"
                title="删除记录"
              >
                ✕
              </button>
            )}
            <button
              className="benefit-card__action-btn benefit-card__action-btn--confirm"
              onClick={handleConfirm}
              aria-label="确认"
              title="确认"
            >
              ✓
            </button>
            <button
              className="benefit-card__action-btn"
              onClick={handleCancel}
              aria-label="取消"
              title="取消"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </GlassContainer>
  );
};
