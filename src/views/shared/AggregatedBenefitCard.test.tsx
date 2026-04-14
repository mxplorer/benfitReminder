import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AggregatedBenefitCard } from "./AggregatedBenefitCard";
import type { BenefitDisplayItem } from "../../utils/benefitDisplay";
import type { CreditCard, Benefit } from "../../models/types";

const benefit: Benefit = {
  id: "b1", name: "Uber Eats", description: "",
  faceValue: 15, category: "dining",
  resetType: "calendar", resetConfig: { period: "monthly" },
  isHidden: false, autoRecur: false,
  rolloverable: false, rolloverMaxYears: 0,
  usageRecords: [],
};

const card: CreditCard = {
  id: "c1", owner: "me", cardTypeSlug: "x",
  annualFee: 100, cardOpenDate: "2024-01-01",
  color: "#000", isEnabled: true, benefits: [benefit],
};

const usedItem: BenefitDisplayItem = {
  benefit, card, key: "agg-used", variant: "aggregated",
  aggregate: {
    kind: "used",
    months: [
      { label: "1月", used: true, record: { usedDate: "2026-01-10", faceValue: 15, actualValue: 15 }, faceValue: 15, cycleStart: "2026-01-01", cycleEnd: "2026-01-31" },
      { label: "3月", used: true, record: { usedDate: "2026-03-05", faceValue: 15, actualValue: 12 }, faceValue: 15, cycleStart: "2026-03-01", cycleEnd: "2026-03-31" },
    ],
    usedCount: 2, unusedCount: 0, totalActualValue: 27, totalFaceValue: 30,
  },
};

describe("AggregatedBenefitCard", () => {
  it("renders used-kind summary", () => {
    render(<AggregatedBenefitCard item={usedItem} />);
    expect(screen.getByText(/Uber Eats/)).toBeInTheDocument();
    expect(screen.getByText(/2 次/)).toBeInTheDocument();
    expect(screen.getByText(/\$27/)).toBeInTheDocument();
  });

  it("expands to show month rows when clicked", () => {
    render(<AggregatedBenefitCard item={usedItem} />);
    expect(screen.queryByTestId("agg-month-row-1月")).toBeNull();
    fireEvent.click(screen.getByTestId("agg-expand"));
    expect(screen.getByTestId("agg-month-row-1月")).toBeInTheDocument();
    expect(screen.getByTestId("agg-month-row-3月")).toBeInTheDocument();
  });

  it("renders unused-kind summary with unused count", () => {
    const item: BenefitDisplayItem = {
      ...usedItem, key: "agg-unused",
      aggregate: {
        kind: "unused",
        months: [
          { label: "2月", used: false, faceValue: 15, cycleStart: "2026-02-01", cycleEnd: "2026-02-28" },
          { label: "4月", used: false, faceValue: 15, cycleStart: "2026-04-01", cycleEnd: "2026-04-30" },
        ],
        usedCount: 0, unusedCount: 2, totalActualValue: 0, totalFaceValue: 30,
      },
    };
    render(<AggregatedBenefitCard item={item} />);
    expect(screen.getByText(/未使用 2 个月/)).toBeInTheDocument();
  });

  it("fires onToggleUsage with cycleStart date for unused-row check-off", () => {
    const onToggleUsage = vi.fn();
    const item: BenefitDisplayItem = {
      ...usedItem, key: "agg-unused",
      aggregate: {
        kind: "unused",
        months: [
          { label: "2月", used: false, faceValue: 15, cycleStart: "2026-02-01", cycleEnd: "2026-02-28" },
        ],
        usedCount: 0, unusedCount: 1, totalActualValue: 0, totalFaceValue: 15,
      },
    };
    render(<AggregatedBenefitCard item={item} onToggleUsage={onToggleUsage} />);
    fireEvent.click(screen.getByTestId("agg-expand"));
    fireEvent.click(screen.getByTestId("agg-month-check-2月"));
    expect(onToggleUsage).toHaveBeenCalledWith("c1", "b1", 15, "2026-02-01");
  });
});
