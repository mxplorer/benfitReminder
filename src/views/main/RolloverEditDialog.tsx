import { useMemo } from "react";
import type { Benefit, CalendarPeriod, CreditCard } from "../../models/types";
import { createLogger } from "../../lib/logger";
import { useToday } from "../../stores/useToday";
import { useCardStore } from "../../stores/useCardStore";
import { cycleStartForDate } from "../../utils/usageRecords";
import { getAvailableValue } from "../../utils/rollover";
import "./RolloverEditDialog.css";

const logger = createLogger("views.rollover-dialog");

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

  return <Inner card={card} benefit={benefit} period={period} onClose={onClose} />;
};

interface InnerProps extends RolloverEditDialogProps {
  period: CalendarPeriod;
}

const Inner = ({ card, benefit, period, onClose }: InnerProps) => {
  const today = useToday();
  const currentCycleStart = useMemo(() => cycleStartForDate(today, period), [today, period]);
  const toggleCurrentCycleRollover = useCardStore((s) => s.toggleCurrentCycleRollover);

  const hasRollover = benefit.usageRecords.some(
    (r) => r.kind === "rollover" && r.usedDate === currentCycleStart,
  );
  const available = getAvailableValue(benefit, today);
  // Preview: next cycle's totalFace = its own face + what this cycle rolls out.
  // When a rollover already exists, "available" is 0 (outbound is consumed) —
  // we reconstruct the rolled amount from the record's faceValue.
  const rolledAmount = hasRollover
    ? benefit.usageRecords
        .filter((r) => r.kind === "rollover" && r.usedDate === currentCycleStart)
        .reduce((s, r) => s + r.faceValue, 0)
    : available;
  const nextCycleTotalFace = benefit.faceValue + rolledAmount;

  const handleToggle = () => {
    toggleCurrentCycleRollover(card.id, benefit.id);
    onClose();
  };

  return (
    <div className="rollover-dialog__overlay">
      <div className="rollover-dialog">
        <h2 className="rollover-dialog__title">结转 — {benefit.name}</h2>
        <dl className="rollover-dialog__info" data-testid="rollover-edit-impact">
          <div className="rollover-dialog__info-row">
            <dt>本期可用</dt>
            <dd>${String(available)}</dd>
          </div>
          <div className="rollover-dialog__info-row">
            <dt>已结转到本期</dt>
            <dd>${String(rolledAmount)}</dd>
          </div>
          <div className="rollover-dialog__info-row">
            <dt>下期面值（结转后）</dt>
            <dd data-testid="rollover-edit-next-available">${String(nextCycleTotalFace)}</dd>
          </div>
        </dl>
        {!hasRollover && available <= 0 && (
          <p className="rollover-dialog__hint">本期无剩余可结转。</p>
        )}
        <div className="rollover-dialog__actions">
          <button
            type="button"
            className="rollover-dialog__btn"
            onClick={onClose}
          >
            关闭
          </button>
          <button
            type="button"
            className="rollover-dialog__btn rollover-dialog__btn--primary"
            onClick={handleToggle}
            disabled={!hasRollover && available <= 0}
            data-testid="rollover-toggle-btn"
          >
            {hasRollover ? "撤销结转" : `结转 $${String(available)} 到下期`}
          </button>
        </div>
      </div>
    </div>
  );
};
