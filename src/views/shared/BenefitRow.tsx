import type { Benefit, CreditCard } from "../../models/types";
import { getCardDisplayName } from "../../models/types";
import {
  getDeadline,
  getDaysRemaining,
  getConsumedInPeriod,
  isBenefitUsedInPeriod,
} from "../../utils/period";
import { getAvailableValue } from "../../utils/rollover";
import { useCardStore } from "../../stores/useCardStore";
import { useCardTypeStore } from "../../stores/useCardTypeStore";
import { useToday } from "../../stores/useToday";
import "./BenefitRow.css";

interface BenefitRowProps {
  benefit: Benefit;
  card: CreditCard;
  /** Quick-use action: marks benefit used at full face / remaining value. */
  onToggle: (cardId: string, benefitId: string, actualValue: number, usedDate: string) => void;
  /** Show the card-tag line under the name. Default true (urgency view);
   *  the by-card view sets this to false because the enclosing group already
   *  names the card. */
  showCardTag?: boolean;
}

const formatDeadlineShort = (days: number): string => {
  if (days <= 30) return `${String(days)} 天`;
  const months = Math.round(days / 30);
  return `${String(months)} 个月`;
};

const pad = (n: number): string => (n < 10 ? `0${String(n)}` : String(n));
const toIso = (d: Date): string =>
  `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const BenefitRow = ({ benefit, card, onToggle, showCardTag = true }: BenefitRowProps) => {
  const today = useToday();
  const reminderDays = useCardStore((s) => s.settings.reminderDays);
  const getCardType = useCardTypeStore((s) => s.getCardType);

  const isUsed = isBenefitUsedInPeriod(benefit, today, card.cardOpenDate);

  const deadline = getDeadline(today, {
    resetType: benefit.resetType,
    resetConfig: benefit.resetConfig,
    cardOpenDate: card.cardOpenDate,
  });
  const daysRemaining = deadline ? getDaysRemaining(today, deadline) : null;
  const isUrgent =
    !isUsed && daysRemaining !== null && daysRemaining <= reminderDays;

  const availableValue = getAvailableValue(benefit, today);
  const consumed = getConsumedInPeriod(benefit, today, card.cardOpenDate);
  const totalFace = benefit.faceValue;
  const partial = consumed > 0 && consumed < totalFace;

  const amountText = totalFace > 0
    ? partial
      ? `$${String(Math.round(consumed))} of $${String(Math.round(totalFace))}`
      : `$${String(Math.round(totalFace))}`
    : "";

  const handleToggle = () => {
    if (isUsed) return;
    onToggle(card.id, benefit.id, availableValue, toIso(today));
  };

  const rowClasses = [
    "benefit-row",
    isUsed ? "benefit-row--used" : "",
    isUrgent ? "benefit-row--urgent" : "",
  ].filter(Boolean).join(" ");

  const dotClass = isUrgent ? "benefit-row__dot--urgent" : "benefit-row__dot--ok";
  const cardName = getCardDisplayName(card, getCardType(card.cardTypeSlug)?.name);

  return (
    <div className={rowClasses}>
      <label className="benefit-row__check-wrap">
        <input
          type="checkbox"
          className="benefit-row__checkbox"
          checked={isUsed}
          onChange={handleToggle}
          aria-label={isUsed ? "已使用" : "标记使用"}
        />
      </label>
      <div className="benefit-row__body">
        <span
          className={`benefit-row__name${isUsed ? " benefit-row__name--used" : ""}`}
        >
          {benefit.name}
        </span>
        <div className="benefit-row__meta">
          {showCardTag && (
            <span className="benefit-row__card-tag">
              <span
                className="benefit-row__card-swatch"
                style={{ backgroundColor: card.color }}
                aria-hidden="true"
              />
              <span className="benefit-row__card-name">{cardName}</span>
            </span>
          )}
          {daysRemaining !== null && !isUsed && (
            <span className="benefit-row__deadline">
              <span
                className={`benefit-row__dot ${dotClass}`}
                aria-hidden="true"
              />
              {formatDeadlineShort(daysRemaining)}
            </span>
          )}
        </div>
      </div>
      {amountText && <span className="benefit-row__amount">{amountText}</span>}
    </div>
  );
};
