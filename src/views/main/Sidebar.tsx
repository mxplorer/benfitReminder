import { useCardStore } from "../../stores/useCardStore";
import { useCardTypeStore } from "../../stores/useCardTypeStore";
import { getCardDisplayName } from "../../models/types";
import { CardChip } from "../shared/CardChip";
import { isBenefitUsedInPeriod, isApplicableNow } from "../../utils/period";
import type { ActiveView } from "./MainWindow";

interface SidebarProps {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
}

export const Sidebar = ({ activeView, onNavigate }: SidebarProps) => {
  const cards = useCardStore((s) => s.cards);
  const getCardImage = useCardTypeStore((s) => s.getCardImage);
  const getCardType = useCardTypeStore((s) => s.getCardType);
  const today = new Date();

  const enabledCards = cards.filter((c) => c.isEnabled);

  const getUnusedCount = (card: (typeof enabledCards)[0]): number => {
    let count = 0;
    for (const benefit of card.benefits) {
      if (benefit.isHidden) continue;
      if (benefit.resetType === "subscription" && benefit.autoRecur) continue;
      if (!isApplicableNow(benefit, today)) continue;
      if (isBenefitUsedInPeriod(benefit, today, card.cardOpenDate)) continue;
      count++;
    }
    return count;
  };

  const isNavActive = (view: ActiveView) =>
    typeof activeView === "string" && activeView === view;

  const isCardActive = (cardId: string) =>
    typeof activeView === "object" && "cardId" in activeView && activeView.cardId === cardId;

  return (
    <nav className="sidebar">
      <div className="sidebar__nav">
        <button
          className={`sidebar__nav-item${isNavActive("dashboard") ? " sidebar__nav-item--active" : ""}`}
          onClick={() => { onNavigate("dashboard"); }}
        >
          Dashboard
        </button>
        <button
          className={`sidebar__nav-item${isNavActive("history") ? " sidebar__nav-item--active" : ""}`}
          onClick={() => { onNavigate("history"); }}
        >
          历史记录
        </button>
        <button
          className={`sidebar__nav-item${isNavActive("settings") ? " sidebar__nav-item--active" : ""}`}
          onClick={() => { onNavigate("settings"); }}
        >
          设置
        </button>
      </div>

      <div className="sidebar__divider" />
      <span className="sidebar__section-title">我的卡片</span>
      <div className="sidebar__nav" style={{ marginBottom: 0 }}>
        {enabledCards.map((card) => {
          const unusedCount = getUnusedCount(card);
          return (
            <button
              key={card.id}
              className={`sidebar__card-item${isCardActive(card.id) ? " sidebar__card-item--active" : ""}`}
              onClick={() => { onNavigate({ type: "card", cardId: card.id }); }}
            >
              {getCardImage(card.cardTypeSlug) ? (
                <img
                  src={getCardImage(card.cardTypeSlug)}
                  alt={getCardDisplayName(card, getCardType(card.cardTypeSlug)?.name)}
                  className="sidebar__card-img"
                />
              ) : (
                <CardChip color={card.color} size="small" />
              )}
              <span className="sidebar__card-name">{getCardDisplayName(card, getCardType(card.cardTypeSlug)?.name)}</span>
              {unusedCount > 0 && (
                <span className="sidebar__card-badge">{unusedCount}</span>
              )}
            </button>
          );
        })}
        <button
          className="sidebar__add-card-btn"
          onClick={() => { onNavigate({ type: "card-editor" }); }}
        >
          + 添加卡片
        </button>
      </div>
    </nav>
  );
};
