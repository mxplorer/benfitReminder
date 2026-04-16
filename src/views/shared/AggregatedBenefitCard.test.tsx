import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AggregatedBenefitCard } from "./AggregatedBenefitCard";
import type { BenefitDisplayItem } from "../../utils/benefitDisplay";
import type { CreditCard, Benefit } from "../../models/types";

const benefit: Benefit = {
  id: "b1", name: "Uber Eats", description: "",
  faceValue: 15, category: "dining",
  resetType: "calendar", resetConfig: { period: "monthly" },
  isHidden: false,
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
      { label: "1月", used: true, record: { usedDate: "2026-01-10", faceValue: 15, actualValue: 15, kind: "usage" }, faceValue: 15, cycleStart: "2026-01-01", cycleEnd: "2026-01-31" },
      { label: "3月", used: true, record: { usedDate: "2026-03-05", faceValue: 15, actualValue: 12, kind: "usage" }, faceValue: 15, cycleStart: "2026-03-01", cycleEnd: "2026-03-31" },
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

describe("AggregatedBenefitCard — uncheck used row", () => {
  const allKindItem: BenefitDisplayItem = {
    benefit,
    card,
    key: "agg-all",
    variant: "aggregated",
    aggregate: {
      kind: "all",
      months: [
        {
          label: "1月",
          used: true,
          record: { usedDate: "2026-01-10", faceValue: 15, actualValue: 15, kind: "usage" },
          faceValue: 15,
          cycleStart: "2026-01-01",
          cycleEnd: "2026-01-31",
        },
        {
          label: "2月",
          used: false,
          faceValue: 15,
          cycleStart: "2026-02-01",
          cycleEnd: "2026-02-28",
        },
      ],
      usedCount: 1,
      unusedCount: 1,
      totalActualValue: 15,
      totalFaceValue: 30,
    },
  };

  it("renders an uncheck button on used rows and fires onSetCycleUsed with false", () => {
    const onSetCycleUsed = vi.fn();
    render(<AggregatedBenefitCard item={allKindItem} onSetCycleUsed={onSetCycleUsed} />);
    fireEvent.click(screen.getByTestId("agg-expand"));
    fireEvent.click(screen.getByTestId("agg-month-uncheck-1月"));
    expect(onSetCycleUsed).toHaveBeenCalledWith("c1", "b1", "2026-01-01", "2026-01-31", false);
  });

  it("routes unused-row check-off through onSetCycleUsed when provided", () => {
    const onSetCycleUsed = vi.fn();
    const onToggleUsage = vi.fn();
    render(
      <AggregatedBenefitCard
        item={allKindItem}
        onToggleUsage={onToggleUsage}
        onSetCycleUsed={onSetCycleUsed}
      />,
    );
    fireEvent.click(screen.getByTestId("agg-expand"));
    fireEvent.click(screen.getByTestId("agg-month-check-2月"));
    expect(onSetCycleUsed).toHaveBeenCalledWith(
      "c1",
      "b1",
      "2026-02-01",
      "2026-02-28",
      true,
      { actualValue: 15 },
    );
    expect(onToggleUsage).not.toHaveBeenCalled();
  });

  it("falls back to onToggleUsage on unused rows when onSetCycleUsed is not provided", () => {
    const onToggleUsage = vi.fn();
    render(<AggregatedBenefitCard item={allKindItem} onToggleUsage={onToggleUsage} />);
    fireEvent.click(screen.getByTestId("agg-expand"));
    fireEvent.click(screen.getByTestId("agg-month-check-2月"));
    expect(onToggleUsage).toHaveBeenCalledWith("c1", "b1", 15, "2026-02-01");
  });

  it("does not render uncheck button when onSetCycleUsed is not provided", () => {
    render(<AggregatedBenefitCard item={allKindItem} />);
    fireEvent.click(screen.getByTestId("agg-expand"));
    expect(screen.queryByTestId("agg-month-uncheck-1月")).toBeNull();
  });
});

describe("AggregatedBenefitCard — pending mode", () => {
  const pendingItem: BenefitDisplayItem = {
    benefit, card, key: "agg-pending", variant: "aggregated",
    aggregate: {
      kind: "unused",
      months: [
        { label: "2026-01", used: false, faceValue: 15, cycleStart: "2026-01-01", cycleEnd: "2026-01-31" },
        { label: "2026-02", used: false, faceValue: 15, cycleStart: "2026-02-01", cycleEnd: "2026-02-28" },
        { label: "2026-03", used: false, faceValue: 15, cycleStart: "2026-03-01", cycleEnd: "2026-03-31" },
      ],
      usedCount: 0, unusedCount: 3, totalActualValue: 0, totalFaceValue: 45,
    },
  };

  it("renders pending summary with N/total months and respects defaultExpanded", () => {
    render(
      <AggregatedBenefitCard
        item={pendingItem}
        pending={{
          checkedMonths: new Set([2]),
          values: { 2: 15 },
          onToggleMonth: vi.fn(),
          onValueChange: vi.fn(),
          defaultExpanded: true,
        }}
      />,
    );
    expect(screen.getByText(/已选 1 \/ 3 个月/)).toBeInTheDocument();
    // defaultExpanded=true → rows should be visible without clicking expand
    expect(screen.getByTestId("agg-pending-row-2026-02")).toBeInTheDocument();
  });

  it("calls onToggleMonth with the month number (derived from cycleStart) on checkbox click", () => {
    const onToggleMonth = vi.fn();
    render(
      <AggregatedBenefitCard
        item={pendingItem}
        pending={{
          checkedMonths: [],
          values: {},
          onToggleMonth,
          onValueChange: vi.fn(),
          defaultExpanded: true,
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("agg-pending-check-2026-02"));
    expect(onToggleMonth).toHaveBeenCalledWith(2);
  });

  it("calls onValueChange with month and new value on value input change", () => {
    const onValueChange = vi.fn();
    render(
      <AggregatedBenefitCard
        item={pendingItem}
        pending={{
          checkedMonths: new Set([3]),
          values: { 3: 15 },
          onToggleMonth: vi.fn(),
          onValueChange,
          defaultExpanded: true,
        }}
      />,
    );
    fireEvent.change(screen.getByTestId("agg-pending-value-2026-03"), {
      target: { value: "9" },
    });
    expect(onValueChange).toHaveBeenCalledWith(3, 9);
  });

  it("does NOT fire live-store callbacks (onToggleUsage / onSetCycleUsed) when pending is active", () => {
    const onToggleUsage = vi.fn();
    const onSetCycleUsed = vi.fn();
    const onToggleMonth = vi.fn();
    render(
      <AggregatedBenefitCard
        item={pendingItem}
        onToggleUsage={onToggleUsage}
        onSetCycleUsed={onSetCycleUsed}
        pending={{
          checkedMonths: [],
          values: {},
          onToggleMonth,
          onValueChange: vi.fn(),
          defaultExpanded: true,
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("agg-pending-check-2026-01"));
    expect(onToggleMonth).toHaveBeenCalledWith(1);
    expect(onToggleUsage).not.toHaveBeenCalled();
    expect(onSetCycleUsed).not.toHaveBeenCalled();
  });
});
