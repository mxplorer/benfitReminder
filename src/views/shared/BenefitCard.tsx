import { useEffect, useRef, useState } from "react";
import type { Benefit, CreditCard, ResetType, UsageRecord } from "../../models/types";
import { formatDate, getConsumedInPeriod, getDeadline, getDaysRemaining, isBenefitUsedInPeriod } from "../../utils/period";
import { getAvailableValue, getTotalFaceWithRollover } from "../../utils/rollover";
import { latestHasPropagate } from "../../utils/usageRecords";
import { useToday } from "../../stores/useToday";
import { useCardStore } from "../../stores/useCardStore";
import "./BenefitCard.css";

/** Reset types where the refresh date depends on when the benefit was used. */
const DATE_REQUIRED_RESET_TYPES: ReadonlySet<ResetType> = new Set(["anniversary", "since_last_use"]);

interface AddUsageOpts {
  consumedFace: number;
  actualValue: number;
  usedDate: string;
  propagateNext?: boolean;
}

interface AddCycleUsageOpts {
  consumedFace: number;
  actualValue: number;
  usedDate?: string;
  propagateNext?: boolean;
}

interface BenefitCardProps {
  benefit: Benefit;
  card: CreditCard;
  onToggleUsage: (cardId: string, benefitId: string, actualValue?: number, usedDate?: string) => void;
  onEditRollover?: (cardId: string, benefitId: string) => void;
  onToggleHidden?: (cardId: string, benefitId: string) => void;
  onDelete?: (cardId: string, benefitId: string) => void;
  /** New in Batch 4 — opens usage-record manager for this benefit. Wired to
   *  CardDetail navigation in Batch 5. */
  onManageUsage?: (cardId: string, benefitId: string) => void;
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
  /** New record-level append (non-cycle). Preferred over onToggleUsage. */
  onAddUsage?: (cardId: string, benefitId: string, opts: AddUsageOpts) => void;
  /** New record-level append within an explicit cycle. Preferred over
   *  onSetCycleUsed for NEW additions. */
  onAddCycleUsage?: (
    cardId: string,
    benefitId: string,
    cycleStart: string,
    cycleEnd: string,
    opts: AddCycleUsageOpts,
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
  onManageUsage,
  compact = false,
  periodLabel,
  cycleRecord,
  cycleUsed,
  cycleStart,
  cycleEnd,
  onSetCycleUsed,
  onAddUsage,
  onAddCycleUsage,
}: BenefitCardProps) => {
  const today = useToday();
  const reminderDays = useCardStore((s) => s.settings.reminderDays);
  const isUsed = cycleUsed ?? isBenefitUsedInPeriod(benefit, today, card.cardOpenDate);
  const availableValue = getAvailableValue(benefit, today);
  const displayValue = cycleRecord ? cycleRecord.actualValue : availableValue;
  const cycleContext = cycleStart && cycleEnd ? { start: cycleStart, end: cycleEnd } : null;

  // Per-cycle remaining + record count. For cycle-scoped views we sum
  // record.faceValue within the explicit [cycleStart, cycleEnd] window; for
  // the standard view we defer to getAvailableValue (which already subtracts
  // cumulative consumption from faceValue + rollover).
  const cycleRecordsInWindow = cycleContext
    ? benefit.usageRecords.filter(
        (r) => r.usedDate >= cycleContext.start && r.usedDate <= cycleContext.end,
      )
    : null;
  const cycleConsumed = cycleRecordsInWindow
    ? cycleRecordsInWindow.reduce((s, r) => s + r.faceValue, 0)
    : 0;
  const cycleRemaining = cycleContext
    ? Math.max(0, benefit.faceValue - cycleConsumed)
    : availableValue;
  const cycleRecordCount = cycleRecordsInWindow ? cycleRecordsInWindow.length : 0;
  // For the standard (non-cycle) view, "records in cycle" comes from the
  // already-computed isUsed + availableValue: if isUsed with 0 remaining,
  // at least one record exists; otherwise we derive from record count in the
  // current period. Keep it simple: use faceValue - availableValue>0 as the
  // "has any consumption" signal for the standard view.
  const standardHasRecord = !cycleContext && availableValue < benefit.faceValue;

  const todayIso = formatDate(today);
  const defaultPendingDate = cycleContext
    ? todayIso >= cycleContext.start && todayIso <= cycleContext.end
      ? todayIso
      : cycleContext.start
    : todayIso;
  const [pendingValue, setPendingValue] = useState<string | null>(null);
  const [pendingConsumedFace, setPendingConsumedFace] = useState<string>("0");
  const [actualManuallyEdited, setActualManuallyEdited] = useState<boolean>(false);
  const [pendingDate, setPendingDate] = useState<string>(defaultPendingDate);
  const [pendingPropagate, setPendingPropagate] = useState<boolean>(false);
  const [editMode, setEditMode] = useState<"add" | "edit">("add");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dateRequired = DATE_REQUIRED_RESET_TYPES.has(benefit.resetType);
  const monthlyLike = isMonthlyLikeBenefit(benefit);

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
    menuOpen ? "benefit-card--menu-open" : "",
  ].filter(Boolean).join(" ");

  const handleClick = () => {
    if (isUsed) {
      if (monthlyLike && cycleContext && onSetCycleUsed && cycleRecord) {
        // Edit mode (monthly subscription single-record upsert). Defaults
        // come from the existing record. TODO: wire consumedFace edit —
        // currently 本次面值 is shown but routes through the legacy
        // onSetCycleUsed upsert which does not carry consumedFace (Batch 5).
        setPendingValue(String(cycleRecord.actualValue));
        setPendingConsumedFace(String(cycleRecord.faceValue));
        setActualManuallyEdited(true); // don't auto-sync in edit mode
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
    // Add mode — default consumedFace to remaining in this cycle
    // (getAvailableValue for standard; faceValue - cycleConsumed for per-cycle).
    const defaultRemaining = cycleContext ? cycleRemaining : availableValue;
    setPendingConsumedFace(String(defaultRemaining));
    setPendingValue(String(defaultRemaining));
    setActualManuallyEdited(false);
    setPendingDate(defaultPendingDate);
    setPendingPropagate(latestHasPropagate(benefit));
    setEditMode("add");
  };

  const handleConsumedFaceChange = (next: string) => {
    setPendingConsumedFace(next);
    // Auto-sync 实际到手 to the same number as long as the user hasn't
    // manually edited 实际到手 yet.
    if (!actualManuallyEdited) {
      setPendingValue(next);
    }
  };

  const handleActualValueChange = (next: string) => {
    setPendingValue(next);
    setActualManuallyEdited(true);
  };

  const handleConfirm = () => {
    if (pendingValue === null) return;
    const value = Number(pendingValue);
    if (isNaN(value) || value < 0) return;
    const consumedFace = Number(pendingConsumedFace);
    if (isNaN(consumedFace) || consumedFace < 0) return;
    if (dateRequired && !pendingDate) return;
    const propagateOpt = monthlyLike ? { propagateNext: pendingPropagate } : {};

    // New-append path (Batch 3): prefer record-level callbacks.
    if (editMode === "add" && cycleContext && onAddCycleUsage) {
      onAddCycleUsage(card.id, benefit.id, cycleContext.start, cycleContext.end, {
        consumedFace,
        actualValue: value,
        usedDate: pendingDate || undefined,
        ...propagateOpt,
      });
      setPendingValue(null);
      return;
    }
    if (editMode === "add" && !cycleContext && onAddUsage) {
      onAddUsage(card.id, benefit.id, {
        consumedFace,
        actualValue: value,
        usedDate: pendingDate || todayIso,
        ...propagateOpt,
      });
      setPendingValue(null);
      return;
    }

    // Fall-back / edit path: legacy callbacks (do not carry consumedFace).
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
  // Button text content by remaining + whether any record exists in this cycle.
  // remaining == 0 (and isUsed) → "✓ 已用完"
  // remaining > 0, no records yet → "+ 使用 $X"
  // remaining > 0, ≥ 1 record → "+ 再用一次 ($X 剩)"
  const hasAnyRecordInCycle = cycleContext ? cycleRecordCount > 0 : standardHasRecord;
  const remainingForBtn = cycleContext ? cycleRemaining : availableValue;

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

      {benefit.faceValue > 0 && !isUsed && (() => {
        const totalFace = cycleContext
          ? benefit.faceValue
          : getTotalFaceWithRollover(benefit, today);
        const consumedNow = cycleContext
          ? cycleConsumed
          : getConsumedInPeriod(benefit, today, card.cardOpenDate);
        if (totalFace <= 0) return null;
        const pct = Math.max(0, Math.min(100, (consumedNow / totalFace) * 100));
        return (
          <div
            className={`benefit-card__progress benefit-card__progress--${tileKind}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            aria-label={`已用 $${String(Math.round(consumedNow))} / $${String(totalFace)}`}
          >
            <div
              className="benefit-card__progress-fill"
              style={{ width: `${String(pct)}%` }}
            />
          </div>
        );
      })()}

      {pendingValue === null ? (
        <div className="benefit-card__actions">
          {(onManageUsage ||
            onToggleHidden ||
            (onDelete && !benefit.templateBenefitId)) && (
          <div className="benefit-card__actions-menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="benefit-card__icon-btn"
              onClick={() => { setMenuOpen((o) => !o); }}
              aria-label="更多操作"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="更多操作"
            >
              <span aria-hidden="true">⋯</span>
            </button>
            <div
              className={`benefit-card__actions-menu${menuOpen ? " benefit-card__actions-menu--open" : ""}`}
              role="menu"
            >
              {onManageUsage && (
                <button
                  type="button"
                  role="menuitem"
                  className="benefit-card__actions-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onManageUsage(card.id, benefit.id);
                  }}
                  aria-label="管理使用"
                >
                  管理使用
                </button>
              )}
              {onToggleHidden && (
                <button
                  type="button"
                  role="menuitem"
                  className="benefit-card__actions-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onToggleHidden(card.id, benefit.id);
                  }}
                  aria-label={benefit.isHidden ? "取消隐藏" : "隐藏"}
                >
                  {benefit.isHidden ? "取消隐藏" : "隐藏"}
                </button>
              )}
              {onDelete && !benefit.templateBenefitId && (
                <button
                  type="button"
                  role="menuitem"
                  className="benefit-card__actions-menu-item benefit-card__actions-menu-item--danger"
                  onClick={() => {
                    setMenuOpen(false);
                    if (window.confirm(`确定删除权益 "${benefit.name}" 吗？`)) {
                      onDelete(card.id, benefit.id);
                    }
                  }}
                  aria-label="删除权益"
                >
                  删除权益
                </button>
              )}
            </div>
          </div>
          )}
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
            disabled={tileKind === "pending"}
            aria-label={isUsed ? "取消使用" : tileKind === "pending" ? "未激活" : "标记使用"}
            title={tileKind === "pending" && cycleStart ? `将于 ${cycleStart} 激活` : undefined}
          >
            {isUsed ? (
              <>
                <span aria-hidden="true">✓</span> 已用完
              </>
            ) : tileKind === "pending" ? (
              <>未激活</>
            ) : hasAnyRecordInCycle ? (
              <>+ 再用一次 (${String(remainingForBtn)} 剩)</>
            ) : (
              <>+ 使用 ${String(remainingForBtn)}</>
            )}
          </button>
        </div>
      ) : (
        <div className="benefit-card__prompt" role="group">
          <div className="benefit-card__prompt-fields">
            <label className="benefit-card__prompt-label">
              本次面值
              <input
                type="number"
                min="0"
                step="0.01"
                value={pendingConsumedFace}
                onChange={(e) => { handleConsumedFaceChange(e.target.value); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConfirm();
                  if (e.key === "Escape") handleCancel();
                }}
                aria-label="本次面值"
                autoFocus
                className="benefit-card__prompt-input"
              />
            </label>
            <label className="benefit-card__prompt-label">
              实际到手
              <input
                type="number"
                min="0"
                step="0.01"
                value={pendingValue}
                onChange={(e) => { handleActualValueChange(e.target.value); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConfirm();
                  if (e.key === "Escape") handleCancel();
                }}
                aria-label="实际到手"
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
