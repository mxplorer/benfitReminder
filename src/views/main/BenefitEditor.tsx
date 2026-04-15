import { useState } from "react";
import type { Benefit, BenefitCategory, CalendarPeriod, ResetType } from "../../models/types";
import { useCardStore } from "../../stores/useCardStore";
import "./BenefitEditor.css";

interface BenefitEditorProps {
  cardId: string;
  /** If provided, pre-fills form for editing */
  benefit?: Benefit;
  onDone: () => void;
}

interface FormState {
  name: string;
  description: string;
  faceValue: string;
  category: BenefitCategory;
  resetType: ResetType;
  // calendar
  period: CalendarPeriod;
  applicableMonths: number[];
  // since_last_use
  cooldownDays: string;
  // subscription
  autoRecur: boolean;
  // one_time
  expiresDate: string;
  // rollover (calendar only)
  rolloverable: boolean;
  rolloverMaxYears: string;
  // anniversary
  resetsAtStatementClose: boolean;
}

const CATEGORIES: BenefitCategory[] = [
  "airline", "hotel", "dining", "travel", "streaming",
  "shopping", "wellness", "transportation", "entertainment", "other",
];

const RESET_TYPES: { value: ResetType; label: string }[] = [
  { value: "calendar", label: "日历周期" },
  { value: "anniversary", label: "周年" },
  { value: "since_last_use", label: "距上次使用" },
  { value: "subscription", label: "订阅" },
  { value: "one_time", label: "一次性" },
];

const CALENDAR_PERIODS: { value: CalendarPeriod; label: string }[] = [
  { value: "monthly", label: "每月" },
  { value: "quarterly", label: "每季度" },
  { value: "semi_annual", label: "半年" },
  { value: "annual", label: "每年" },
  { value: "every_4_years", label: "每4年" },
];

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const toFormState = (benefit?: Benefit): FormState => ({
  name: benefit?.name ?? "",
  description: benefit?.description ?? "",
  faceValue: String(benefit?.faceValue ?? ""),
  category: benefit?.category ?? "other",
  resetType: benefit?.resetType ?? "calendar",
  period: benefit?.resetConfig.period ?? "monthly",
  applicableMonths: benefit?.resetConfig.applicableMonths ?? [],
  cooldownDays: String(benefit?.resetConfig.cooldownDays ?? ""),
  autoRecur: benefit?.autoRecur ?? false,
  expiresDate: benefit?.resetConfig.expiresDate ?? "",
  rolloverable: benefit?.rolloverable ?? false,
  rolloverMaxYears: String(benefit?.rolloverMaxYears ?? 2),
  resetsAtStatementClose: benefit?.resetConfig.resetsAtStatementClose ?? false,
});

