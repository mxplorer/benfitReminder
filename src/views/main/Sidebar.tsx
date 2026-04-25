import { useEffect, useMemo, useCallback } from "react";
import { useCardStore } from "../../stores/useCardStore";
import { useCardTypeStore } from "../../stores/useCardTypeStore";
import { useToday } from "../../stores/useToday";
import { getCardDisplayName } from "../../models/types";
import type { CreditCard } from "../../models/types";
import { CardChip } from "../shared/CardChip";
import {
  isApplicableNow,
  isBenefitUsedInPeriod,
  getDeadline,
  getDaysRemaining,
} from "../../utils/period";
import type { ActiveView } from "./MainWindow";
import "./Sidebar.css";

interface SidebarProps {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
}

const SidebarIconDefs = () => (
  <svg className="sidebar__svg-defs" aria-hidden="true">
    <defs>
      <symbol id="sb-i-dashboard" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
      </symbol>
      <symbol id="sb-i-history" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2.5" />
      </symbol>
      <symbol id="sb-i-settings" viewBox="0 0 24 24">
        <path d="M3 6h4M11 6h10" />
        <circle cx="9" cy="6" r="2" />
        <path d="M3 12h10M17 12h4" />
        <circle cx="15" cy="12" r="2" />
        <path d="M3 18h6M13 18h8" />
        <circle cx="11" cy="18" r="2" />
      </symbol>
      <symbol id="sb-i-cards" viewBox="0 0 24 24">
        <rect
          x="3"
          y="8.5"
          width="12"
          height="8"
          rx="1.8"
          transform="rotate(-14 9 12.5)"
          opacity="0.4"
        />
        <rect x="6" y="7" width="12" height="8" rx="1.8" opacity="0.7" />
        <rect
          x="9"
          y="5.5"
          width="12"
          height="8"
          rx="1.8"
          transform="rotate(14 15 9.5)"
        />
      </symbol>
      <symbol id="sb-i-plus" viewBox="0 0 24 24">
        <path d="M12 5v14M5 12h14" />
      </symbol>
    </defs>
  </svg>
);

interface IconProps {
  id: "dashboard" | "history" | "settings" | "cards" | "plus";
  size?: number;
}

const Icon = ({ id, size = 18 }: IconProps) => (
  <svg
    width={size}
    height={size}
    className="sidebar__icon"
    aria-hidden="true"
  >
    <use href={`#sb-i-${id}`} />
  </svg>
);

interface EdgeTriggerProps {
  collapsed: boolean;
  onToggle: () => void;
}

const EdgeTrigger = ({ collapsed, onToggle }: EdgeTriggerProps) => (
  <button
    type="button"
    className="sidebar__edge"
    onClick={onToggle}
    aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
  >
    <span className="sidebar__edge-bar" />
    <span className="sidebar__edge-band" />
    <span className="sidebar__edge-halo" />
  </button>
);

interface UnusedInfo {
  count: number;
  minDays: number | null;
}

