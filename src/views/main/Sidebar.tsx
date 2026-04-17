import { useCardStore } from "../../stores/useCardStore";
import { useCardTypeStore } from "../../stores/useCardTypeStore";
import { useToday } from "../../stores/useToday";
import { getCardDisplayName } from "../../models/types";
import { CardChip } from "../shared/CardChip";
import { isBenefitUsedInPeriod, isInCurrentCycle, getDeadline, getDaysRemaining } from "../../utils/period";
import { latestHasPropagate } from "../../utils/usageRecords";
import type { ActiveView } from "./MainWindow";

interface SidebarProps {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
}

export const Sidebar = ({ activeView, onNavigate }: SidebarProps) => {
  const cards = useCardStore((s) => s.cards);
  const getCardImage = useCardTypeStore((s) => s.getCardImage);
  const getCardType = useCardTypeStore((s) => s.getCardType);
  const reminderDays = useCardStore((s) => s.settings.reminderDays);
  const today = useToday();

  const enabledCards = cards.filter((c) => c.isEnabled);

  const getUnusedInfo = (card: (typeof enabledCards)[0]): { count: number; minDays: number | null } => {
    let count = 0;
    let minDays: number | null = null;
    for (const benefit of card.benefits) {
      if (benefit.isHidden) continue;
      if (benefit.resetType === "subscription" && latestHasPropagate(benefit)) continue;
      if (!isInCurrentCycle(benefit, today)) continue;
      if (isBenefitUsedInPeriod(benefit, today, card.cardOpenDate)) continue;
      count++;
      const deadline = getDeadline(today, {
        resetType: benefit.resetType,
        resetConfig: benefit.resetConfig,
        cardOpenDate: card.cardOpenDate,
      });
      if (deadline) {
        const days = getDaysRemaining(today, deadline);
        if (minDays === null || days < minDays) minDays = days;
      }
    }
    return { count, minDays };
  };

  const getBadgeClass = (minDays: number | null): string => {
    if (minDays !== null && minDays <= reminderDays) return "sidebar__card-badge--danger";
    return "sidebar__card-badge--warning";
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
          const { count: unusedCount, minDays } = getUnusedInfo(card);
          const badgeClass = getBadgeClass(minDays);
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
                <span className={`sidebar__card-badge ${badgeClass}`}>{unusedCount}</span>
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
