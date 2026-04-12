import { useCardStore } from "../../stores/useCardStore";
import { useCardTypeStore } from "../../stores/useCardTypeStore";
import "./TrayViews.css";
import {
  getDeadline,
  getDaysRemaining,
  isBenefitUsedInPeriod,
  isApplicableNow,
} from "../../utils/period";
import { CardChip } from "../shared/CardChip";
import { BenefitCard } from "../shared/BenefitCard";

export const ByUrgencyView = () => {
  const cards = useCardStore((s) => s.cards);
  const toggleBenefitUsage = useCardStore((s) => s.toggleBenefitUsage);
  const getCardImage = useCardTypeStore((s) => s.getCardImage);
  const today = new Date();

  // Collect all unused, non-hidden, applicable benefits across enabled cards
  const items: Array<{ cardId: string; benefitId: string; daysRemaining: number | null }> = [];

  for (const card of cards) {
    if (!card.isEnabled) continue;
    for (const benefit of card.benefits) {
      if (benefit.isHidden) continue;
      if (!isApplicableNow(benefit, today)) continue;
      if (isBenefitUsedInPeriod(benefit, today, card.cardOpenDate)) continue;
      // Skip auto-recur subscriptions (they're handled automatically)
      if (benefit.resetType === "subscription" && benefit.autoRecur) continue;

      const deadline = getDeadline(today, {
        resetType: benefit.resetType,
        resetConfig: benefit.resetConfig,
        cardOpenDate: card.cardOpenDate,
        autoRecur: benefit.autoRecur,
      });
      const daysRemaining = deadline ? getDaysRemaining(today, deadline) : null;

      items.push({ cardId: card.id, benefitId: benefit.id, daysRemaining });
    }
  }

  // Sort by daysRemaining ascending (null = no deadline → least urgent, shown last)
  items.sort((a, b) => {
    if (a.daysRemaining === null && b.daysRemaining === null) return 0;
    if (a.daysRemaining === null) return 1;
    if (b.daysRemaining === null) return -1;
    return a.daysRemaining - b.daysRemaining;
  });

  if (items.length === 0) {
    return <p className="by-urgency-view__empty">暂无待使用权益</p>;
  }

  return (
    <div className="by-urgency-view">
      {items.map(({ cardId, benefitId }) => {
        const card = cards.find((c) => c.id === cardId);
        if (!card) return null;
        const benefit = card.benefits.find((b) => b.id === benefitId);
        if (!benefit) return null;

        return (
          <div key={`${cardId}-${benefitId}`} className="by-urgency-view__item">
            <div className="by-urgency-view__source">
              {getCardImage(card.cardTypeSlug) ? (
                <img
                  src={getCardImage(card.cardTypeSlug)}
                  alt=""
                  className="by-urgency-view__card-img"
                />
              ) : (
                <CardChip color={card.color} size="small" />
              )}
            </div>
            <BenefitCard
              benefit={benefit}
              card={card}
              onToggleUsage={toggleBenefitUsage}
              compact
            />
          </div>
        );
      })}
    </div>
  );
};
