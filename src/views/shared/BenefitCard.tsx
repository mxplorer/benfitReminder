import type { Benefit, CreditCard } from "../../models/types";
import { getDeadline, getDaysRemaining, isBenefitUsedInPeriod } from "../../utils/period";
import { GlassContainer } from "./GlassContainer";
import { StatusTag } from "./StatusTag";

interface BenefitCardProps {
  benefit: Benefit;
  card: CreditCard;
  onToggleUsage: (cardId: string, benefitId: string) => void;
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

export const BenefitCard = ({ benefit, card, onToggleUsage, compact = false }: BenefitCardProps) => {
  const today = new Date();
  const isUsed = isBenefitUsedInPeriod(benefit, today, card.cardOpenDate);

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
    onToggleUsage(card.id, benefit.id);
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
        <button
          className={`benefit-card__check-btn ${isUsed ? "benefit-card__check-btn--checked" : ""}`}
          onClick={handleClick}
          aria-label={isUsed ? "取消使用" : "标记使用"}
        >
          {isUsed ? "✓" : ""}
        </button>
      </div>
    </GlassContainer>
  );
};
