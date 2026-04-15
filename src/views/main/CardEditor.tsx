import { useState, useRef, useEffect, useCallback } from "react";
import type { CreditCard } from "../../models/types";
import { useCardTypeStore } from "../../stores/useCardTypeStore";
import { useCardStore } from "../../stores/useCardStore";
import { getMetrics } from "../../lib/transports";
import "./CardEditor.css";

// ─── Rolling Drum Picker ────────────────────────────────────────────────────

interface RollingColumnProps {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

const ITEM_HEIGHT = 36; // px, matches CSS --rolling-item-h

const RollingColumn = ({ items, selectedIndex, onSelect }: RollingColumnProps) => {
  const listRef = useRef<HTMLUListElement>(null);
  // Track whether a scroll event came from a user gesture vs. programmatic scroll
  const isProgrammatic = useRef(false);

  // Scroll to selected item without triggering onSelect feedback loop
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    isProgrammatic.current = true;
    if (typeof el.scrollTo === "function") {
      el.scrollTo({ top: selectedIndex * ITEM_HEIGHT, behavior: "smooth" });
    } else {
      el.scrollTop = selectedIndex * ITEM_HEIGHT;
    }
  }, [selectedIndex]);

  const handleScroll = useCallback(() => {
    if (isProgrammatic.current) {
      isProgrammatic.current = false;
      return;
    }
    const el = listRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
    if (idx !== selectedIndex && idx >= 0 && idx < items.length) {
      onSelect(idx);
    }
  }, [items.length, onSelect, selectedIndex]);

  return (
    <div className="rolling-col">
      <div className="rolling-col__highlight" />
      <ul
        ref={listRef}
        className="rolling-col__list"
        onScroll={handleScroll}
        data-testid="rolling-col-list"
      >
        {/* top padding item so first real item can land in the center window */}
        <li className="rolling-col__pad" aria-hidden="true" />
        {items.map((item, i) => (
          <li
            key={item}
            className={`rolling-col__item${i === selectedIndex ? " rolling-col__item--selected" : ""}`}
            onClick={() => { onSelect(i); }}
          >
            {item}
          </li>
        ))}
        {/* bottom padding item */}
        <li className="rolling-col__pad" aria-hidden="true" />
      </ul>
    </div>
  );
};

interface RollingDatePickerProps {
  value: string; // YYYY-MM-DD or ""
  onChange: (value: string) => void;
}

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: currentYear - 2009 }, (_, i) => String(2010 + i));
const MONTHS = ["01","02","03","04","05","06","07","08","09","10","11","12"];
const MONTH_LABELS = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];

const daysInMonth = (year: number, month: number) =>
  new Date(year, month, 0).getDate(); // month is 1-based here

const parseDateString = (v: string): [number, number, number] => {
  // Returns [yearIndex, monthIndex, dayIndex] or sensible defaults
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const parts = v.split("-").map(Number);
    const [y, m, d] = [parts[0] ?? 2010, parts[1] ?? 1, parts[2] ?? 1];
    const yi = YEARS.indexOf(String(y));
    return [yi >= 0 ? yi : YEARS.length - 1, m - 1, d - 1];
  }
  return [YEARS.length - 1, 0, 0];
};

