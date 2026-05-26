import { useMemo, useState } from "react";
import type { KeyboardEventHandler } from "react";
import type { Benefit, CreditCard } from "../../models/types";
import { NOTE_MAX_LENGTH } from "../../models/types";
import { useCardStore } from "../../stores/useCardStore";
import { useToday } from "../../stores/useToday";
import {
  currentCycleKey,
  cycleKeyLabel,
  cycleKeySortValue,
} from "../../utils/cycleKey";
import "./NoteEditor.css";

interface NoteEditorProps {
  benefit: Benefit;
  card: CreditCard;
  onClose: () => void;
}

const showsCycleSection = (b: Benefit): boolean =>
  b.resetType !== "one_time" && b.resetType !== "since_last_use";

export const NoteEditor = ({ benefit, card, onClose }: NoteEditorProps) => {
  const today = useToday();
  const setBenefitNote = useCardStore((s) => s.setBenefitNote);
  const setBenefitCycleNote = useCardStore((s) => s.setBenefitCycleNote);

  const cycleKey = useMemo(
    () => currentCycleKey(today, benefit, card.cardOpenDate) ?? null,
    [today, benefit, card.cardOpenDate],
  );
  const showCycle = showsCycleSection(benefit) && cycleKey !== null;

  const initialCycleValue = (cycleKey && benefit.cycleNotes?.[cycleKey]) ?? "";
  const initialGenericValue = benefit.note ?? "";

  const [cycleDraft, setCycleDraft] = useState(initialCycleValue);
  const [genericDraft, setGenericDraft] = useState(initialGenericValue);
  const [historyOpen, setHistoryOpen] = useState(false);

  const dirty =
    cycleDraft !== initialCycleValue || genericDraft !== initialGenericValue;

  const history = useMemo(() => {
    const entries = Object.entries(benefit.cycleNotes ?? {})
      .filter(([k]) => k !== cycleKey)
      .map(([k, v]) => ({ key: k, value: v }));
    entries.sort((a, b) => cycleKeySortValue(b.key) - cycleKeySortValue(a.key));
    return entries;
  }, [benefit.cycleNotes, cycleKey]);

  const handleSave = () => {
    if (showCycle && cycleKey && cycleDraft !== initialCycleValue) {
      setBenefitCycleNote(card.id, benefit.id, cycleKey, cycleDraft);
    }
    if (genericDraft !== initialGenericValue) {
      setBenefitNote(card.id, benefit.id, genericDraft);
    }
    onClose();
  };

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === "Escape") onClose();
  };

  return (
    <div className="note-editor" onKeyDown={handleKeyDown}>
      {showCycle && cycleKey && (
        <div>
          <div className="note-editor__section-label">
            <span>
              本周期备注
              <span className="note-editor__section-label-sub">
                {" "}· {cycleKeyLabel(cycleKey)}
              </span>
            </span>
          </div>
          <textarea
            className="note-editor__textarea"
            value={cycleDraft}
            onChange={(e) => { setCycleDraft(e.target.value); }}
            maxLength={NOTE_MAX_LENGTH}
            rows={4}
            aria-label="本周期备注"
          />
          <div
            className={`note-editor__counter${
              cycleDraft.length >= NOTE_MAX_LENGTH - 20
                ? " note-editor__counter--warning"
                : ""
            }`}
          >
            {String(cycleDraft.length)} / {String(NOTE_MAX_LENGTH)}
          </div>
        </div>
      )}

      <div>
        <div className="note-editor__section-label">
          <span>通用备注</span>
        </div>
        <textarea
          className="note-editor__textarea"
          value={genericDraft}
          onChange={(e) => { setGenericDraft(e.target.value); }}
          maxLength={NOTE_MAX_LENGTH}
          rows={4}
          aria-label="通用备注"
        />
        <div
          className={`note-editor__counter${
            genericDraft.length >= NOTE_MAX_LENGTH - 20
              ? " note-editor__counter--warning"
              : ""
          }`}
        >
          {String(genericDraft.length)} / {String(NOTE_MAX_LENGTH)}
        </div>
      </div>

      {history.length > 0 && (
        <div>
          <button
            type="button"
            className="note-editor__history-toggle"
            onClick={() => { setHistoryOpen((o) => !o); }}
            aria-expanded={historyOpen}
          >
            {historyOpen ? "▾" : "▸"} 查看历史周期备注 ({String(history.length)})
          </button>
          {historyOpen && (
            <ul className="note-editor__history">
              {history.map((h) => (
                <li key={h.key} className="note-editor__history-item">
                  <span className="note-editor__history-cycle">
                    {cycleKeyLabel(h.key)}
                  </span>
                  <span>{h.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="note-editor__actions">
        <button type="button" onClick={onClose}>取消</button>
        <button type="button" onClick={handleSave} disabled={!dirty}>
          保存
        </button>
      </div>
    </div>
  );
};
