import { useState } from "react";
import { useCardStore } from "../../stores/useCardStore";
import { useCardTypeStore } from "../../stores/useCardTypeStore";
import { useToday } from "../../stores/useToday";
import { getCardDisplayName } from "../../models/types";
import { calculateCardROI, getMembershipYearRange } from "../../utils/roi";
import {
  expandBenefitsForFilter,
  type FilterMode,
  type YearScope,
} from "../../utils/benefitDisplay";
import { GlassContainer } from "../shared/GlassContainer";
import { BenefitCard } from "../shared/BenefitCard";
import { BenefitFilterBar } from "../shared/BenefitFilterBar";
import { AggregatedBenefitCard } from "../shared/AggregatedBenefitCard";
import { RolloverEditDialog } from "./RolloverEditDialog";
import type { ActiveView } from "./MainWindow";
import "./CardDetail.css";

interface CardDetailProps {
  cardId: string;
  onNavigate: (view: ActiveView) => void;
}

export const CardDetail = ({ cardId, onNavigate }: CardDetailProps) => {
  const cards = useCardStore((s) => s.cards);
  const toggleBenefitUsage = useCardStore((s) => s.toggleBenefitUsage);
  const setBenefitCycleUsed = useCardStore((s) => s.setBenefitCycleUsed);
  const removeCard = useCardStore((s) => s.removeCard);
  const removeBenefit = useCardStore((s) => s.removeBenefit);
  const toggleBenefitHidden = useCardStore((s) => s.toggleBenefitHidden);
  const getCardImage = useCardTypeStore((s) => s.getCardImage);
  const getCardType = useCardTypeStore((s) => s.getCardType);
  const [filter, setFilter] = useState<FilterMode>("available");
  const [scope, setScope] = useState<YearScope>("calendar");
  const [editRolloverBenefitId, setEditRolloverBenefitId] = useState<string | null>(null);
  const today = useToday();

  const card = cards.find((c) => c.id === cardId);
  if (!card) return <p>卡片未找到</p>;

  const roi = calculateCardROI(card, today);
  const membershipRange = getMembershipYearRange(card.cardOpenDate, today);
  const items = expandBenefitsForFilter(card, filter, today, scope);

  const allRecords = card.benefits
    .flatMap((b) =>
      b.usageRecords.map((r) => ({ ...r, benefitName: b.name, benefitId: b.id })),
    )
    .sort((a, b) => b.usedDate.localeCompare(a.usedDate));

  const openDate = new Date(card.cardOpenDate + "T00:00:00");
  const renewalYear =
    today >= new Date(today.getFullYear(), openDate.getMonth(), openDate.getDate())
      ? today.getFullYear() + 1
      : today.getFullYear();
  const renewalDate = `${String(renewalYear)}-${String(openDate.getMonth() + 1).padStart(2, "0")}-${String(openDate.getDate()).padStart(2, "0")}`;

  return (
    <div className="card-detail">
      <GlassContainer className="card-detail__header">
        <div
          className="card-detail__visual"
          style={getCardImage(card.cardTypeSlug) ? undefined : { background: `linear-gradient(135deg, ${card.color}, ${card.color}88)` }}
        >
          {getCardImage(card.cardTypeSlug) ? (
            <img
              src={getCardImage(card.cardTypeSlug)}
              alt={getCardDisplayName(card, getCardType(card.cardTypeSlug)?.name)}
              className="card-detail__card-img"
            />
          ) : (
            card.cardNumber ? `···${card.cardNumber.slice(-4)}` : ""
          )}
        </div>
        <div className="card-detail__header-info">
          <div className="card-detail__card-name">{getCardDisplayName(card, getCardType(card.cardTypeSlug)?.name)}</div>
          <div className="card-detail__card-meta">
            {card.owner} · 开卡 {card.cardOpenDate} · 续费 {renewalDate}
          </div>
        </div>
        <button
          className="card-detail__edit-btn"
          onClick={() => { onNavigate({ type: "card-editor", cardId }); }}
        >编辑</button>
        <button
          className="card-detail__delete-btn"
          onClick={() => {
            if (window.confirm("确定删除此卡片？所有权益和使用记录将被永久删除。")) {
              removeCard(cardId);
              onNavigate("dashboard");
            }
          }}
          data-testid="delete-card-btn"
        >删除</button>
      </GlassContainer>

      <span className="card-detail__scope-caption" data-testid="roi-scope-caption">
        会员年 {membershipRange.start} ~ {membershipRange.end}
      </span>

      <div className="card-detail__roi-strip" data-testid="roi-strip">
        <GlassContainer className="card-detail__roi-cell">
          <span className="card-detail__roi-label">年费</span>
          <span className="card-detail__roi-value" data-testid="roi-fee">
            ${String(roi.annualFee)}
          </span>
        </GlassContainer>
        <GlassContainer className="card-detail__roi-cell">
          <span className="card-detail__roi-label">面值回报</span>
          <span className="card-detail__roi-value" data-testid="roi-face">
            ${String(roi.faceValueReturn)}
          </span>
        </GlassContainer>
        <GlassContainer className="card-detail__roi-cell">
          <span className="card-detail__roi-label">实际回报</span>
          <span className="card-detail__roi-value" data-testid="roi-actual">
            ${String(roi.actualReturn)}
          </span>
        </GlassContainer>
        <GlassContainer className="card-detail__roi-cell">
          <span className="card-detail__roi-label">回本率</span>
          <span className="card-detail__roi-value" data-testid="roi-pct">
            {roi.roiPercent}%
          </span>
        </GlassContainer>
      </div>

      <BenefitFilterBar
        filter={filter}
        onChange={setFilter}
        scope={scope}
        onScopeChange={setScope}
      />

      <div className="card-detail__benefits-grid" data-testid="benefits-grid">
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
            <BenefitCard
              key={item.key}
              benefit={item.benefit}
              card={item.card}
              onToggleUsage={toggleBenefitUsage}
              onSetCycleUsed={setBenefitCycleUsed}
              onEditRollover={(_cardId, benefitId) => { setEditRolloverBenefitId(benefitId); }}
              onToggleHidden={toggleBenefitHidden}
              onDelete={removeBenefit}
              periodLabel={item.periodLabel}
              cycleStart={item.periodStart}
              cycleEnd={item.periodEnd}
              cycleUsed={item.cycleUsed}
              cycleRecord={item.cycleRecord}
            />
          );
        })}
        <button
          className="card-detail__add-btn"
          onClick={() => { onNavigate({ type: "benefit-editor", cardId }); }}
        >+ 添加 Benefit</button>
      </div>

      {editRolloverBenefitId && (() => {
        const editing = card.benefits.find((b) => b.id === editRolloverBenefitId);
        if (!editing) return null;
        return (
          <RolloverEditDialog
            card={card}
            benefit={editing}
            onClose={() => { setEditRolloverBenefitId(null); }}
          />
        );
      })()}

      <div className="card-detail__history-section">
        <span className="card-detail__section-title">使用历史</span>
        {allRecords.length === 0 ? (
          <p className="card-detail__history-empty">暂无使用记录</p>
        ) : (
          <table className="card-detail__history-table" data-testid="history-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>权益</th>
                <th>面值</th>
                <th>实际</th>
              </tr>
            </thead>
            <tbody>
              {allRecords.map((r, i) => (
                <tr key={`${r.benefitId}-${r.usedDate}-${String(i)}`}>
                  <td>{r.usedDate}</td>
                  <td>{r.benefitName}</td>
                  <td>${String(r.faceValue)}</td>
                  <td>${String(r.actualValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
