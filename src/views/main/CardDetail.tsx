import { useEffect, useRef, useState } from "react";
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
import { BenefitCard } from "../shared/BenefitCard";
import { BenefitFilterBar } from "../shared/BenefitFilterBar";
import { AggregatedBenefitCard } from "../shared/AggregatedBenefitCard";
import { RolloverEditDialog } from "./RolloverEditDialog";
import { UsageRecordEditDialog } from "./UsageRecordEditDialog";
import type { ActiveView } from "./MainWindow";
import type { Benefit, UsageRecord } from "../../models/types";
import "./CardDetail.css";

interface EditingRecord {
  cardId: string;
  benefitId: string;
  recordIndex: number;
  record: UsageRecord;
  benefit: Benefit;
}

interface CardDetailProps {
  cardId: string;
  onNavigate: (view: ActiveView) => void;
}

export const CardDetail = ({ cardId, onNavigate }: CardDetailProps) => {
  const cards = useCardStore((s) => s.cards);
  const toggleBenefitUsage = useCardStore((s) => s.toggleBenefitUsage);
  const setBenefitCycleUsed = useCardStore((s) => s.setBenefitCycleUsed);
  const addBenefitUsage = useCardStore((s) => s.addBenefitUsage);
  const addCycleUsage = useCardStore((s) => s.addCycleUsage);
  const removeCard = useCardStore((s) => s.removeCard);
  const removeBenefit = useCardStore((s) => s.removeBenefit);
  const toggleBenefitHidden = useCardStore((s) => s.toggleBenefitHidden);
  const removeBenefitUsageRecord = useCardStore((s) => s.removeBenefitUsageRecord);
  const getCardImage = useCardTypeStore((s) => s.getCardImage);
  const getCardType = useCardTypeStore((s) => s.getCardType);
  const [filter, setFilter] = useState<FilterMode>("available");
  const [scope, setScope] = useState<YearScope>("calendar");
  const [editRolloverBenefitId, setEditRolloverBenefitId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EditingRecord | null>(null);
  const [highlightBenefitId, setHighlightBenefitId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const historySectionRef = useRef<HTMLDivElement>(null);
  const today = useToday();

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => { document.removeEventListener("mousedown", handler); };
  }, [menuOpen]);

  const card = cards.find((c) => c.id === cardId);
  if (!card) return <p>卡片未找到</p>;

  const cardType = getCardType(card.cardTypeSlug);
  const cardTypeName = cardType?.name;
  const cardTypeIssuer = cardType?.issuer;
  const displayName = getCardDisplayName(card, cardTypeName);
  const cardImage = getCardImage(card.cardTypeSlug);
  const heroName = cardTypeName ?? card.customName ?? displayName;
  const aliasLine = (() => {
    if (card.alias && card.alias !== heroName) return card.alias;
    if (card.cardNumber && card.cardNumber.length >= 4) return card.cardNumber.slice(-4);
    return null;
  })();

  const roi = calculateCardROI(card, today);
  const membershipRange = getMembershipYearRange(card.cardOpenDate, today);
  const items = expandBenefitsForFilter(card, filter, today, scope);

  const equivalentFee = roi.annualFee - roi.actualReturn;
  const feeRecovered = equivalentFee < 0;

  const allRecords = card.benefits
    .flatMap((b) =>
      b.usageRecords.map((r, idx) => ({
        ...r,
        benefitName: b.name,
        benefitId: b.id,
        benefitFaceValue: b.faceValue,
        originalIndex: idx,
      })),
    )
    .sort((a, b) => b.usedDate.localeCompare(a.usedDate));

  const handleManageUsage = (_cardId: string, benefitId: string) => {
    setHighlightBenefitId(benefitId);
    // scrollIntoView may be missing in jsdom; guard for test environment.
    const section = historySectionRef.current;
    if (section && typeof section.scrollIntoView === "function") {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setTimeout(() => { setHighlightBenefitId(null); }, 2000);
  };

  const handleDeleteRecord = (benefitId: string, recordIndex: number) => {
    if (!window.confirm("确定删除这条使用记录？")) return;
    removeBenefitUsageRecord(cardId, benefitId, recordIndex);
  };

  const openEdit = (benefitId: string, recordIndex: number) => {
    const benefit = card.benefits.find((b) => b.id === benefitId);
    if (!benefit) return;
    const record = benefit.usageRecords[recordIndex];
    setEditingRecord({ cardId, benefitId, recordIndex, record, benefit });
  };

  return (
    <div className="card-detail">
      <nav className="card-detail__breadcrumb" aria-label="Breadcrumb">
        <button
          type="button"
          className="card-detail__breadcrumb-link"
          onClick={() => { onNavigate("dashboard"); }}
        >
          卡片
        </button>
        <span className="card-detail__breadcrumb-current" aria-current="page">
          {" / "}{displayName}
        </span>
      </nav>

      <div className="card-detail__header">
        <div
          className="card-detail__visual"
          style={cardImage ? undefined : { background: `linear-gradient(135deg, ${card.color}, ${card.color}88)` }}
        >
          {cardImage ? (
            <img
              src={cardImage}
              alt={displayName}
              className="card-detail__card-img"
            />
          ) : (
            card.cardNumber ? `···${card.cardNumber.slice(-4)}` : ""
          )}
        </div>
        <div className="card-detail__hero-info">
          {cardTypeIssuer && (
            <span className="card-detail__hero-issuer">{cardTypeIssuer}</span>
          )}
          <span className="card-detail__hero-name">{heroName}</span>
          {aliasLine && (
            <span className="card-detail__hero-alias">{aliasLine}</span>
          )}
          <span className="card-detail__hero-meta">
            {card.owner} · 开卡 {card.cardOpenDate} · {String(card.benefits.length)} 项福利 · 年费 ${String(roi.annualFee)}
          </span>
        </div>
        <div className="card-detail__hero-fee" data-testid="hero-fee">
          <span className="card-detail__hero-fee-label">当前等效年费</span>
          <span
            className={`card-detail__hero-fee-value${feeRecovered ? " card-detail__hero-fee-value--recovered" : ""}`}
            data-testid="hero-fee-value"
          >
            {feeRecovered ? "−" : ""}${String(Math.abs(equivalentFee))}
          </span>
          <span className="card-detail__hero-fee-sub">${String(roi.actualReturn)} 已兑现</span>
        </div>
        <div className="card-detail__actions" ref={menuRef}>
          <button
            type="button"
            className="card-detail__actions-trigger"
            onClick={() => { setMenuOpen((o) => !o); }}
            aria-label="更多操作"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span aria-hidden="true">⋯</span>
          </button>
          <div
            className={`card-detail__actions-menu${menuOpen ? " card-detail__actions-menu--open" : ""}`}
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              className="card-detail__actions-menu-item"
              onClick={() => {
                setMenuOpen(false);
                onNavigate({ type: "card-editor", cardId });
              }}
            >
              编辑
            </button>
            <button
              type="button"
              role="menuitem"
              className="card-detail__actions-menu-item card-detail__actions-menu-item--danger"
              onClick={() => {
                setMenuOpen(false);
                if (window.confirm("确定删除此卡片？所有权益和使用记录将被永久删除。")) {
                  removeCard(cardId);
                  onNavigate("dashboard");
                }
              }}
              data-testid="delete-card-btn"
            >
              删除
            </button>
          </div>
        </div>
      </div>

      <span className="card-detail__scope-caption" data-testid="roi-scope-caption">
        会员年 {membershipRange.start} ~ {membershipRange.end}
      </span>

      <div className="card-detail__roi-strip" data-testid="roi-strip">
        <div className="card-detail__roi-cell">
          <span className="card-detail__roi-label">年费</span>
          <span className="card-detail__roi-value" data-testid="roi-fee">
            ${String(roi.annualFee)}
          </span>
        </div>
        <div className="card-detail__roi-cell">
          <span className="card-detail__roi-label">面值回报</span>
          <span className="card-detail__roi-value" data-testid="roi-face">
            ${String(roi.faceValueReturn)}
          </span>
        </div>
        <div className="card-detail__roi-cell">
          <span className="card-detail__roi-label">实际回报</span>
          <span className="card-detail__roi-value card-detail__roi-value--positive" data-testid="roi-actual">
            ${String(roi.actualReturn)}
          </span>
        </div>
        <div className="card-detail__roi-cell">
          <span className="card-detail__roi-label">回本率</span>
          <span className="card-detail__roi-value" data-testid="roi-pct">
            {roi.roiPercent}%
          </span>
        </div>
      </div>

      <div className="card-detail__benefits-section">
        <div className="card-detail__benefits-header">
          <h2 className="card-detail__benefits-title">福利</h2>
          <BenefitFilterBar
            filter={filter}
            onChange={setFilter}
            scope={scope}
            onScopeChange={setScope}
          />
        </div>

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
                onAddUsage={addBenefitUsage}
                onAddCycleUsage={addCycleUsage}
                onEditRollover={(_cardId, benefitId) => { setEditRolloverBenefitId(benefitId); }}
                onToggleHidden={(cardId, benefitId) => {
                  toggleBenefitHidden(cardId, benefitId);
                  if (filter === "hidden") setFilter("all");
                }}
                onDelete={removeBenefit}
                onManageUsage={handleManageUsage}
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

      <div className="card-detail__history-section" ref={historySectionRef}>
        <span className="card-detail__section-title">使用记录</span>
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
                <th aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {allRecords.map((r, i) => {
                const isRollover = r.kind === "rollover";
                const highlight = highlightBenefitId === r.benefitId;
                const rowClass = highlight ? "card-detail__history-row--highlight" : undefined;
                return (
                  <tr
                    key={`${r.benefitId}-${r.usedDate}-${String(i)}`}
                    className={rowClass}
                    data-benefit-id={r.benefitId}
                    data-testid="history-row"
                  >
                    <td>{r.usedDate}</td>
                    <td>{isRollover ? `${r.benefitName} · 结转` : r.benefitName}</td>
                    <td>${String(isRollover ? r.benefitFaceValue : r.faceValue)}</td>
                    <td>${String(r.actualValue)}</td>
                    <td className="card-detail__history-actions">
                      <button
                        type="button"
                        className="card-detail__history-action-btn"
                        aria-label="编辑"
                        onClick={() => { openEdit(r.benefitId, r.originalIndex); }}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="card-detail__history-action-btn card-detail__history-action-btn--danger"
                        aria-label="删除"
                        onClick={() => { handleDeleteRecord(r.benefitId, r.originalIndex); }}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editingRecord && (
        <UsageRecordEditDialog
          cardId={editingRecord.cardId}
          benefitId={editingRecord.benefitId}
          recordIndex={editingRecord.recordIndex}
          record={editingRecord.record}
          benefit={editingRecord.benefit}
          onClose={() => { setEditingRecord(null); }}
        />
      )}
    </div>
  );
};