export const BenefitEditor = ({ cardId, benefit, onDone }: BenefitEditorProps) => {
  const addBenefit = useCardStore((s) => s.addBenefit);
  const updateCard = useCardStore((s) => s.updateCard);
  const cards = useCardStore((s) => s.cards);
  const [form, setForm] = useState<FormState>(toFormState(benefit));
  const isEdit = !!benefit;
  const cardStatementClosingDay = cards.find((c) => c.id === cardId)?.statementClosingDay;

  const handleChange = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const toggleMonth = (month: number) => {
    setForm((f) => {
      const months = f.applicableMonths.includes(month)
        ? f.applicableMonths.filter((m) => m !== month)
        : [...f.applicableMonths, month].sort((a, b) => a - b);
      return { ...f, applicableMonths: months };
    });
  };

  const buildBenefit = (): Benefit => {
    const resetConfig: Benefit["resetConfig"] = {};
    if (form.resetType === "calendar") {
      resetConfig.period = form.period;
      if (form.applicableMonths.length > 0) {
        resetConfig.applicableMonths = form.applicableMonths;
      }
    } else if (form.resetType === "since_last_use") {
      resetConfig.cooldownDays = Number(form.cooldownDays);
    } else if (form.resetType === "one_time" && form.expiresDate) {
      resetConfig.expiresDate = form.expiresDate;
    } else if (form.resetType === "anniversary" && form.resetsAtStatementClose) {
      resetConfig.resetsAtStatementClose = true;
    }

    return {
      id: benefit?.id ?? crypto.randomUUID(),
      name: form.name,
      description: form.description,
      faceValue: Number(form.faceValue),
      category: form.category,
      resetType: form.resetType,
      resetConfig,
      isHidden: benefit?.isHidden ?? false,
      autoRecur: form.resetType === "subscription" ? form.autoRecur : false,
      rolloverable: form.resetType === "calendar" ? form.rolloverable : false,
      rolloverMaxYears: form.rolloverable ? Number(form.rolloverMaxYears) : 2,
      usageRecords: benefit?.usageRecords ?? [],
    };
  };

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    const built = buildBenefit();

    if (isEdit) {
      const card = cards.find((c) => c.id === cardId);
      if (!card) return;
      const updatedBenefits = card.benefits.map((b) => (b.id === benefit.id ? built : b));
      updateCard(cardId, { benefits: updatedBenefits });
    } else {
      addBenefit(cardId, built);
    }
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} data-testid="benefit-editor" className="benefit-editor">
      <label>
        名称
        <input
          value={form.name}
          onChange={(e) => { handleChange("name", e.target.value); }}
          required
          data-testid="name-input"
        />
      </label>

      <label>
        描述
        <input
          value={form.description}
          onChange={(e) => { handleChange("description", e.target.value); }}
          data-testid="description-input"
        />
      </label>

      <label>
        面值 ($)
        <input
          type="number"
          value={form.faceValue}
          onChange={(e) => { handleChange("faceValue", e.target.value); }}
          required
          data-testid="face-value-input"
        />
      </label>

      <label>
        分类
        <select
          value={form.category}
          onChange={(e) => { handleChange("category", e.target.value as BenefitCategory); }}
          data-testid="category-select"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label>
        重置类型
        <select
          value={form.resetType}
          onChange={(e) => { handleChange("resetType", e.target.value as ResetType); }}
          data-testid="reset-type-select"
        >
          {RESET_TYPES.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {form.resetType === "calendar" && (
        <div data-testid="calendar-fields">
          <label>
            周期
            <select
              value={form.period}
              onChange={(e) => { handleChange("period", e.target.value as CalendarPeriod); }}
              data-testid="period-select"
            >
              {CALENDAR_PERIODS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div data-testid="applicable-months">
            <span>适用月份（留空=全年）</span>
            {ALL_MONTHS.map((m) => (
              <label key={m}>
                <input
                  type="checkbox"
                  checked={form.applicableMonths.includes(m)}
                  onChange={() => { toggleMonth(m); }}
                />
                {m}月
              </label>
            ))}
          </div>
          <label data-testid="rollover-field">
            <input
              type="checkbox"
              checked={form.rolloverable}
              onChange={(e) => { handleChange("rolloverable", e.target.checked); }}
              data-testid="rollover-input"
            />
            可累积 (Rollover)
          </label>
          {form.rolloverable && (
            <label>
              累积上限 (年)
              <input
                type="number"
                min="1"
                max="10"
                value={form.rolloverMaxYears}
                onChange={(e) => { handleChange("rolloverMaxYears", e.target.value); }}
                data-testid="rollover-max-years-input"
              />
            </label>
          )}
        </div>
      )}

      {form.resetType === "anniversary" && (
        <label data-testid="resets-at-statement-close-field">
          <input
            type="checkbox"
            checked={form.resetsAtStatementClose}
            onChange={(e) => { handleChange("resetsAtStatementClose", e.target.checked); }}
            disabled={cardStatementClosingDay === undefined}
            data-testid="resets-at-statement-close"
          />
          按账单结算日对齐周期
          {cardStatementClosingDay === undefined && (
            <span className="hint"> (请先在卡片编辑器中设置账单结算日)</span>
          )}
        </label>
      )}

      {form.resetType === "since_last_use" && (
        <label data-testid="cooldown-field">
          冷却天数
          <input
            type="number"
            value={form.cooldownDays}
            onChange={(e) => { handleChange("cooldownDays", e.target.value); }}
            data-testid="cooldown-input"
          />
        </label>
      )}

      {form.resetType === "subscription" && (
        <label data-testid="auto-recur-field">
          <input
            type="checkbox"
            checked={form.autoRecur}
            onChange={(e) => { handleChange("autoRecur", e.target.checked); }}
            data-testid="auto-recur-input"
          />
          自动续期
        </label>
      )}

      {form.resetType === "one_time" && (
        <label data-testid="expires-date-field">
          到期日（可选）
          <input
            type="date"
            value={form.expiresDate}
            onChange={(e) => { handleChange("expiresDate", e.target.value); }}
            data-testid="expires-date-input"
          />
        </label>
      )}

      <button type="submit" data-testid="submit-btn">
        {isEdit ? "保存" : "添加"}
      </button>
      <button type="button" onClick={onDone}>
        取消
      </button>
    </form>
  );
};
