import { useMemo, useState } from "react";
import type { Benefit, CalendarPeriod, CreditCard } from "../../models/types";
import { createLogger } from "../../lib/logger";
import { useCardStore } from "../../stores/useCardStore";
import { cycleStartForDate } from "../../utils/usageRecords";
import { generateRolloverRecords, getAvailableValue } from "../../utils/rollover";
import "./RolloverEditDialog.css";

const logger = createLogger("views.rollover-dialog");

const PERIOD_MULTIPLIER: Record<CalendarPeriod, number> = {
  monthly: 12,
  quarterly: 4,
  semi_annual: 2,
  annual: 1,
  every_4_years: 1,
};

const PERIOD_LABEL: Record<CalendarPeriod, string> = {
  monthly: "months",
  quarterly: "quarters",
  semi_annual: "halves",
  annual: "years",
  every_4_years: "4-year blocks",
};

interface RolloverEditDialogProps {
  card: CreditCard;
  benefit: Benefit;
  onClose: () => void;
}

export const RolloverEditDialog = ({ card, benefit, onClose }: RolloverEditDialogProps) => {
  if (!benefit.rolloverable) {
    if (import.meta.env.DEV) {
      throw new Error(
        `RolloverEditDialog requires rolloverable benefit; got ${benefit.id}`,
      );
    }
    logger.warn("aborted render: benefit not rolloverable", { benefitId: benefit.id });
    return null;
  }
  const period = benefit.resetConfig.period;
  if (!period) {
    if (import.meta.env.DEV) {
      throw new Error(
        `RolloverEditDialog requires calendar period; benefit ${benefit.id} has none`,
      );
    }
    logger.warn("aborted render: benefit has no calendar period", { benefitId: benefit.id });
    return null;
  }

  return (
    <RolloverEditDialogInner
      card={card}
      benefit={benefit}
      period={period}
      onClose={onClose}
    />
  );
};

interface InnerProps extends RolloverEditDialogProps {
  period: CalendarPeriod;
}

const RolloverEditDialogInner = ({ card, benefit, period, onClose }: InnerProps) => {
  const today = useMemo(() => new Date(), []);
  const currentCycleStart = useMemo(() => cycleStartForDate(today, period), [today, period]);
  // Seed the input from the total amount already rolled into prior cycles
  // (sum of record faceValues, each capped at benefit.faceValue during write).
  // Using the sum — not count × faceValue — correctly surfaces partial
  // rollovers (e.g. a $23-only rollover) back to the user for editing.
  const pastRolloverSum = useMemo(
    () =>
      benefit.usageRecords
        .filter((r) => r.kind === "rollover" && r.usedDate < currentCycleStart)
        .reduce((s, r) => s + r.faceValue, 0),
    [benefit.usageRecords, currentCycleStart],
  );
  const [amountInput, setAmountInput] = useState<string>(
    String(pastRolloverSum),
  );
  const amount = Math.max(0, Number(amountInput) || 0);

  const previewRecords = useMemo(
    () => generateRolloverRecords(benefit, amount, today),
    [benefit, amount, today],
  );

  const currentAvailable = useMemo(
    () => getAvailableValue(benefit, today),
    [benefit, today],
  );
  // Total pool = this cycle's own face + whatever was rolled in from prior
  // cycles (sum of record faceValues, each capped at benefit.faceValue).
  const nextAvailable =
    benefit.faceValue +
    previewRecords.reduce((s, r) => s + r.faceValue, 0);

  const replaceRolloverRecords = useCardStore((s) => s.replaceRolloverRecords);
  const clearRolloverRecords = useCardStore((s) => s.clearRolloverRecords);

  const maxPeriods = benefit.rolloverMaxYears * PERIOD_MULTIPLIER[period];

  const handleSave = () => {
    replaceRolloverRecords(card.id, benefit.id, amount);
    onClose();
  };

  const handleClear = () => {
    clearRolloverRecords(card.id, benefit.id);
    onClose();
  };

  return (
    <div className="rollover-dialog__overlay">
      <div className="rollover-dialog">
        <h2 className="rollover-dialog__title">Rollover — {benefit.name}</h2>
        <dl className="rollover-dialog__info">
          <div className="rollover-dialog__info-row">
            <dt>FaceValue</dt>
            <dd>${String(benefit.faceValue)} / cycle</dd>
          </div>
          <div className="rollover-dialog__info-row">
            <dt>Max rollover</dt>
            <dd>
              {String(benefit.rolloverMaxYears)} years ({String(maxPeriods)}{" "}
              {PERIOD_LABEL[period]})
            </dd>
          </div>
        </dl>
        <label className="rollover-dialog__amount-label">
          Accumulated rollover amount
          <input
            className="rollover-dialog__amount-input"
            type="number"
            min={0}
            value={amountInput}
            onChange={(e) => { setAmountInput(e.target.value); }}
          />
        </label>
        <dl className="rollover-dialog__impact" data-testid="rollover-edit-impact">
          <div className="rollover-dialog__info-row">
            <dt>当前可用</dt>
            <dd>${String(currentAvailable)}</dd>
          </div>
          <div className="rollover-dialog__info-row">
            <dt>保存后可用</dt>
            <dd data-testid="rollover-edit-next-available">${String(nextAvailable)}</dd>
          </div>
        </dl>
        <div className="rollover-dialog__preview-section">
          <span className="rollover-dialog__preview-label">
            生成的 past-cycle rollover 记录:
          </span>
          <ul className="rollover-dialog__preview" data-testid="rollover-edit-preview">
            {previewRecords.length === 0 ? (
              <li className="rollover-dialog__preview-empty">(无)</li>
            ) : (
              previewRecords.map((r) => (
                <li key={r.usedDate}>{r.usedDate} · rollover</li>
              ))
            )}
          </ul>
        </div>
        <div className="rollover-dialog__actions">
          <button
            type="button"
            className="rollover-dialog__btn"
            onClick={handleClear}
          >
            Clear rollover
          </button>
          <button
            type="button"
            className="rollover-dialog__btn"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rollover-dialog__btn rollover-dialog__btn--primary"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
