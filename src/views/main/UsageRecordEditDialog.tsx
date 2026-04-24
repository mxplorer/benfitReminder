import { useState } from "react";
import type { Benefit, UsageRecord } from "../../models/types";
import { useCardStore } from "../../stores/useCardStore";
import "./UsageRecordEditDialog.css";

interface UsageRecordEditDialogProps {
  cardId: string;
  benefitId: string;
  recordIndex: number;
  record: UsageRecord;
  benefit: Benefit;
  onClose: () => void;
}

const isMonthlyLike = (b: Benefit): boolean =>
  b.resetType === "subscription" ||
  (b.resetType === "calendar" && b.resetConfig.period === "monthly");

export const UsageRecordEditDialog = ({
  cardId,
  benefitId,
  recordIndex,
  record,
  benefit,
  onClose,
}: UsageRecordEditDialogProps) => {
  const updateBenefitUsageRecord = useCardStore((s) => s.updateBenefitUsageRecord);
  const removeBenefitUsageRecord = useCardStore((s) => s.removeBenefitUsageRecord);

  const [consumedFace, setConsumedFace] = useState<number>(record.faceValue);
  const [actualValue, setActualValue] = useState<number>(record.actualValue);
  const [usedDate, setUsedDate] = useState<string>(record.usedDate);
  const [propagateNext, setPropagateNext] = useState<boolean>(record.propagateNext === true);

  const showPropagate = isMonthlyLike(benefit);

  const handleSave = () => {
    updateBenefitUsageRecord(cardId, benefitId, recordIndex, {
      consumedFace,
      actualValue,
      usedDate,
      ...(showPropagate ? { propagateNext } : {}),
    });
    onClose();
  };

  const handleDelete = () => {
    if (!window.confirm("确定删除这条使用记录？")) return;
    removeBenefitUsageRecord(cardId, benefitId, recordIndex);
    onClose();
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="usage-record-dialog__overlay"
      data-testid="usage-record-dialog-overlay"
      onClick={handleOverlayClick}
    >
      <div className="usage-record-dialog" role="dialog" aria-label="编辑使用记录">
        <h2 className="usage-record-dialog__title">编辑使用记录</h2>
        <p className="usage-record-dialog__subtitle">{benefit.name}</p>

        <label className="usage-record-dialog__field">
          <span className="usage-record-dialog__field-label">本次面值</span>
          <input
            type="number"
            min={0}
            aria-label="本次面值"
            className="usage-record-dialog__input"
            value={consumedFace}
            onChange={(e) => { setConsumedFace(Math.max(0, Number(e.target.value) || 0)); }}
          />
        </label>

        <label className="usage-record-dialog__field">
          <span className="usage-record-dialog__field-label">实际到手</span>
          <input
            type="number"
            min={0}
            aria-label="实际到手"
            className="usage-record-dialog__input"
            value={actualValue}
            onChange={(e) => { setActualValue(Math.max(0, Number(e.target.value) || 0)); }}
          />
        </label>

        <label className="usage-record-dialog__field">
          <span className="usage-record-dialog__field-label">使用日期</span>
          <input
            type="date"
            aria-label="使用日期"
            className="usage-record-dialog__input"
            value={usedDate}
            onChange={(e) => { setUsedDate(e.target.value); }}
          />
        </label>

        {showPropagate && (
          <label className="usage-record-dialog__checkbox">
            <input
              type="checkbox"
              aria-label="自动续期下月"
              checked={propagateNext}
              onChange={(e) => { setPropagateNext(e.target.checked); }}
            />
            <span>自动续期下月</span>
          </label>
        )}

        <div className="usage-record-dialog__actions">
          <button
            type="button"
            className="usage-record-dialog__btn usage-record-dialog__btn--danger"
            aria-label="删除记录"
            onClick={handleDelete}
          >
            删除记录
          </button>
          <div className="usage-record-dialog__actions-right">
            <button
              type="button"
              className="usage-record-dialog__btn"
              aria-label="取消"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              className="usage-record-dialog__btn usage-record-dialog__btn--primary"
              aria-label="保存"
              onClick={handleSave}
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
