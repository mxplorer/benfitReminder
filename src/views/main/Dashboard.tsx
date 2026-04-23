import { useEffect, useMemo, useRef, useState } from "react";
import { useCardStore } from "../../stores/useCardStore";
import { useCardTypeStore } from "../../stores/useCardTypeStore";
import { useToday } from "../../stores/useToday";
import type { CreditCard } from "../../models/types";
import { calculateDashboardROI } from "../../utils/roi";
import {
  getDaysRemaining,
  getDeadline,
  isApplicableNow,
  isBenefitUsedInPeriod,
} from "../../utils/period";
import { getAvailableValue } from "../../utils/rollover";
import { CardChip } from "../shared/CardChip";
import type { ActiveView } from "./MainWindow";
import "./Dashboard.css";

interface DashboardProps {
  onNavigate?: (view: ActiveView) => void;
}

const formatMoney = (n: number): string =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const formatMoneyDigits = (n: number): string =>
  n.toLocaleString("en-US", { maximumFractionDigits: 0 });

const MONTH_NAMES = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];
const QUARTER_LABELS = ["Q1", "Q1", "Q1", "Q2", "Q2", "Q2", "Q3", "Q3", "Q3", "Q4", "Q4", "Q4"];
const HALF_LABELS = ["H1", "H1", "H1", "H1", "H1", "H1", "H2", "H2", "H2", "H2", "H2", "H2"];

type TileStatus = "recovered" | "warning" | "danger";

type SortKey = "issuer" | "cardType" | "owner" | "effectiveFee" | "unused";

const SORT_LABELS: Record<SortKey, string> = {
  issuer: "发卡行",
  cardType: "卡片类型",
  owner: "持卡人",
  effectiveFee: "等效年费",
  unused: "待使用",
};

const classifyTile = (actual: number, fee: number): TileStatus => {
  if (fee <= 0) return "recovered";
  if (actual >= fee) return "recovered";
  if (actual >= 0.8 * fee) return "warning";
  return "danger";
};

// Prefer alias; fall back to last-4 only (no card-name prefix); else type name.
const getTileName = (card: CreditCard, typeName: string): string => {
  if (card.alias) return card.alias;
  if (card.cardNumber && card.cardNumber.length >= 4) {
    return card.cardNumber.slice(-4);
  }
  if (card.customName) return card.customName;
  return typeName || "Unknown Card";
};

