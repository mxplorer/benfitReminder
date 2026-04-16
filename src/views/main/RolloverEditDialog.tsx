import { useMemo, useState } from "react";
import type { Benefit, CalendarPeriod, CreditCard } from "../../models/types";
import { createLogger } from "../../lib/logger";
import { useCardStore } from "../../stores/useCardStore";
import { cycleStartForDate } from "../../utils/usageRecords";
import { generateRolloverRecords } from "../../utils/rollover";
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
  const pastRolloverCount = useMemo(
    () =>
      benefit.usageRecords.filter(
        (r) => r.kind === "rollover" && r.usedDate < currentCycleStart,
      ).length,
    [benefit.usageRecords, currentCycleStart],
  );
  const [amount, setAmount] = useState<number>(pastRolloverCount * benefit.faceValue);

  const previewRecords = useMemo(
    () => generateRolloverRecords(benefit, amount, today),
    [benefit, amount, today],
  );

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
            value={amount}
            onChange={(e) => { setAmount(Math.max(0, Number(e.target.value) || 0)); }}
          />
        </label>
        <div className="rollover-dialog__preview-section">
          <span className="rollover-dialog__preview-label">
            Preview (past-cycle rollover records):
          </span>
          <ul className="rollover-dialog__preview" data-testid="rollover-edit-preview">
            {previewRecords.map((r) => (
              <li key={r.usedDate}>
                {r.usedDate} · rollover · $0
              </li>
            ))}
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
