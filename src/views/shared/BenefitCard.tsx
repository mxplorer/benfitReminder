import { useState } from "react";
import type { Benefit, CreditCard, ResetType, UsageRecord } from "../../models/types";
import { formatDate, getDeadline, getDaysRemaining, isBenefitUsedInPeriod } from "../../utils/period";
import { getAvailableValue } from "../../utils/rollover";
import { latestHasPropagate } from "../../utils/usageRecords";
import { useToday } from "../../stores/useToday";
import { useCardStore } from "../../stores/useCardStore";
import "./BenefitCard.css";

/** Reset types where the refresh date depends on when the benefit was used. */
const DATE_REQUIRED_RESET_TYPES: ReadonlySet<ResetType> = new Set(["anniversary", "since_last_use"]);

interface BenefitCardProps {
  benefit: Benefit;
  card: CreditCard;
  onToggleUsage: (cardId: string, benefitId: string, actualValue?: number, usedDate?: string) => void;
  onEditRollover?: (cardId: string, benefitId: string) => void;
  onToggleHidden?: (cardId: string, benefitId: string) => void;
  onDelete?: (cardId: string, benefitId: string) => void;
  compact?: boolean;
  periodLabel?: string;
  cycleRecord?: UsageRecord;
  cycleUsed?: boolean;
  cycleStart?: string;
  cycleEnd?: string;
  onSetCycleUsed?: (
    cardId: string,
    benefitId: string,
    cycleStart: string,
    cycleEnd: string,
    used: boolean,
    opts?: { actualValue?: number; usedDate?: string; propagateNext?: boolean },
  ) => void;
}

const isMonthlyLikeBenefit = (b: Benefit): boolean =>
  b.resetType === "subscription" ||
  (b.resetType === "calendar" && b.resetConfig.period === "monthly");

const PERIOD_LABELS: Record<string, string> = {
  monthly: "每月",
  quarterly: "每季度",
  semi_annual: "半年",
  annual: "每年",
  every_4_years: "每4年",
};

const getResetLabel = (benefit: Benefit): string => {
  if (benefit.resetType === "subscription") return latestHasPropagate(benefit) ? "订阅·自动" : "订阅";
  if (benefit.resetType === "anniversary") return "周年";
  if (benefit.resetType === "since_last_use") return "按使用";
  if (benefit.resetType === "one_time") return "一次性";
  return PERIOD_LABELS[benefit.resetConfig.period ?? ""] ?? "";
};

const formatDeadlineShort = (days: number): string => {
  if (days <= 30) return `剩余 ${String(days)} 天`;
  return `剩余 ${String(Math.round(days / 30))} 月`;
};

type TileKind = "urgent" | "ok" | "used" | "pending";

const resolveTileKind = (opts: {
  isUsed: boolean;
  notYetActive: boolean;
  daysRemaining: number | null;
  reminderDays: number;
}): TileKind => {
  if (opts.isUsed) return "used";
  if (opts.notYetActive) return "pending";
  if (opts.daysRemaining !== null && opts.daysRemaining <= opts.reminderDays) return "urgent";
  return "ok";
};

const statusText = (kind: TileKind, daysRemaining: number | null): string => {
  if (kind === "used") return "已使用";
  if (kind === "pending") return "未激活";
  if (kind === "urgent") return "即将到期";
  if (daysRemaining !== null && daysRemaining > 60) return "充裕";
  return "可使用";
};