export const Dashboard = ({ onNavigate }: DashboardProps) => {
  const allCards = useCardStore((s) => s.cards);
  const reminderDays = useCardStore((s) => s.settings.reminderDays);
  const getCardImage = useCardTypeStore((s) => s.getCardImage);
  const getCardType = useCardTypeStore((s) => s.getCardType);
  const today = useToday();

  const currentYear = today.getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const isCurrentYear = selectedYear === currentYear;
  const monthIndex = today.getMonth();

  const [sortKey, setSortKey] = useState<SortKey>("effectiveFee");
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sortOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!sortRef.current?.contains(e.target as Node)) setSortOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => { document.removeEventListener("mousedown", onDocClick); };
  }, [sortOpen]);

  // Cards active in the selected calendar year: enabled AND opened on or before Dec 31 of that year.
  const activeInYear = useMemo(() => {
    const yearEnd = `${String(selectedYear)}-12-31`;
    return allCards.filter((c) => c.isEnabled && c.cardOpenDate <= yearEnd);
  }, [allCards, selectedYear]);

  const dashROI = useMemo(
    () => calculateDashboardROI(activeInYear, selectedYear),
    [activeInYear, selectedYear],
  );

  const totalFees = dashROI.totalAnnualFee;
  const totalActual = dashROI.totalActualValue;
  const effectiveFee = totalFees - totalActual;
  const effectiveIsRecovered = effectiveFee <= 0 && totalFees > 0;
  const recoveryPct = totalFees > 0
    ? Math.max(0, Math.min(100, Math.round((totalActual / totalFees) * 100)))
    : 0;
  const recoveryStatus: "recovered" | "warning" | "danger" = effectiveIsRecovered
    ? "recovered"
    : recoveryPct >= 80 ? "warning" : "danger";

  // Monthly redeemed totals (actualValue) across all active cards for the selected year.
  const monthlyUsage = useMemo(() => {
    const months = new Array<number>(12).fill(0);
    const yearPrefix = `${String(selectedYear)}-`;
    for (const card of activeInYear) {
      for (const benefit of card.benefits) {
        for (const record of benefit.usageRecords) {
          if (record.kind === "rollover") continue;
          if (!record.usedDate.startsWith(yearPrefix)) continue;
          const monthIdx = Number(record.usedDate.slice(5, 7)) - 1;
          if (monthIdx >= 0 && monthIdx < 12) {
            months[monthIdx] += record.actualValue;
          }
        }
      }
    }
    return months;
  }, [activeInYear, selectedYear]);

  const currentMonthUsage = isCurrentYear ? (monthlyUsage[monthIndex] ?? 0) : 0;

  // "待拿" and "即将过期" always reflect the *current* moment, not the selected year.
  const { leftOnTable, urgentCount, firstUrgentCardId, firstUnusedCardId, cardUnused } = useMemo(() => {
    let leftSum = 0;
    let urgent = 0;
    let firstUrgent: string | null = null;
    let firstUnused: string | null = null;
    const unusedByCard = new Map<string, number>();
    for (const card of activeInYear) {
      let cardUnusedCount = 0;
      for (const benefit of card.benefits) {
        if (benefit.isHidden) continue;
        if (!isApplicableNow(benefit, today)) continue;
        if (isBenefitUsedInPeriod(benefit, today, card.cardOpenDate)) continue;
        cardUnusedCount += 1;
        // Cumulative-consumption model: a benefit is "unused" when consumed <
        // totalFace. The remaining (not the raw faceValue) is what's still
        // left to redeem. Accounts for partial consumption AND rollover.
        leftSum += getAvailableValue(benefit, today);
        firstUnused ??= card.id;
        const deadline = getDeadline(today, {
          resetType: benefit.resetType,
          resetConfig: benefit.resetConfig,
          cardOpenDate: card.cardOpenDate,
        });
        if (!deadline) continue;
        const daysLeft = getDaysRemaining(today, deadline);
        if (daysLeft >= 0 && daysLeft <= reminderDays) {
          urgent += 1;
          firstUrgent ??= card.id;
        }
      }
      unusedByCard.set(card.id, cardUnusedCount);
    }
    return {
      leftOnTable: leftSum,
      urgentCount: urgent,
      firstUrgentCardId: firstUrgent,
      firstUnusedCardId: firstUnused,
      cardUnused: unusedByCard,
    };
  }, [activeInYear, today, reminderDays]);

  const benefitsTracked = useMemo(
    () =>
      activeInYear.reduce(
        (acc, c) => acc + c.benefits.filter((b) => !b.isHidden).length,
        0,
      ),
    [activeInYear],
  );

  const sortedCards = useMemo(() => {
    const roiByCardId = new Map(dashROI.cards.map((r) => [r.cardId, r]));
    const keyOf = (card: CreditCard): string | number => {
      switch (sortKey) {
        case "issuer":
          return (getCardType(card.cardTypeSlug)?.issuer ?? "").toLowerCase();
        case "cardType":
          return (getCardType(card.cardTypeSlug)?.name ?? "").toLowerCase();
        case "owner":
          return card.owner.toLowerCase();
        case "effectiveFee": {
          const roi = roiByCardId.get(card.id);
          return card.annualFee - (roi?.actualReturn ?? 0);
        }
        case "unused":
          // Descending for "most unused first"
          return -(cardUnused.get(card.id) ?? 0);
      }
    };
    return [...activeInYear].sort((a, b) => {
      const ka = keyOf(a);
      const kb = keyOf(b);
      if (ka < kb) return -1;
      if (ka > kb) return 1;
      return 0;
    });
  }, [activeInYear, sortKey, dashROI.cards, cardUnused, getCardType]);

  const cardHealth = useMemo(() => {
    let profitable = 0;
    let breakEven = 0;
    for (const roi of dashROI.cards) {
      if (roi.actualReturn >= roi.annualFee) {
        profitable += 1;
      } else if (roi.actualReturn > 0.8 * roi.annualFee) {
        breakEven += 1;
      }
    }
    return { profitable, breakEven };
  }, [dashROI.cards]);

  const reviewTargetCardId = firstUrgentCardId ?? firstUnusedCardId;

  const handleReviewClick = () => {
    if (reviewTargetCardId) {
      onNavigate?.({ type: "card", cardId: reviewTargetCardId });
    }
  };

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <div className="dashboard__title-block">
          <div className="dashboard__title-kicker" data-testid="period-bar">
            <span className="dashboard__title-kicker-now">{MONTH_NAMES[monthIndex]}</span>
            <span className="dashboard__title-kicker-sep">·</span>
            <span>{QUARTER_LABELS[monthIndex]}</span>
            <span className="dashboard__title-kicker-sep">·</span>
            <span>{HALF_LABELS[monthIndex]}</span>
          </div>
          <h1 className="dashboard__title">{String(selectedYear)} 年度概览</h1>
        </div>
        <div className="dashboard__year-picker" data-testid="year-picker">
          <button
            type="button"
            className="dashboard__year-arrow"
            onClick={() => { setSelectedYear((y) => y - 1); }}
            aria-label="Previous year"
          >
            ‹
          </button>
          <span className="dashboard__year-label">
            Jan {String(selectedYear)} — Dec {String(selectedYear)}
          </span>
          <button
            type="button"
            className="dashboard__year-arrow"
            onClick={() => { setSelectedYear((y) => y + 1); }}
            aria-label="Next year"
          >
            ›
          </button>
        </div>
      </div>

      <div className="dashboard__hero-wrap">
      <div className="dashboard__hero-bg" aria-hidden="true" />
      <div
        className={`dashboard__hero${isCurrentYear ? "" : " dashboard__hero--two"}`}
        data-testid="roi-summary"
      >

        <div className="dashboard__hero-cell" data-testid="hero-fees">
          <div className="dashboard__kicker">等效年费</div>

          <div className="dashboard__net-row">
            <div
              className={`dashboard__net${effectiveIsRecovered ? " dashboard__net--recovered" : ""}`}
              data-testid="effective-fee"
            >
              {effectiveFee < 0 && <span className="dashboard__net-sign">−</span>}
              <span className="dashboard__net-value">
                <span className="dashboard__net-currency">$</span>
                {formatMoneyDigits(Math.abs(effectiveFee))}
              </span>
            </div>
            {isCurrentYear && (
              <span className="dashboard__net-tag" data-testid="current-month-usage">
                本月 +{formatMoney(currentMonthUsage)}
              </span>
            )}
          </div>

          <div className="dashboard__recovery-wrap">
            <div className="dashboard__hero-sub">
              <span data-testid="total-actual">{formatMoney(totalActual)}</span> 已兑现 ·{" "}
              <span data-testid="total-fee">{formatMoney(totalFees)}</span> 年费
            </div>
            <div
              className={`dashboard__recovery-bar dashboard__recovery-bar--${recoveryStatus}`}
            >
              <div
                className="dashboard__recovery-bar-fill"
                style={{ width: `${String(recoveryPct)}%` }}
              />
            </div>
          </div>
        </div>

        {isCurrentYear && (
          <div
            className={`dashboard__hero-cell${urgentCount > 0 ? " dashboard__hero-cell--urgent" : ""}`}
            data-testid="hero-pending"
          >
            <div className="dashboard__kicker">待拿</div>
            <div
              className="dashboard__hero-big dashboard__hero-big--gradient"
              data-testid="left-on-table"
            >
              <span className="dashboard__net-currency">$</span>
              {formatMoneyDigits(leftOnTable)}
            </div>
            <div className="dashboard__hero-sub">
              {urgentCount > 0
                ? `${String(urgentCount)} 项即将过期`
                : "无即将到期项"}
            </div>
            <button
              type="button"
              className={`dashboard__review-btn${urgentCount > 0 ? " dashboard__review-btn--urgent" : ""}`}
              onClick={handleReviewClick}
              disabled={reviewTargetCardId === null}
              data-testid="hero-review-btn"
            >
              查看 →
            </button>
          </div>
        )}

        <div className="dashboard__hero-cell" data-testid="hero-active">
          <div className="dashboard__kicker">活跃卡片</div>
          <div className="dashboard__active-row">
            <div
              className="dashboard__hero-big dashboard__hero-big--gradient"
              data-testid="active-card-count"
            >
              {String(activeInYear.length)}
            </div>
            <div className="dashboard__chip-stack">
              {activeInYear.slice(0, 6).map((c) => {
                const img = getCardImage(c.cardTypeSlug);
                return (
                  <span key={c.id} className="dashboard__chip-item">
                    {img ? (
                      <img src={img} alt="" className="dashboard__chip-img" />
                    ) : (
                      <CardChip color={c.color} size="small" />
                    )}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="dashboard__hero-sub">
            共 {String(benefitsTracked)} 项权益
          </div>
          <div className="dashboard__health-row">
            <span className="dashboard__health">
              <span className="dashboard__dot dashboard__dot--positive" />
              {String(cardHealth.profitable)} 盈利中
            </span>
            <span className="dashboard__health-sep">·</span>
            <span className="dashboard__health">
              <span className="dashboard__dot dashboard__dot--warning" />
              {String(cardHealth.breakEven)} 接近盈亏平衡
            </span>
          </div>
        </div>
      </div>
      </div>

      <div className="dashboard__cards-section">
        <div className="dashboard__cards-header">
          <span className="dashboard__section-title">按卡片</span>
          <div
            className="dashboard__sort"
            ref={sortRef}
            data-testid="tiles-sort"
          >
            <button
              type="button"
              className="dashboard__sort-btn"
              onClick={() => { setSortOpen((v) => !v); }}
              aria-haspopup="listbox"
              aria-expanded={sortOpen}
              data-testid="tiles-sort-btn"
            >
              <svg
                className="dashboard__sort-icon"
                viewBox="0 0 16 16"
                width="14"
                height="14"
                aria-hidden="true"
              >
                <path
                  d="M3 5h10M5 8h6M7 11h2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
              <span className="dashboard__sort-label">{SORT_LABELS[sortKey]}</span>
            </button>
            {sortOpen && (
              <ul
                className="dashboard__sort-menu"
                role="listbox"
                data-testid="tiles-sort-menu"
              >
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <li key={key}>
                    <button
                      type="button"
                      className={`dashboard__sort-option${sortKey === key ? " dashboard__sort-option--active" : ""}`}
                      role="option"
                      aria-selected={sortKey === key}
                      onClick={() => { setSortKey(key); setSortOpen(false); }}
                      data-testid={`tiles-sort-option-${key}`}
                    >
                      {SORT_LABELS[key]}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="dashboard__tiles">
          {sortedCards.map((card) => {
            const roi = dashROI.cards.find((r) => r.cardId === card.id);
            const actual = roi?.actualReturn ?? 0;
            const fee = card.annualFee;
            // 等效年费 = 年费 - 兑现 benefit 实际值。负值表示已超额回本。
            const effectiveFee = fee - actual;
            const status = classifyTile(actual, fee);
            const barPct = fee > 0
              ? Math.max(0, Math.min(100, Math.round((actual / fee) * 100)))
              : 0;
            const cardTypeName = getCardType(card.cardTypeSlug)?.name ?? "";
            const displayName = getTileName(card, cardTypeName);
            const benefitsCount = card.benefits.filter((b) => !b.isHidden).length;
            const unused = cardUnused.get(card.id) ?? 0;
            const img = getCardImage(card.cardTypeSlug);

            return (
              <button
                type="button"
                key={card.id}
                className="dashboard__tile"
                data-status={status}
                data-testid={`card-tile-${card.id}`}
                style={{ "--tile-color": card.color } as React.CSSProperties}
                onClick={() => { onNavigate?.({ type: "card", cardId: card.id }); }}
              >
                <div className="dashboard__tile-header">
                  <div className="dashboard__tile-visual">
                    {img ? (
                      <img src={img} alt={displayName} className="dashboard__tile-img" />
                    ) : (
                      <CardChip color={card.color} size="small" />
                    )}
                    <span className="dashboard__tile-sheen" aria-hidden="true" />
                  </div>
                  <div className="dashboard__tile-meta">
                    <div className="dashboard__tile-issuer">
                      {cardTypeName || " "}
                    </div>
                    <div className="dashboard__tile-name" title={displayName}>
                      {displayName}
                    </div>
                    <div className="dashboard__tile-sub">
                      年费 ${String(fee)} · {String(benefitsCount)} 项
                    </div>
                  </div>
                </div>

                <div className="dashboard__tile-effective">
                  <span className="dashboard__tile-effective-label">等效年费</span>
                  <span className="dashboard__tile-net">
                    {effectiveFee < 0 ? "−" : ""}
                    {formatMoney(Math.abs(effectiveFee))}
                  </span>
                </div>

                <div className="dashboard__tile-bar">
                  <div
                    className="dashboard__tile-bar-fill"
                    style={{ width: `${String(barPct)}%` }}
                  />
                </div>

                <div className="dashboard__tile-footer">
                  <span className="dashboard__tile-unused">
                    <span className="dashboard__dot dashboard__dot--info" />
                    {String(unused)} 项待使用
                  </span>
                  <span className="dashboard__tile-ratio">
                    {formatMoney(actual)} / {formatMoney(fee)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
