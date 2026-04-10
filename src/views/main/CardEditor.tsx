import { useState } from "react";
import type { CreditCard } from "../../models/types";
import { CARD_TEMPLATES } from "../../models/templates";
import { useCardStore } from "../../stores/useCardStore";
import { getMetrics } from "../../lib/transports";

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
}

const toFormState = (card?: CreditCard): FormState => ({
  templateSlug: card?.cardTypeSlug ?? "",
  owner: card?.owner ?? "",
  alias: card?.alias ?? "",
  cardNumber: card?.cardNumber ?? "",
  annualFee: String(card?.annualFee ?? ""),
  cardOpenDate: card?.cardOpenDate ?? "",
  color: card?.color ?? "#8E9EAF",
});

export const CardEditor = ({ card, onDone }: CardEditorProps) => {
  const addCard = useCardStore((s) => s.addCard);
  const updateCard = useCardStore((s) => s.updateCard);
  const [form, setForm] = useState<FormState>(toFormState(card));
  const isEdit = !!card;

  const handleTemplateChange = (slug: string) => {
    const template = CARD_TEMPLATES.find((t) => t.slug === slug);
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

    if (isEdit) {
      updateCard(card.id, {
        owner: form.owner,
        alias: form.alias || undefined,
        cardNumber: form.cardNumber || undefined,
        annualFee: Number(form.annualFee),
        cardOpenDate: form.cardOpenDate,
        color: form.color,
      });
    } else {
      const template = CARD_TEMPLATES.find((t) => t.slug === form.templateSlug);
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
        benefits: template
          ? template.defaultBenefits.map((b) => ({
              ...b,
              id: crypto.randomUUID(),
              isHidden: false,
              autoRecur: false,
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
    <form onSubmit={handleSubmit} data-testid="card-editor">
      <label>
        卡片类型
        <select
          value={form.templateSlug}
          onChange={(e) => { handleTemplateChange(e.target.value); }}
          data-testid="template-select"
        >
          <option value="">自定义</option>
          {CARD_TEMPLATES.map((t) => (
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
        <input
          type="date"
          value={form.cardOpenDate}
          onChange={(e) => { handleChange("cardOpenDate", e.target.value); }}
          required
          data-testid="open-date-input"
        />
      </label>

      <label>
        颜色
        <input
          type="color"
          value={form.color}
          onChange={(e) => { handleChange("color", e.target.value); }}
          data-testid="color-input"
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
