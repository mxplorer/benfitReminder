import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CreditCard } from "../../models/types";
import { BackfillDialog } from "./BackfillDialog";

const makeCard = (): CreditCard => ({
  id: "c1",
  owner: "Test",
  cardTypeSlug: "amex_platinum",
  annualFee: 895,
  cardOpenDate: "2025-10-01",
  color: "#8E9EAF",
  isEnabled: true,
  benefits: [
    {
      id: "b1",
      name: "Dining Credit",
      description: "",
      faceValue: 100,
      category: "dining",
      resetType: "calendar",
      resetConfig: { period: "quarterly" },
      isHidden: false,
      rolloverable: false,
      rolloverMaxYears: 2,
      usageRecords: [],
    },
    {
      id: "b2",
      name: "FHR Credit",
      description: "",
      faceValue: 300,
      category: "hotel",
      resetType: "calendar",
      resetConfig: { period: "semi_annual" },
      isHidden: false,
      rolloverable: true,
      rolloverMaxYears: 2,
      usageRecords: [],
    },
  ],
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-25T12:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BackfillDialog", () => {
  it("renders step 1 with non-rollover benefits and past periods", () => {
    render(<BackfillDialog card={makeCard()} onDone={vi.fn()} />);
    expect(screen.getByText("历史使用记录回填")).toBeInTheDocument();
    expect(screen.getAllByText(/Dining Credit/).length).toBeGreaterThan(0);
  });

  it("can skip step 1 and go to step 2 for rollover benefits", () => {
    render(<BackfillDialog card={makeCard()} onDone={vi.fn()} />);
    fireEvent.click(screen.getByText("跳过"));
    expect(screen.getByText(/FHR Credit/)).toBeInTheDocument();
    expect(screen.getAllByText(/累积的 rollover 额度/).length).toBeGreaterThan(0);
  });

  it("can complete the full flow and calls onDone", () => {
    const onDone = vi.fn();
    render(<BackfillDialog card={makeCard()} onDone={onDone} />);
    fireEvent.click(screen.getByText("跳过")); // skip step 1
    fireEvent.click(screen.getByText("跳过")); // skip step 2
    fireEvent.click(screen.getByText("完成")); // step 3
    expect(onDone).toHaveBeenCalled();
  });

  it("skips step 1 when all benefits are rollover-only", () => {
    const card = makeCard();
    card.benefits = card.benefits.filter((b) => b.rolloverable);
    render(<BackfillDialog card={card} onDone={vi.fn()} />);
    expect(screen.getByText(/FHR Credit/)).toBeInTheDocument();
    expect(screen.getAllByText(/累积的 rollover 额度/).length).toBeGreaterThan(0);
  });

  it("skips step 2 when no benefits are rolloverable", () => {
    const card = makeCard();
    card.benefits = card.benefits.filter((b) => !b.rolloverable);
    render(<BackfillDialog card={card} onDone={vi.fn()} />);
    fireEvent.click(screen.getByText("跳过")); // skip step 1 → goes to summary
    expect(screen.getByText("完成")).toBeInTheDocument();
  });
});

describe("BackfillDialog — monthly benefit aggregation", () => {
  const makeCardWithMonthly = (): CreditCard => ({
    id: "c1",
    owner: "Test",
    cardTypeSlug: "amex_platinum",
    annualFee: 695,
    cardOpenDate: "2024-10-01",
    color: "#8E9EAF",
    isEnabled: true,
    benefits: [
      {
        id: "m1",
        name: "DoorDash",
        description: "",
        faceValue: 10,
        category: "dining",
        resetType: "calendar",
        resetConfig: { period: "monthly" },
        isHidden: false,
        rolloverable: false,
        rolloverMaxYears: 0,
        usageRecords: [],
      },
      {
        id: "q1",
        name: "Dining Credit",
        description: "",
        faceValue: 100,
        category: "dining",
        resetType: "calendar",
        resetConfig: { period: "quarterly" },
        isHidden: false,
        rolloverable: false,
        rolloverMaxYears: 0,
        usageRecords: [],
      },
    ],
  });

  it("renders ONE aggregated row for a monthly benefit instead of 12 flat rows", () => {
    render(<BackfillDialog card={makeCardWithMonthly()} onDone={vi.fn()} />);
    // Single aggregated container for the monthly benefit
    expect(screen.getByTestId("backfill-monthly-agg-m1")).toBeInTheDocument();
    // No flat checkbox rows for any monthly period (all 12 months are behind the aggregator)
    expect(screen.queryByText("2026-03")).toBeNull();
    expect(screen.queryByText("2025-12")).toBeNull();
    // Summary should show "已选 0 / N 个月"
    expect(screen.getByText(/DoorDash · 已选 0 \//)).toBeInTheDocument();
  });

  it("keeps non-monthly benefits as flat rows on the same card", () => {
    render(<BackfillDialog card={makeCardWithMonthly()} onDone={vi.fn()} />);
    // Quarterly benefit still gets per-period flat rows (Dining Credit repeated)
    const diningMatches = screen.getAllByText(/Dining Credit/);
    expect(diningMatches.length).toBeGreaterThan(1);
  });

  it("toggling a month checkbox in the aggregated card flips the underlying entry state", () => {
    render(<BackfillDialog card={makeCardWithMonthly()} onDone={vi.fn()} />);
    // Expand the aggregated card
    fireEvent.click(screen.getAllByTestId("agg-expand")[0]);
    // Tick a specific month
    fireEvent.click(screen.getByTestId("agg-pending-check-2026-03"));
    // Summary should now reflect 1 checked
    expect(screen.getByText(/DoorDash · 已选 1 \//)).toBeInTheDocument();
    // Value input for that month should appear
    expect(screen.getByTestId("agg-pending-value-2026-03")).toBeInTheDocument();
  });

  it("changing the value input for a checked month updates actualValue for that entry", () => {
    render(<BackfillDialog card={makeCardWithMonthly()} onDone={vi.fn()} />);
    fireEvent.click(screen.getAllByTestId("agg-expand")[0]);
    fireEvent.click(screen.getByTestId("agg-pending-check-2026-03"));
    const input = screen.getByTestId<HTMLInputElement>("agg-pending-value-2026-03");
    expect(input.value).toBe("10");
    fireEvent.change(input, { target: { value: "7" } });
    expect(screen.getByTestId<HTMLInputElement>("agg-pending-value-2026-03").value).toBe("7");
  });
});