const computeCardUnusedInfo = (
  card: CreditCard,
  today: Date,
): UnusedInfo => {
  let count = 0;
  let minDays: number | null = null;
  for (const benefit of card.benefits) {
    if (benefit.isHidden) continue;
    if (!isApplicableNow(benefit, today)) continue;
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

const badgeClassFromMinDays = (
  minDays: number | null,
  reminderDays: number,
): string =>
  minDays !== null && minDays <= reminderDays
    ? "sidebar__card-badge--danger"
    : "sidebar__card-badge--warning";

export const Sidebar = ({ activeView, onNavigate }: SidebarProps) => {
  const cards = useCardStore((s) => s.cards);
  const getCardImage = useCardTypeStore((s) => s.getCardImage);
  const getCardType = useCardTypeStore((s) => s.getCardType);
  const reminderDays = useCardStore((s) => s.settings.reminderDays);
  const collapsed = useCardStore((s) => s.settings.sidebarCollapsed);
  const updateSettings = useCardStore((s) => s.updateSettings);
  const today = useToday();

  const enabledCards = useMemo(
    () => cards.filter((c) => c.isEnabled),
    [cards],
  );

  const totalUnused = useMemo(() => {
    let sum = 0;
    for (const card of enabledCards) {
      sum += computeCardUnusedInfo(card, today).count;
    }
    return sum;
  }, [enabledCards, today]);

  const isNavActive = (view: ActiveView) =>
    typeof activeView === "string" && activeView === view;

  const isCardViewActive =
    typeof activeView === "object" && "cardId" in activeView;

  const isCardActive = (cardId: string) =>
    typeof activeView === "object" &&
    "cardId" in activeView &&
    activeView.cardId === cardId;

  const toggleCollapsed = useCallback(() => {
    updateSettings({ sidebarCollapsed: !collapsed });
  }, [collapsed, updateSettings]);

  // ⌘B / Ctrl+B toggles the sidebar from anywhere in the main window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, [toggleCollapsed]);

  return (
    <nav
      className="sidebar"
      data-state={collapsed ? "collapsed" : "expanded"}
    >
      <SidebarIconDefs />
      <div className="sidebar__aurora-wrap" aria-hidden="true">
        <div className="sidebar__aurora sidebar__aurora--top" />
        <div className="sidebar__aurora sidebar__aurora--bottom" />
      </div>

      {collapsed ? (
        <div className="sidebar__rail">
          <button
            type="button"
            className={`sidebar__rail-icon${isNavActive("dashboard") ? " sidebar__rail-icon--active" : ""}`}
            data-tip="概览"
            onClick={() => { onNavigate("dashboard"); }}
            aria-label="概览"
          >
            <Icon id="dashboard" />
            <span className="sidebar__rail-tip-arrow" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`sidebar__rail-icon${isNavActive("history") ? " sidebar__rail-icon--active" : ""}`}
            data-tip="历史记录"
            onClick={() => { onNavigate("history"); }}
            aria-label="历史记录"
          >
            <Icon id="history" />
            <span className="sidebar__rail-tip-arrow" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`sidebar__rail-icon${isNavActive("settings") ? " sidebar__rail-icon--active" : ""}`}
            data-tip="设置"
            onClick={() => { onNavigate("settings"); }}
            aria-label="设置"
          >
            <Icon id="settings" />
            <span className="sidebar__rail-tip-arrow" aria-hidden="true" />
          </button>

          <div className="sidebar__rail-sep" />

          <button
            type="button"
            className={`sidebar__rail-icon${isCardViewActive ? " sidebar__rail-icon--active" : ""}`}
            data-tip="我的卡片"
            onClick={() => { updateSettings({ sidebarCollapsed: false }); }}
            aria-label="我的卡片"
          >
            <Icon id="cards" size={20} />
            {totalUnused > 0 && (
              <span className="sidebar__total-badge">{String(totalUnused)}</span>
            )}
            <span className="sidebar__rail-tip-arrow" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="sidebar__rail-icon sidebar__rail-icon--plus"
            data-tip="添加卡片"
            onClick={() => { onNavigate({ type: "card-editor" }); }}
            aria-label="添加卡片"
          >
            <Icon id="plus" />
            <span className="sidebar__rail-tip-arrow" aria-hidden="true" />
          </button>

          <div className="sidebar__rail-spacer" />
        </div>
      ) : (
        <div className="sidebar__inner">
          <div className="sidebar__nav">
            <button
              type="button"
              className={`sidebar__nav-item${isNavActive("dashboard") ? " sidebar__nav-item--active" : ""}`}
              onClick={() => { onNavigate("dashboard"); }}
            >
              <Icon id="dashboard" />
              <span className="sidebar__nav-label">概览</span>
              <span />
            </button>
            <button
              type="button"
              className={`sidebar__nav-item${isNavActive("history") ? " sidebar__nav-item--active" : ""}`}
              onClick={() => { onNavigate("history"); }}
            >
              <Icon id="history" />
              <span className="sidebar__nav-label">历史记录</span>
              <span />
            </button>
            <button
              type="button"
              className={`sidebar__nav-item${isNavActive("settings") ? " sidebar__nav-item--active" : ""}`}
              onClick={() => { onNavigate("settings"); }}
            >
              <Icon id="settings" />
              <span className="sidebar__nav-label">设置</span>
              <span />
            </button>
          </div>

          <div className="sidebar__divider" />
          <span className="sidebar__section-title">我的卡片</span>

          <div className="sidebar__cards-list">
            {enabledCards.map((card) => {
              const { count: unusedCount, minDays } = computeCardUnusedInfo(
                card,
                today,
              );
              const badgeClass = badgeClassFromMinDays(minDays, reminderDays);
              const cardImage = getCardImage(card.cardTypeSlug);
              const typeName = getCardType(card.cardTypeSlug)?.name;
              const displayName = getCardDisplayName(card, typeName);
              return (
                <button
                  type="button"
                  key={card.id}
                  className={`sidebar__card-item${isCardActive(card.id) ? " sidebar__card-item--active" : ""}`}
                  onClick={() => {
                    onNavigate({ type: "card", cardId: card.id });
                  }}
                >
                  {cardImage ? (
                    <img
                      src={cardImage}
                      alt={displayName}
                      className="sidebar__card-img"
                    />
                  ) : (
                    <span className="sidebar__card-chip-slot">
                      <CardChip color={card.color} size="small" />
                    </span>
                  )}
                  <span className="sidebar__card-name">{displayName}</span>
                  {unusedCount > 0 ? (
                    <span className={`sidebar__card-badge ${badgeClass}`}>
                      {String(unusedCount)}
                    </span>
                  ) : (
                    <span />
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="sidebar__add-card-btn"
            onClick={() => { onNavigate({ type: "card-editor" }); }}
          >
            <Icon id="plus" />
            <span>添加卡片</span>
          </button>
        </div>
      )}

      <EdgeTrigger collapsed={collapsed} onToggle={toggleCollapsed} />
    </nav>
  );
};
