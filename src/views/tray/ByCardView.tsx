import { useCardStore } from "../../stores/useCardStore";
import { useCardTypeStore } from "../../stores/useCardTypeStore";
import { useToday } from "../../stores/useToday";
import { getCardDisplayName } from "../../models/types";
import { expandBenefitsForFilter } from "../../utils/benefitDisplay";
import { CardChip } from "../shared/CardChip";
import { AggregatedBenefitCard } from "../shared/AggregatedBenefitCard";
import { BenefitRow } from "../shared/BenefitRow";
import "./TrayViews.css";

export const ByCardView = () => {
  const cards = useCardStore((s) => s.cards);
  const toggleBenefitUsage = useCardStore((s) => s.toggleBenefitUsage);
  const setBenefitCycleUsed = useCardStore((s) => s.setBenefitCycleUsed);
  const getCardImage = useCardTypeStore((s) => s.getCardImage);
  const getCardType = useCardTypeStore((s) => s.getCardType);
  const today = useToday();

  const enabledCards = cards.filter((c) => c.isEnabled);

  return (
    <div className="by-card-view">
      {enabledCards.map((card) => {
        const items = expandBenefitsForFilter(card, "available", today, "calendar");
        if (items.length === 0) return null;

        const unusedCount = items.filter(
          (i) => i.variant === "standard" || i.cycleUsed === false,
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
              <span className="by-card-view__card-name">
                {getCardDisplayName(card, getCardType(card.cardTypeSlug)?.name)}
              </span>
              {unusedCount > 0 && (
                <span className="by-card-view__unused-badge">{unusedCount}</span>
              )}
            </div>
            <div className="by-card-view__rows">
              {items.map((item) => {
                if (item.variant === "aggregated") {
                  return (
                    <AggregatedBenefitCard
                      key={item.key}
                      item={item}
                      onToggleUsage={toggleBenefitUsage}
                      onSetCycleUsed={setBenefitCycleUsed}
                    />
                  );
                }
                return (
                  <BenefitRow
                    key={item.key}
                    benefit={item.benefit}
                    card={item.card}
                    onToggle={toggleBenefitUsage}
                    showCardTag={false}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
