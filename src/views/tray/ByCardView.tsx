import { useCardStore } from "../../stores/useCardStore";
import { useCardTypeStore } from "../../stores/useCardTypeStore";
import "./TrayViews.css";
import { getCardDisplayName } from "../../models/types";
import { isApplicableNow } from "../../utils/period";
import { CardChip } from "../shared/CardChip";
import { BenefitCard } from "../shared/BenefitCard";

export const ByCardView = () => {
  const cards = useCardStore((s) => s.cards);
  const toggleBenefitUsage = useCardStore((s) => s.toggleBenefitUsage);
  const getCardImage = useCardTypeStore((s) => s.getCardImage);
  const getCardType = useCardTypeStore((s) => s.getCardType);
  const today = new Date();

  const enabledCards = cards.filter((c) => c.isEnabled);

  return (
    <div className="by-card-view">
      {enabledCards.map((card) => {
        const visibleBenefits = card.benefits.filter(
          (b) => !b.isHidden && isApplicableNow(b, today),
        );
        if (visibleBenefits.length === 0) return null;

        const unusedCount = visibleBenefits.filter(
          (b) => !(b.resetType === "subscription" && b.autoRecur),
        ).length;

        return (
          <div key={card.id} className="by-card-view__group">
            <div className="by-card-view__group-header">
              {getCardImage(card.cardTypeSlug) ? (
                <img
                  src={getCardImage(card.cardTypeSlug)}
                  alt={getCardDisplayName(card, getCardType(card.cardTypeSlug)?.name)}
                  className="by-card-view__card-img"
                />
              ) : (
                <CardChip color={card.color} size="small" />
              )}
              <span className="by-card-view__card-name">{getCardDisplayName(card, getCardType(card.cardTypeSlug)?.name)}</span>
              {unusedCount > 0 && (
                <span className="by-card-view__unused-badge">{unusedCount}</span>
              )}
            </div>
            <div className="by-card-view__grid">
              {visibleBenefits.map((benefit) => (
                <BenefitCard
                  key={benefit.id}
                  benefit={benefit}
                  card={card}
                  onToggleUsage={toggleBenefitUsage}
                  compact
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
