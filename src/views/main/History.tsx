import { useState } from "react";
import { useCardStore } from "../../stores/useCardStore";
import { useCardTypeStore } from "../../stores/useCardTypeStore";
import { getCardDisplayName } from "../../models/types";
import { calculateCardROI } from "../../utils/roi";
import { GlassContainer } from "../shared/GlassContainer";
import { CardChip } from "../shared/CardChip";
import "./History.css";

export const History = () => {
  const cards = useCardStore((s) => s.cards);
  const getCardType = useCardTypeStore((s) => s.getCardType);
  const today = new Date();
  // yearOffset per card: 0 = current membership year, -1 = previous, -2 = two years ago
  const [offsets, setOffsets] = useState<Record<string, number>>({});

  const enabledCards = cards.filter((c) => c.isEnabled);

  const setOffset = (cardId: string, offset: number) => {
    setOffsets((prev) => ({ ...prev, [cardId]: offset }));
  };

  const YEAR_OFFSETS = [0, -1, -2];

  return (
    <div className="history" data-testid="history">
      <div className="history__cards">
        {enabledCards.map((card) => {
          const offset = offsets[card.id] ?? 0;
          const roi = calculateCardROI(card, today, offset);

          return (
            <GlassContainer key={card.id} className="history__card-section">
              <div className="history__card-header">
                <CardChip color={card.color} size="small" />
                <span className="history__card-name">{getCardDisplayName(card, getCardType(card.cardTypeSlug)?.name)}</span>
                <div className="history__year-selector">
                  {YEAR_OFFSETS.map((o) => {
                    // Compute the calendar year label for this offset's membership year start
                    const approxYear = today.getFullYear() + o;
                    return (
                      <button
                        key={o}
                        className={`history__year-btn${offset === o ? " history__year-btn--active" : ""}`}
                        onClick={() => { setOffset(card.id, o); }}
                      >
                        {approxYear}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="history__roi-row">
                <span>年费: ${String(roi.annualFee)}</span>
                <span>面值: ${String(roi.faceValueReturn)}</span>
                <span>实际: ${String(roi.actualReturn)}</span>
                <span>回本率: {roi.roiPercent}%</span>
              </div>
            </GlassContainer>
          );
        })}
        {enabledCards.length === 0 && (
          <p className="history__empty">暂无启用的卡片</p>
        )}
      </div>
    </div>
  );
};
