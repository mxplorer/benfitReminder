import { useState } from "react";
import type { UsageRecord } from "../../models/types";
import { useCardStore } from "../../stores/useCardStore";
import { UsageRecordEditDialog } from "./UsageRecordEditDialog";
import "./BenefitHistoryDialog.css";

interface BenefitHistoryDialogProps {
  cardId: string;
  benefitId: string;
  onClose: () => void;
}

interface IndexedRecord {
  record: UsageRecord;
  originalIndex: number;
}

export const BenefitHistoryDialog = ({
  cardId,
  benefitId,
  onClose,
}: BenefitHistoryDialogProps) => {
  const cards = useCardStore((s) => s.cards);
  const removeBenefitUsageRecord = useCardStore((s) => s.removeBenefitUsageRecord);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const card = cards.find((c) => c.id === cardId);
  const benefit = card?.benefits.find((b) => b.id === benefitId);

  if (!card || !benefit) return null;

  const indexed: IndexedRecord[] = benefit.usageRecords
    .map((record, originalIndex) => ({ record, originalIndex }))
    .sort((a, b) => b.record.usedDate.localeCompare(a.record.usedDate));

  const handleDelete = (originalIndex: number) => {
    if (!window.confirm("确定删除这条使用记录？")) return;
    removeBenefitUsageRecord(cardId, benefitId, originalIndex);
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const editingRecord: IndexedRecord | null =
    editingIndex !== null
      ? (indexed.find((r) => r.originalIndex === editingIndex) ??
         (benefit.usageRecords[editingIndex]
           ? { record: benefit.usageRecords[editingIndex], originalIndex: editingIndex }
           : null))
      : null;

  return (
    <>
      <div
        className="benefit-history-dialog__overlay"
        data-testid="benefit-history-dialog-overlay"
        onClick={handleOverlayClick}
      >
        <div
          className="benefit-history-dialog"
          role="dialog"
          aria-label="使用记录"
          data-testid="benefit-history-dialog"
        >
          <div className="benefit-history-dialog__head">
            <h2 className="benefit-history-dialog__title">使用记录</h2>
            <span className="benefit-history-dialog__subtitle">{benefit.name}</span>
          </div>

          {indexed.length === 0 ? (
            <p className="benefit-history-dialog__empty">暂无使用记录</p>
          ) : (
            <table className="benefit-history-dialog__table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>面值</th>
                  <th>实际</th>
                  <th aria-label="操作" />
                </tr>
              </thead>
              <tbody>
                {indexed.map(({ record, originalIndex }) => {
                  const isRollover = record.kind === "rollover";
                  return (
                    <tr
                      key={`${String(originalIndex)}-${record.usedDate}`}
                      data-testid="benefit-history-row"
                      data-record-index={String(originalIndex)}
                    >
                      <td>{record.usedDate}</td>
                      <td>
                        ${String(record.faceValue)}
                        {isRollover && (
                          <span className="benefit-history-dialog__tag">结转</span>
                        )}
                      </td>
                      <td>${String(record.actualValue)}</td>
                      <td className="benefit-history-dialog__row-actions">
                        <button
                          type="button"
                          className="benefit-history-dialog__row-btn"
                          aria-label="编辑"
                          onClick={() => { setEditingIndex(originalIndex); }}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="benefit-history-dialog__row-btn benefit-history-dialog__row-btn--danger"
                          aria-label="删除"
                          onClick={() => { handleDelete(originalIndex); }}
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

          <div className="benefit-history-dialog__footer">
            <button
              type="button"
              className="benefit-history-dialog__close-btn"
              onClick={onClose}
              aria-label="关闭"
            >
              关闭
            </button>
          </div>
        </div>
      </div>

      {editingRecord && (
        <UsageRecordEditDialog
          cardId={cardId}
          benefitId={benefitId}
          recordIndex={editingRecord.originalIndex}
          record={editingRecord.record}
          benefit={benefit}
          onClose={() => { setEditingIndex(null); }}
        />
      )}
    </>
  );
};
