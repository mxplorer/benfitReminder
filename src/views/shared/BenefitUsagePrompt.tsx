import { useState } from "react";

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

export interface BenefitUsagePromptInitial {
  consumedFace: number;
  actualValue: number;
  usedDate: string;
  propagateNext: boolean;
}

interface BenefitUsagePromptProps {
  cardId: string;
  benefitId: string;
  mode: "add" | "edit";
  /** Cycle context — if set, confirm appends/edits within that cycle. */
  cycleStart?: string;
  cycleEnd?: string;
  initial: BenefitUsagePromptInitial;
  /** Shows the 自动续期下月 checkbox (subscription / monthly calendar). */
  monthlyLike: boolean;
  /** Anniversary / since_last_use require a non-empty date. */
  dateRequired: boolean;
  /** todayIso fallback when no date entered and no cycle context. */
  todayIso: string;
  onAddUsage?: (cardId: string, benefitId: string, opts: AddUsageOpts) => void;
  onAddCycleUsage?: (
    cardId: string,
    benefitId: string,
    cycleStart: string,
    cycleEnd: string,
    opts: AddCycleUsageOpts,
  ) => void;
  onSetCycleUsed?: (
    cardId: string,
    benefitId: string,
    cycleStart: string,
    cycleEnd: string,
    used: boolean,
    opts?: { actualValue?: number; usedDate?: string; propagateNext?: boolean },
  ) => void;
  onToggleUsage?: (cardId: string, benefitId: string, actualValue?: number, usedDate?: string) => void;
  onClose: () => void;
}

export const BenefitUsagePrompt = ({
  cardId,
  benefitId,
  mode,
  cycleStart,
  cycleEnd,
  initial,
  monthlyLike,
  dateRequired,
  todayIso,
  onAddUsage,
  onAddCycleUsage,
  onSetCycleUsed,
  onToggleUsage,
  onClose,
}: BenefitUsagePromptProps) => {
  const [pendingConsumedFace, setPendingConsumedFace] = useState<string>(
    String(initial.consumedFace),
  );
  const [pendingValue, setPendingValue] = useState<string>(String(initial.actualValue));
  const [actualManuallyEdited, setActualManuallyEdited] = useState<boolean>(mode === "edit");
  const [pendingDate, setPendingDate] = useState<string>(initial.usedDate);
  const [pendingPropagate, setPendingPropagate] = useState<boolean>(initial.propagateNext);

  const cycleContext = cycleStart && cycleEnd ? { start: cycleStart, end: cycleEnd } : null;

  const handleConsumedFaceChange = (next: string) => {
    setPendingConsumedFace(next);
    if (!actualManuallyEdited) {
      setPendingValue(next);
    }
  };

  const handleActualValueChange = (next: string) => {
    setPendingValue(next);
    setActualManuallyEdited(true);
  };

  const handleConfirm = () => {
    const value = Number(pendingValue);
    if (isNaN(value) || value < 0) return;
    const consumedFace = Number(pendingConsumedFace);
    if (isNaN(consumedFace) || consumedFace < 0) return;
    if (dateRequired && !pendingDate) return;
    const propagateOpt = monthlyLike ? { propagateNext: pendingPropagate } : {};

    if (mode === "add" && cycleContext && onAddCycleUsage) {
      onAddCycleUsage(cardId, benefitId, cycleContext.start, cycleContext.end, {
        consumedFace,
        actualValue: value,
        usedDate: pendingDate || undefined,
        ...propagateOpt,
      });
      onClose();
      return;
    }
    if (mode === "add" && !cycleContext && onAddUsage) {
      onAddUsage(cardId, benefitId, {
        consumedFace,
        actualValue: value,
        usedDate: pendingDate || todayIso,
        ...propagateOpt,
      });
      onClose();
      return;
    }

    // Edit / fallback: legacy callbacks (don't carry consumedFace).
    if (cycleContext && onSetCycleUsed) {
      onSetCycleUsed(cardId, benefitId, cycleContext.start, cycleContext.end, true, {
        actualValue: value,
        usedDate: pendingDate || undefined,
        ...propagateOpt,
      });
    } else if (onToggleUsage) {
      onToggleUsage(cardId, benefitId, value, pendingDate || undefined);
    }
    onClose();
  };

  const handleDelete = () => {
    if (cycleContext && onSetCycleUsed) {
      onSetCycleUsed(cardId, benefitId, cycleContext.start, cycleContext.end, false);
    }
    onClose();
  };

  const showDelete = mode === "edit" && cycleContext !== null && onSetCycleUsed !== undefined;

  return (
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
              if (e.key === "Escape") onClose();
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
              if (e.key === "Escape") onClose();
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
              if (e.key === "Escape") onClose();
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
      {showDelete && (
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
        onClick={onClose}
        aria-label="取消"
        title="取消"
      >
        ✕
      </button>
    </div>
  );
};
