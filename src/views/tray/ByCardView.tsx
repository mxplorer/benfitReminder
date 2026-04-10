import { useCardStore } from "../../stores/useCardStore";
import "./TrayViews.css";
import { getCardDisplayName } from "../../models/types";
import { isApplicableNow } from "../../utils/period";
import { CardChip } from "../shared/CardChip";
import { BenefitCard } from "../shared/BenefitCard";

export const ByCardView = () => {
  const cards = useCardStore((s) => s.cards);
  const toggleBenefitUsage = useCardStore((s) => s.toggleBenefitUsage);
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
              <CardChip color={card.color} size="small" />
              <span className="by-card-view__card-name">{getCardDisplayName(card)}</span>
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
