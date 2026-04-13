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
      autoRecur: false,
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
      autoRecur: false,
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
