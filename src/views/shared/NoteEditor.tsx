import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEventHandler, RefObject } from "react";
import { createPortal } from "react-dom";
import type { Benefit, CreditCard } from "../../models/types";
import { NOTE_MAX_LENGTH } from "../../models/types";
import { useCardStore } from "../../stores/useCardStore";
import { useToday } from "../../stores/useToday";
import {
  currentCycleKey,
  cycleKeyLabel,
  cycleKeySortValue,
} from "../../utils/cycleKey";
import { resolveGenericNote, sharedNoteKey } from "../../utils/benefitNote";
import "./NoteEditor.css";

interface NoteEditorProps {
  benefit: Benefit;
  card: CreditCard;
  /** Ref to the trigger element. Used to position the floating popover; when
   * absent (e.g. unit tests) the popover renders near the top of the viewport. */
  anchorRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
}

const showsCycleSection = (b: Benefit): boolean =>
  b.resetType !== "one_time" && b.resetType !== "since_last_use";

// Used to decide whether the popover flips above the anchor when there isn't
// enough room below. A conservative estimate covers the worst case (both
// textareas + history toggle + actions).
const ESTIMATED_HEIGHT = 360;
const WIDTH = 340;
const GAP = 6;
const EDGE_PADDING = 8;
const WARNING_THRESHOLD = NOTE_MAX_LENGTH - 20;
const COUNTER_THRESHOLD = Math.floor(NOTE_MAX_LENGTH * 0.8);

export const NoteEditor = ({ benefit, card, anchorRef, onClose }: NoteEditorProps) => {
  const today = useToday();
  const setBenefitNote = useCardStore((s) => s.setBenefitNote);
  const setSharedBenefitNote = useCardStore((s) => s.setSharedBenefitNote);
  const sharedBenefitNotes = useCardStore((s) => s.sharedBenefitNotes);
  const setBenefitCycleNote = useCardStore((s) => s.setBenefitCycleNote);
  const isShared = sharedNoteKey(benefit) !== null;
  const popoverRef = useRef<HTMLDivElement>(null);

  const cycleKey = useMemo(
    () => currentCycleKey(today, benefit, card.cardOpenDate) ?? null,
    [today, benefit, card.cardOpenDate],
  );
  const showCycle = showsCycleSection(benefit) && cycleKey !== null;

  const initialCycleValue = (cycleKey && benefit.cycleNotes?.[cycleKey]) ?? "";
  const initialGenericValue = resolveGenericNote(benefit, sharedBenefitNotes);

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

  // Anchor the popover under the trigger; flip above when there isn't enough
  // viewport room, and clamp horizontally so it never escapes the window.
  // We mutate the DOM directly here instead of using state so positioning
  // happens before paint without triggering an extra render.
  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;
    const anchorEl = anchorRef?.current ?? null;
    let top: number;
    let left: number;
    if (!anchorEl) {
      top = 40;
      left = Math.max(EDGE_PADDING, window.innerWidth / 2 - WIDTH / 2);
    } else {
      const rect = anchorEl.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const placeAbove = spaceBelow < ESTIMATED_HEIGHT && rect.top > ESTIMATED_HEIGHT;
      top = placeAbove ? rect.top - ESTIMATED_HEIGHT - GAP : rect.bottom + GAP;
      left = rect.right - WIDTH;
      if (left < EDGE_PADDING) left = EDGE_PADDING;
      if (left + WIDTH > window.innerWidth - EDGE_PADDING) {
        left = window.innerWidth - WIDTH - EDGE_PADDING;
      }
    }
    popover.style.top = `${String(top)}px`;
    popover.style.left = `${String(left)}px`;
    popover.style.visibility = "visible";
  }, [anchorRef]);

  // Close on outside click. Defer attaching the handler so the click that
  // opened the popover doesn't immediately close it.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!popoverRef.current) return;
      const target = e.target as Node;
      if (popoverRef.current.contains(target)) return;
      const anchorEl = anchorRef?.current ?? null;
      if (anchorEl?.contains(target)) return;
      onClose();
    };
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", handler);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", handler);
    };
  }, [anchorRef, onClose]);

  const handleSave = () => {
    if (showCycle && cycleKey && cycleDraft !== initialCycleValue) {
      setBenefitCycleNote(card.id, benefit.id, cycleKey, cycleDraft);
    }
    if (genericDraft !== initialGenericValue) {
      const key = sharedNoteKey(benefit);
      if (key !== null) {
        setSharedBenefitNote(key, genericDraft);
      } else {
        setBenefitNote(card.id, benefit.id, genericDraft);
      }
    }
    onClose();
  };

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  };

  const renderCounter = (len: number) =>
    len >= COUNTER_THRESHOLD ? (
      <div
        className={`note-popover__counter${
          len >= WARNING_THRESHOLD ? " note-popover__counter--warning" : ""
        }`}
      >
        {String(len)} / {String(NOTE_MAX_LENGTH)}
      </div>
    ) : null;

  const node = (
    <div
      ref={popoverRef}
      className="note-popover"
      role="dialog"
      aria-label="编辑备注"
      onKeyDown={handleKeyDown}
      style={{ visibility: "hidden" }}
    >
      {showCycle && cycleKey && (
        <section className="note-popover__section">
          <div className="note-popover__label">
            <span>本周期备注</span>
            <span className="note-popover__label-sub">{cycleKeyLabel(cycleKey)}</span>
          </div>
          <textarea
            className="note-popover__textarea"
            value={cycleDraft}
            onChange={(e) => { setCycleDraft(e.target.value); }}
            maxLength={NOTE_MAX_LENGTH}
            rows={3}
            aria-label="本周期备注"
            placeholder="这个周期想记的事…"
            autoFocus
          />
          {renderCounter(cycleDraft.length)}
        </section>
      )}

      <section className="note-popover__section">
        <div className="note-popover__label">
          <span>通用备注</span>
          {isShared && <span className="note-popover__label-sub">同类卡通用</span>}
        </div>
        <textarea
          className="note-popover__textarea"
          value={genericDraft}
          onChange={(e) => { setGenericDraft(e.target.value); }}
          maxLength={NOTE_MAX_LENGTH}
          rows={3}
          aria-label="通用备注"
          placeholder="任何时候都用得到的事…"
        />
        {renderCounter(genericDraft.length)}
      </section>

      {history.length > 0 && (
        <section className="note-popover__history-section">
          <button
            type="button"
            className="note-popover__history-toggle"
            onClick={() => { setHistoryOpen((o) => !o); }}
            aria-expanded={historyOpen}
          >
            <span className="note-popover__chevron" aria-hidden="true">
              {historyOpen ? "▾" : "▸"}
            </span>
            查看历史周期备注 ({String(history.length)})
          </button>
          {historyOpen && (
            <ul className="note-popover__history">
              {history.map((h) => (
                <li key={h.key} className="note-popover__history-item">
                  <div className="note-popover__history-cycle">
                    {cycleKeyLabel(h.key)}
                  </div>
                  <div className="note-popover__history-body">{h.value}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="note-popover__actions">
        <button
          type="button"
          className="note-popover__btn"
          onClick={onClose}
        >
          取消
        </button>
        <button
          type="button"
          className="note-popover__btn note-popover__btn--primary"
          onClick={handleSave}
          disabled={!dirty}
        >
          保存
        </button>
      </div>
    </div>
  );

  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
};
