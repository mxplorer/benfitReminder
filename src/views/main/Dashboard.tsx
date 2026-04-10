import { useState } from "react";
import { useCardStore } from "../../stores/useCardStore";
import { getCardDisplayName } from "../../models/types";
import { calculateDashboardROI, calculateCardROI } from "../../utils/roi";
import { GlassContainer } from "../shared/GlassContainer";
import { CardChip } from "../shared/CardChip";
import "./Dashboard.css";

const QUARTER_LABELS = ["Q1", "Q1", "Q1", "Q2", "Q2", "Q2", "Q3", "Q3", "Q3", "Q4", "Q4", "Q4"];
const HALF_LABELS = ["H1", "H1", "H1", "H1", "H1", "H1", "H2", "H2", "H2", "H2", "H2", "H2"];
const MONTH_NAMES = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

const getAvailableYears = (today: Date): number[] => {
  const year = today.getFullYear();
  return [year, year - 1, year - 2];
};

export const Dashboard = () => {
  const cards = useCardStore((s) => s.cards);
  const today = new Date();
  const currentYear = today.getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const monthIndex = today.getMonth(); // 0-based
  const monthLabel = MONTH_NAMES[monthIndex];
  const quarterLabel = QUARTER_LABELS[monthIndex];
  const halfLabel = HALF_LABELS[monthIndex];

  const dashROI = calculateDashboardROI(cards, selectedYear);
  const availableYears = getAvailableYears(today);

  const enabledCards = cards.filter((c) => c.isEnabled);

  return (
    <div className="dashboard">
      <div className="dashboard__period-bar" data-testid="period-bar">
        <span className="dashboard__period-pill">{monthLabel}</span>
        <span className="dashboard__period-pill">{quarterLabel}</span>
        <span className="dashboard__period-pill">{halfLabel}</span>
      </div>

      <div className="dashboard__year-selector">
        {availableYears.map((y) => (
          <button
            key={y}
            className={`dashboard__year-btn${selectedYear === y ? " dashboard__year-btn--active" : ""}`}
            onClick={() => { setSelectedYear(y); }}
          >
            {y}
          </button>
        ))}
      </div>

      <div className="dashboard__roi-summary" data-testid="roi-summary">
        <GlassContainer className="dashboard__roi-cell">
          <span className="dashboard__roi-label">总年费</span>
          <span className="dashboard__roi-value" data-testid="total-fee">
            ${String(dashROI.totalAnnualFee)}
          </span>
        </GlassContainer>
        <GlassContainer className="dashboard__roi-cell">
          <span className="dashboard__roi-label">面值回报</span>
          <span className="dashboard__roi-value" data-testid="total-face">
            ${String(dashROI.totalFaceValue)}
          </span>
        </GlassContainer>
        <GlassContainer className="dashboard__roi-cell">
          <span className="dashboard__roi-label">实际回报</span>
          <span className="dashboard__roi-value" data-testid="total-actual">
            ${String(dashROI.totalActualValue)}
          </span>
        </GlassContainer>
      </div>

      <div className="dashboard__cards-section">
        <span className="dashboard__section-title">各卡回本进度</span>
        {enabledCards.map((card) => {
          const roi = calculateCardROI(card, today);
          const progressPct = card.annualFee > 0
            ? Math.min(100, Math.round((roi.actualReturn / card.annualFee) * 100))
            : 0;

          return (
            <GlassContainer
              key={card.id}
              className={`dashboard__card-row${!roi.isRecovered ? " dashboard__card-row--not-recovered" : ""}`}
            >
              <CardChip color={card.color} size="small" />
              <div className="dashboard__card-meta">
                <span className="dashboard__card-name">{getCardDisplayName(card)}</span>
                <span className="dashboard__card-sub">{card.owner} · 年费 ${String(card.annualFee)}</span>
              </div>
              <div className="dashboard__card-progress-wrap">
                <div className="dashboard__card-progress-bar">
                  <div
                    className="dashboard__card-progress-fill"
                    style={{ width: `${String(progressPct)}%` }}
                  />
                </div>
                <span className="dashboard__card-roi-pct">{roi.roiPercent}%</span>
              </div>
            </GlassContainer>
          );
        })}
      </div>
    </div>
  );
};
