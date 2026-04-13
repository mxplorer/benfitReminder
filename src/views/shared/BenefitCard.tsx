import { useState } from "react";
import type { Benefit, CreditCard, ResetType } from "../../models/types";
import { formatDate, getDeadline, getDaysRemaining, isBenefitUsedInPeriod } from "../../utils/period";
import { getAvailableValue } from "../../utils/rollover";
import { GlassContainer } from "./GlassContainer";
import { StatusTag } from "./StatusTag";

/** Reset types where the refresh date depends on when the benefit was used. */
const DATE_REQUIRED_RESET_TYPES: ReadonlySet<ResetType> = new Set(["anniversary", "since_last_use"]);

interface BenefitCardProps {
  benefit: Benefit;
  card: CreditCard;
  onToggleUsage: (cardId: string, benefitId: string, actualValue?: number, usedDate?: string) => void;
  onRollover?: (cardId: string, benefitId: string) => void;
  onToggleHidden?: (cardId: string, benefitId: string) => void;
  onDelete?: (cardId: string, benefitId: string) => void;
  compact?: boolean;
}

const PERIOD_LABELS: Record<string, string> = {
  monthly: "每月",
  quarterly: "每季度",
  semi_annual: "半年",
  annual: "每年",
  every_4_years: "每4年",
};

const getResetLabel = (benefit: Benefit): string => {
  if (benefit.resetType === "subscription") return benefit.autoRecur ? "订阅·自动" : "订阅";
  if (benefit.resetType === "anniversary") return "周年";
  if (benefit.resetType === "since_last_use") return "按使用";
  if (benefit.resetType === "one_time") return "一次性";
  return PERIOD_LABELS[benefit.resetConfig.period ?? ""] ?? "";
};

export const BenefitCard = ({ benefit, card, onToggleUsage, onRollover, onToggleHidden, onDelete, compact = false }: BenefitCardProps) => {
  const today = new Date();
  const isUsed = isBenefitUsedInPeriod(benefit, today, card.cardOpenDate);
  const availableValue = getAvailableValue(benefit, today);
  // When not-yet-used benefit is clicked we open an inline prompt so the user
  // can record the *actual* amount redeemed (may differ from faceValue).
  const [pendingValue, setPendingValue] = useState<string | null>(null);
  const [pendingDate, setPendingDate] = useState<string>(formatDate(today));
  const dateRequired = DATE_REQUIRED_RESET_TYPES.has(benefit.resetType);

  const deadline = getDeadline(today, {
    resetType: benefit.resetType,
    resetConfig: benefit.resetConfig,
    cardOpenDate: card.cardOpenDate,
    autoRecur: benefit.autoRecur,
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
      onToggleUsage(card.id, benefit.id);
      return;
    }
    setPendingValue(String(benefit.faceValue));
    setPendingDate(formatDate(today));
  };

  const handleConfirm = () => {
    if (pendingValue === null) return;
    const value = Number(pendingValue);
    if (isNaN(value) || value < 0) return;
    if (dateRequired && !pendingDate) return;
    onToggleUsage(card.id, benefit.id, value, pendingDate || undefined);
    setPendingValue(null);
  };

  const handleCancel = () => {
    setPendingValue(null);
  };

  return (
    <GlassContainer className={`benefit-card ${cardClasses}`}>
      <div className="benefit-card__header">
        <StatusTag daysRemaining={daysRemaining} isUsed={isUsed} />
        <span className="benefit-card__period">{getResetLabel(benefit)}</span>
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
        <span className="benefit-card__value">
          {availableValue > 0 ? `$${String(availableValue)}` : "—"}
        </span>
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
            {onDelete && (
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
            {onRollover && benefit.rolloverable && !isUsed && (
              <button
                className="benefit-card__action-btn benefit-card__rollover-btn"
                onClick={() => { onRollover(card.id, benefit.id); }}
                aria-label="Rollover"
                title="Rollover"
              >
                ↗
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
            </div>
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
