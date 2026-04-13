import { useState } from "react";
import type { Benefit, CreditCard } from "../../models/types";
import { getDeadline, getDaysRemaining, isBenefitUsedInPeriod } from "../../utils/period";
import { GlassContainer } from "./GlassContainer";
import { StatusTag } from "./StatusTag";

interface BenefitCardProps {
  benefit: Benefit;
  card: CreditCard;
  onToggleUsage: (cardId: string, benefitId: string, actualValue?: number) => void;
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

export const BenefitCard = ({ benefit, card, onToggleUsage, onToggleHidden, onDelete, compact = false }: BenefitCardProps) => {
  const today = new Date();
  const isUsed = isBenefitUsedInPeriod(benefit, today, card.cardOpenDate);
  // When not-yet-used benefit is clicked we open an inline prompt so the user
  // can record the *actual* amount redeemed (may differ from faceValue).
  const [pendingValue, setPendingValue] = useState<string | null>(null);

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
  };

  const handleConfirm = () => {
    if (pendingValue === null) return;
    const value = Number(pendingValue);
    if (isNaN(value) || value < 0) return;
    onToggleUsage(card.id, benefit.id, value);
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
      </div>
      <span className={`benefit-card__name ${isUsed ? "benefit-card__name--used" : ""}`}>
        {benefit.name}
      </span>
      {!compact && benefit.description && (
        <span className="benefit-card__description">{benefit.description}</span>
      )}
      <div className="benefit-card__footer">
        <span className="benefit-card__value">
          {benefit.faceValue > 0 ? `$${String(benefit.faceValue)}` : "—"}
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
