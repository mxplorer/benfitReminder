import type { FilterMode, YearScope } from "../../utils/benefitDisplay";
import "./BenefitFilterBar.css";

interface BenefitFilterBarProps {
  filter: FilterMode;
  onChange: (filter: FilterMode) => void;
  scope: YearScope;
  onScopeChange: (scope: YearScope) => void;
}

const PILLS: { key: FilterMode; label: string }[] = [
  { key: "available", label: "可使用" },
  { key: "unused", label: "未使用" },
  { key: "used", label: "已使用" },
  { key: "hidden", label: "已隐藏" },
  { key: "all", label: "全部" },
];

const SCOPES_VISIBLE: FilterMode[] = ["unused", "all"];

export const BenefitFilterBar = ({
  filter,
  onChange,
  scope,
  onScopeChange,
}: BenefitFilterBarProps) => {
  return (
    <div className="benefit-filter-bar" data-testid="benefit-filter-bar">
      <div className="benefit-filter-bar__pills">
        {PILLS.map(({ key, label }) => (
          <button
            key={key}
            data-testid={`filter-pill-${key}`}
            className={`benefit-filter-bar__pill${
              filter === key ? " benefit-filter-bar__pill--active" : ""
            }`}
            onClick={() => {
              onChange(key);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {SCOPES_VISIBLE.includes(filter) && (
        <div className="benefit-filter-bar__scope" data-testid="year-scope-toggle">
          <button
            data-testid="scope-calendar"
            className={`benefit-filter-bar__scope-btn${
              scope === "calendar" ? " benefit-filter-bar__scope-btn--active" : ""
            }`}
            onClick={() => {
              onScopeChange("calendar");
            }}
          >
            年终
          </button>
          <button
            data-testid="scope-anniversary"
            className={`benefit-filter-bar__scope-btn${
              scope === "anniversary" ? " benefit-filter-bar__scope-btn--active" : ""
            }`}
            onClick={() => {
              onScopeChange("anniversary");
            }}
          >
            周年
          </button>
        </div>
      )}
    </div>
  );
};
