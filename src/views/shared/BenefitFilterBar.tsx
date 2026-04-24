import type { FilterMode } from "../../utils/benefitDisplay";
import "./BenefitFilterBar.css";

interface BenefitFilterBarProps {
  filter: FilterMode;
  onChange: (filter: FilterMode) => void;
}

const PILLS: { key: FilterMode; label: string }[] = [
  { key: "available", label: "可使用" },
  { key: "unused", label: "未使用" },
  { key: "used", label: "已使用" },
  { key: "hidden", label: "已隐藏" },
  { key: "all", label: "全部" },
];

export const BenefitFilterBar = ({
  filter,
  onChange,
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
    </div>
  );
};