export const BenefitCard = ({
  benefit,
  card,
  onToggleUsage,
  onEditRollover,
  onToggleHidden,
  onDelete,
  compact = false,
  periodLabel,
  cycleRecord,
  cycleUsed,
  cycleStart,
  cycleEnd,
  onSetCycleUsed,
}: BenefitCardProps) => {
  const today = useToday();
  const reminderDays = useCardStore((s) => s.settings.reminderDays);
  const isUsed = cycleUsed ?? isBenefitUsedInPeriod(benefit, today, card.cardOpenDate);
  const availableValue = getAvailableValue(benefit, today);
  const displayValue = cycleRecord ? cycleRecord.actualValue : availableValue;
  const cycleContext = cycleStart && cycleEnd ? { start: cycleStart, end: cycleEnd } : null;
  const todayIso = formatDate(today);
  const defaultPendingDate = cycleContext
    ? todayIso >= cycleContext.start && todayIso <= cycleContext.end
      ? todayIso
      : cycleContext.start
    : todayIso;
  const [pendingValue, setPendingValue] = useState<string | null>(null);
  const [pendingDate, setPendingDate] = useState<string>(defaultPendingDate);
  const [pendingPropagate, setPendingPropagate] = useState<boolean>(false);
  const [editMode, setEditMode] = useState<"add" | "edit">("add");
  const dateRequired = DATE_REQUIRED_RESET_TYPES.has(benefit.resetType);
  const monthlyLike = isMonthlyLikeBenefit(benefit);

  const deadline = getDeadline(today, {
    resetType: benefit.resetType,
    resetConfig: benefit.resetConfig,
    cardOpenDate: card.cardOpenDate,
  });
  const daysRemaining = deadline ? getDaysRemaining(today, deadline) : null;
  const notYetActive = cycleStart !== undefined && todayIso < cycleStart;

  const tileKind = resolveTileKind({ isUsed, notYetActive, daysRemaining, reminderDays });
  const statusLabel = statusText(tileKind, daysRemaining);
  const deadlineBadge = !isUsed && !notYetActive && daysRemaining !== null
    ? formatDeadlineShort(daysRemaining)
    : null;

  // Legacy urgency class retained for existing descendants/tests that may key on it.
  const urgencyClass = tileKind === "urgent" ? "urgent" : tileKind === "used" || tileKind === "pending" ? "safe" : "warning";
  const cardClasses = [
    "benefit-card",
    isUsed ? "used" : "",
    benefit.isHidden ? "hidden-benefit" : "",
    urgencyClass,
    `benefit-card--${tileKind}`,
  ].filter(Boolean).join(" ");

  const handleClick = () => {
    if (isUsed) {
      if (monthlyLike && cycleContext && onSetCycleUsed && cycleRecord) {
        setPendingValue(String(cycleRecord.actualValue));
        setPendingDate(cycleRecord.usedDate);
        setPendingPropagate(cycleRecord.propagateNext === true);
        setEditMode("edit");
        return;
      }
      if (cycleContext && onSetCycleUsed) {
        onSetCycleUsed(card.id, benefit.id, cycleContext.start, cycleContext.end, false);
        return;
      }
      onToggleUsage(card.id, benefit.id);
      return;
    }
    setPendingValue(String(benefit.faceValue));
    setPendingDate(defaultPendingDate);
    setPendingPropagate(latestHasPropagate(benefit));
    setEditMode("add");
  };

  const handleConfirm = () => {
    if (pendingValue === null) return;
    const value = Number(pendingValue);
    if (isNaN(value) || value < 0) return;
    if (dateRequired && !pendingDate) return;
    const propagateOpt = monthlyLike ? { propagateNext: pendingPropagate } : {};
    if (cycleContext && onSetCycleUsed) {
      onSetCycleUsed(card.id, benefit.id, cycleContext.start, cycleContext.end, true, {
        actualValue: value,
        usedDate: pendingDate || undefined,
        ...propagateOpt,
      });
    } else {
      onToggleUsage(card.id, benefit.id, value, pendingDate || undefined);
    }
    setPendingValue(null);
  };

  const handleDelete = () => {
    if (cycleContext && onSetCycleUsed) {
      onSetCycleUsed(card.id, benefit.id, cycleContext.start, cycleContext.end, false);
    }
    setPendingValue(null);
  };

  const handleCancel = () => {
    setPendingValue(null);
  };

  const valueText = displayValue > 0 ? `$${String(displayValue)}` : "—";
  const accumulatedBonus = cycleRecord ? 0 : Math.max(0, displayValue - benefit.faceValue);

  return (
    <div className={cardClasses}>
      <div className="benefit-card__head">
        <span className={`benefit-card__name ${isUsed ? "benefit-card__name--used" : ""}`}>
          {benefit.name}
        </span>
        <span className="benefit-card__value">{valueText}</span>
      </div>

      {!compact && benefit.description && (
        <span className="benefit-card__description">{benefit.description}</span>
      )}

      <div className="benefit-card__meta">
        <span
          className="benefit-card__period"
          title={
            benefit.resetType === "subscription" && latestHasPropagate(benefit)
              ? "自动填充上月金额，可修改或取消"
              : undefined
          }
        >
          {periodLabel ?? getResetLabel(benefit)}
        </span>
        {benefit.rolloverable && (
          <span className="benefit-card__rollover-badge">可Roll</span>
        )}
      </div>

      <div className="benefit-card__status-row">
        <span className="benefit-card__status">
          <span
            className={`benefit-card__status-dot benefit-card__status-dot--${tileKind}`}
            aria-hidden="true"
          />
          {statusLabel}
        </span>
        {deadlineBadge && (
          <span className="benefit-card__deadline">{deadlineBadge}</span>
        )}
      </div>

      {pendingValue === null ? (
        <div className="benefit-card__actions">
          <div className="benefit-card__actions-icons">
            {onToggleHidden && (
              <button
                type="button"
                className="benefit-card__icon-btn"
                onClick={() => { onToggleHidden(card.id, benefit.id); }}
                aria-label={benefit.isHidden ? "取消隐藏" : "隐藏"}
                title={benefit.isHidden ? "取消隐藏" : "隐藏"}
              >
                {benefit.isHidden ? (
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth={2}
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                  >
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth={2}
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                  >
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                    <line x1="2" x2="22" y1="2" y2="22" />
                  </svg>
                )}
              </button>
            )}
            {onDelete && !benefit.templateBenefitId && (
              <button
                type="button"
                className="benefit-card__icon-btn benefit-card__icon-btn--danger"
                onClick={() => {
                  if (window.confirm(`确定删除权益 "${benefit.name}" 吗？`)) {
                    onDelete(card.id, benefit.id);
                  }
                }}
                aria-label="删除权益"
                title="删除权益"
              >
                ✕
              </button>
            )}
          </div>
          {onEditRollover && benefit.rolloverable && (
            <button
              type="button"
              className="benefit-card__chip-btn"
              onClick={() => { onEditRollover(card.id, benefit.id); }}
              aria-label="Rollover 设置"
              title="Rollover 设置"
            >
              <span className="benefit-card__chip-icon" aria-hidden="true">↺</span>
              结转
            </button>
          )}
          <button
            type="button"
            className={`benefit-card__use-btn benefit-card__use-btn--${isUsed ? "used" : "active"}`}
            onClick={handleClick}
            aria-label={isUsed ? "取消使用" : "标记使用"}
          >
            {isUsed ? (
              <>
                <span aria-hidden="true">✓</span> 已勾选
              </>
            ) : accumulatedBonus > 0 ? (
              <>使用 ${String(displayValue)}</>
            ) : (
              <>使用</>
            )}
          </button>
        </div>
      ) : (
        <div className="benefit-card__prompt" role="group">
          <div className="benefit-card__prompt-fields">
            <label className="benefit-card__prompt-label">
              实际到手
              <input
                type="number"
                min="0"
                step="0.01"
                value={pendingValue}
                onChange={(e) => { setPendingValue(e.target.value); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConfirm();
                  if (e.key === "Escape") handleCancel();
                }}
                aria-label="实际到手"
                autoFocus
                className="benefit-card__prompt-input"
              />
            </label>
            <label className="benefit-card__prompt-label">
              {dateRequired ? "使用日期*" : "使用日期"}
              <input
                type="date"
                value={pendingDate}
                onChange={(e) => { setPendingDate(e.target.value); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConfirm();
                  if (e.key === "Escape") handleCancel();
                }}
                aria-label="使用日期"
                required={dateRequired}
                className="benefit-card__prompt-input benefit-card__prompt-input--date"
              />
            </label>
            {monthlyLike && (
              <label className="benefit-card__prompt-label benefit-card__prompt-label--checkbox">
                <input
                  type="checkbox"
                  checked={pendingPropagate}
                  onChange={(e) => { setPendingPropagate(e.target.checked); }}
                  aria-label="自动续期下月"
                />
                自动续期下月
              </label>
            )}
          </div>
          {editMode === "edit" && cycleContext && onSetCycleUsed && (
            <button
              type="button"
              className="benefit-card__action-btn benefit-card__action-btn--danger"
              onClick={handleDelete}
              aria-label="删除记录"
              title="删除记录"
            >
              ✕
            </button>
          )}
          <button
            type="button"
            className="benefit-card__action-btn benefit-card__action-btn--confirm"
            onClick={handleConfirm}
            aria-label="确认"
            title="确认"
          >
            ✓
          </button>
          <button
            type="button"
            className="benefit-card__action-btn"
            onClick={handleCancel}
            aria-label="取消"
            title="取消"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};