const RollingDatePicker = ({ value, onChange }: RollingDatePickerProps) => {
  const [yi, setYi] = useState(() => parseDateString(value)[0]);
  const [mi, setMi] = useState(() => parseDateString(value)[1]);
  const [di, setDi] = useState(() => parseDateString(value)[2]);

  const year = Number(YEARS[yi]);
  const month = mi + 1; // 1-based
  const maxDay = daysInMonth(year, month);
  const days = Array.from({ length: maxDay }, (_, i) => String(i + 1).padStart(2, "0"));

  // Clamp day when month/year changes reduce max days
  const safeDi = Math.min(di, maxDay - 1);

  const emit = useCallback((newYi: number, newMi: number, newDi: number) => {
    const y = YEARS[newYi];
    const m = MONTHS[newMi];
    const maxD = daysInMonth(Number(y), newMi + 1);
    const clampedDi = Math.min(newDi, maxD - 1);
    const d = String(clampedDi + 1).padStart(2, "0");
    onChange(`${y}-${m}-${d}`);
  }, [onChange]);

  // Sync form state with the picker's initial/resolved value on mount
  useEffect(() => {
    emit(yi, mi, safeDi);
  // Only run on mount — yi/mi/safeDi are stable at this point
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleYear = (i: number) => { setYi(i); emit(i, mi, safeDi); };
  const handleMonth = (i: number) => { setMi(i); emit(yi, i, safeDi); };
  const handleDay = (i: number) => { setDi(i); emit(yi, mi, i); };

  // Sync safeDi back when it gets clamped
  useEffect(() => {
    if (safeDi !== di) setDi(safeDi);
  }, [safeDi, di]);

  return (
    <div className="rolling-picker" data-testid="open-date-input">
      <RollingColumn items={YEARS} selectedIndex={yi} onSelect={handleYear} />
      <RollingColumn items={MONTH_LABELS} selectedIndex={mi} onSelect={handleMonth} />
      <RollingColumn items={days} selectedIndex={safeDi} onSelect={handleDay} />
    </div>
  );
};

// ─── Card Face Preview ──────────────────────────────────────────────────────

interface CardFacePreviewProps {
  color: string;
  image?: string;
  onColorChange: (color: string) => void;
}

const CardFacePreview = ({ color, image, onColorChange }: CardFacePreviewProps) => {
  const colorRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className="card-face-preview"
      style={{ backgroundColor: color }}
      onClick={() => { if (!image) colorRef.current?.click(); }}
      data-testid="card-face-preview"
    >
      {image ? (
        <img
          src={image}
          alt="卡面"
          className="card-face-preview__img"
          draggable={false}
        />
      ) : (
        <span className="card-face-preview__hint">点击选色</span>
      )}
      {!image && (
        <input
          ref={colorRef}
          type="color"
          value={color}
          onChange={(e) => { onColorChange(e.target.value); }}
          className="card-face-preview__color-input"
          data-testid="color-input"
          tabIndex={-1}
        />
      )}
    </div>
  );
};

// ─── Card Editor ─────────────────────────────────────────────────────────────

interface CardEditorProps {
  /** If provided, pre-fills the form for editing */
  card?: CreditCard;
  onDone: () => void;
}

interface FormState {
  templateSlug: string;
  owner: string;
  alias: string;
  cardNumber: string;
  annualFee: string;
  cardOpenDate: string;
  color: string;
  statementClosingDay: string;
}

const toFormState = (card?: CreditCard): FormState => ({
  templateSlug: card?.cardTypeSlug ?? "",
  owner: card?.owner ?? "",
  alias: card?.alias ?? "",
  cardNumber: card?.cardNumber ?? "",
  annualFee: String(card?.annualFee ?? ""),
  cardOpenDate: card?.cardOpenDate ?? "",
  color: card?.color ?? "#8E9EAF",
  statementClosingDay: card?.statementClosingDay?.toString() ?? "",
});

const parseStatementClosingDay = (raw: string): number | undefined => {
  if (raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  const clamped = Math.min(31, Math.max(1, Math.trunc(n)));
  return clamped;
};

export const CardEditor = ({ card, onDone }: CardEditorProps) => {
  const addCard = useCardStore((s) => s.addCard);
  const updateCard = useCardStore((s) => s.updateCard);
  const cardTypes = useCardTypeStore((s) => s.cardTypes);
  const [form, setForm] = useState<FormState>(toFormState(card));
  const isEdit = !!card;

  const handleTemplateChange = (slug: string) => {
    const template = cardTypes.find((t) => t.slug === slug);
    if (template) {
      setForm((f) => ({
        ...f,
        templateSlug: slug,
        annualFee: String(template.defaultAnnualFee),
        color: template.color,
      }));
    } else {
      setForm((f) => ({ ...f, templateSlug: slug }));
    }
  };

  const handleChange = (field: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();

    const statementClosingDay = parseStatementClosingDay(form.statementClosingDay);

    if (isEdit) {
      updateCard(card.id, {
        owner: form.owner,
        alias: form.alias || undefined,
        cardNumber: form.cardNumber || undefined,
        annualFee: Number(form.annualFee),
        cardOpenDate: form.cardOpenDate,
        color: form.color,
        statementClosingDay,
      });
    } else {
      const template = cardTypes.find((t) => t.slug === form.templateSlug);
      const newCard: CreditCard = {
        id: crypto.randomUUID(),
        owner: form.owner,
        cardTypeSlug: form.templateSlug,
        alias: form.alias || undefined,
        cardNumber: form.cardNumber || undefined,
        annualFee: Number(form.annualFee),
        cardOpenDate: form.cardOpenDate,
        color: form.color,
        isEnabled: true,
        statementClosingDay,
        benefits: template
          ? template.defaultBenefits.map((b) => ({
              ...b,
              id: crypto.randomUUID(),
              isHidden: false,
              autoRecur: false,
              rolloverable: b.rolloverable ?? false,
              rolloverMaxYears: b.rolloverMaxYears ?? 2,
              usageRecords: [],
            }))
          : [],
      };
      addCard(newCard);
      try {
        getMetrics().count("card.added");
      } catch {
        // metrics not initialized in test environment
      }
    }
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} data-testid="card-editor" className="card-editor">
      <label>
        卡片类型
        <select
          value={form.templateSlug}
          onChange={(e) => { handleTemplateChange(e.target.value); }}
          data-testid="template-select"
        >
          <option value="">自定义</option>
          {cardTypes.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        持卡人
        <input
          value={form.owner}
          onChange={(e) => { handleChange("owner", e.target.value); }}
          placeholder="姓名"
          required
          data-testid="owner-input"
        />
      </label>

      <label>
        别名
        <input
          value={form.alias}
          onChange={(e) => { handleChange("alias", e.target.value); }}
          placeholder="显示别名（可选）"
          data-testid="alias-input"
        />
      </label>

      <label>
        卡号后4位
        <input
          value={form.cardNumber}
          onChange={(e) => { handleChange("cardNumber", e.target.value); }}
          placeholder="后4位"
          maxLength={4}
          data-testid="card-number-input"
        />
      </label>

      <label>
        年费
        <input
          type="number"
          value={form.annualFee}
          onChange={(e) => { handleChange("annualFee", e.target.value); }}
          required
          data-testid="annual-fee-input"
        />
      </label>

      <label>
        开卡日期
        <RollingDatePicker
          value={form.cardOpenDate}
          onChange={(v) => { handleChange("cardOpenDate", v); }}
        />
      </label>

      <label>
        账单结算日 (1-31，可选)
        <input
          type="number"
          min={1}
          max={31}
          value={form.statementClosingDay}
          onChange={(e) => { handleChange("statementClosingDay", e.target.value); }}
          data-testid="statement-closing-day-input"
          placeholder="例如 7"
        />
      </label>

      <label>
        卡面
        <CardFacePreview
          color={form.color}
          image={cardTypes.find((t) => t.slug === form.templateSlug)?.image}
          onColorChange={(c) => { handleChange("color", c); }}
        />
      </label>

      <button type="submit" data-testid="submit-btn">
        {isEdit ? "保存" : "添加"}
      </button>
      <button type="button" onClick={onDone}>
        取消
      </button>
    </form>
  );
};
