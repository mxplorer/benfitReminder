import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Benefit, CreditCard } from "../../models/types";
import { BenefitCard } from "./BenefitCard";

const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "Test Benefit",
  description: "A test benefit description",
  faceValue: 100,
  category: "other",
  resetType: "calendar",
  resetConfig: { period: "monthly" },
  isHidden: false,
  autoRecur: false,
  rolloverable: false,
  rolloverMaxYears: 2,
  usageRecords: [],
  ...overrides,
});

const makeCard = (overrides: Partial<CreditCard> = {}): CreditCard => ({
  id: "card-1",
  owner: "Test",
  cardTypeSlug: "amex_platinum",
  annualFee: 895,
  cardOpenDate: "2024-03-15",
  color: "#8E9EAF",
  isEnabled: true,
  benefits: [],
  ...overrides,
});

describe("BenefitCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-25T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders benefit name, value, and description", () => {
    const benefit = makeBenefit({ name: "Hotel Credit", faceValue: 300 });
    render(<BenefitCard benefit={benefit} card={makeCard()} onToggleUsage={vi.fn()} />);

    expect(screen.getByText("Hotel Credit")).toBeInTheDocument();
    expect(screen.getByText("$300")).toBeInTheDocument();
    expect(screen.getByText("A test benefit description")).toBeInTheDocument();
  });

  it("hides description in compact mode", () => {
    const benefit = makeBenefit({ description: "Should be hidden" });
    render(<BenefitCard benefit={benefit} card={makeCard()} onToggleUsage={vi.fn()} compact />);

    expect(screen.queryByText("Should be hidden")).not.toBeInTheDocument();
  });

  it("fires onToggleUsage with actual value after confirming prompt", () => {
    const handler = vi.fn();
    const benefit = makeBenefit({ id: "b42", faceValue: 50 });
    const card = makeCard({ id: "c99" });
    render(<BenefitCard benefit={benefit} card={card} onToggleUsage={handler} />);

    fireEvent.click(screen.getByLabelText("标记使用"));
    fireEvent.click(screen.getByLabelText("确认"));
    expect(handler).toHaveBeenCalledWith("c99", "b42", 50, "2026-04-25");
  });

  it("shows used state with checkmark and strikethrough", () => {
    const benefit = makeBenefit({
      usageRecords: [{ usedDate: "2026-04-20", faceValue: 100, actualValue: 100 }],
    });
    render(<BenefitCard benefit={benefit} card={makeCard()} onToggleUsage={vi.fn()} />);

    expect(screen.getByText("已使用")).toBeInTheDocument();
    expect(screen.getByText("✓")).toBeInTheDocument();
  });

  it("shows dash for zero faceValue", () => {
    const benefit = makeBenefit({ faceValue: 0 });
    render(<BenefitCard benefit={benefit} card={makeCard()} onToggleUsage={vi.fn()} />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("prompts for actual value before marking benefit as used", () => {
    const handler = vi.fn();
    const benefit = makeBenefit({ id: "b1", faceValue: 100 });
    const card = makeCard({ id: "c1" });
    render(<BenefitCard benefit={benefit} card={card} onToggleUsage={handler} />);

    // Click the check button — should reveal the actual-value prompt
    fireEvent.click(screen.getByLabelText("标记使用"));
    const input = screen.getByLabelText<HTMLInputElement>("实际到手");
    expect(input).toBeInTheDocument();
    expect(input.value).toBe("100"); // pre-filled with face value

    // Handler should NOT have been called yet
    expect(handler).not.toHaveBeenCalled();

    // Edit value and confirm
    fireEvent.change(input, { target: { value: "75" } });
    fireEvent.click(screen.getByLabelText("确认"));

    expect(handler).toHaveBeenCalledWith("c1", "b1", 75, "2026-04-25");
  });

  it("cancels without calling handler", () => {
    const handler = vi.fn();
    const benefit = makeBenefit();
    render(<BenefitCard benefit={benefit} card={makeCard()} onToggleUsage={handler} />);

    fireEvent.click(screen.getByLabelText("标记使用"));
    fireEvent.click(screen.getByLabelText("取消"));

    expect(handler).not.toHaveBeenCalled();
    // prompt should be gone
    expect(screen.queryByLabelText("实际到手")).not.toBeInTheDocument();
  });

  it("shows date input defaulting to today when marking benefit as used", () => {
    const benefit = makeBenefit();
    render(<BenefitCard benefit={benefit} card={makeCard()} onToggleUsage={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("标记使用"));
    const dateInput = screen.getByLabelText<HTMLInputElement>("使用日期");
    expect(dateInput).toBeInTheDocument();
    expect(dateInput.value).toBe("2026-04-25");
  });

  it("passes custom date to handler when user changes date", () => {
    const handler = vi.fn();
    const benefit = makeBenefit({ id: "b1", faceValue: 50 });
    const card = makeCard({ id: "c1" });
    render(<BenefitCard benefit={benefit} card={card} onToggleUsage={handler} />);

    fireEvent.click(screen.getByLabelText("标记使用"));
    fireEvent.change(screen.getByLabelText("使用日期"), { target: { value: "2026-04-20" } });
    fireEvent.click(screen.getByLabelText("确认"));

    expect(handler).toHaveBeenCalledWith("c1", "b1", 50, "2026-04-20");
  });

  it("shows required marker for anniversary reset type date", () => {
    const benefit = makeBenefit({ resetType: "anniversary" });
    render(<BenefitCard benefit={benefit} card={makeCard()} onToggleUsage={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("标记使用"));
    expect(screen.getByText("使用日期*")).toBeInTheDocument();
    const dateInput = screen.getByLabelText<HTMLInputElement>("使用日期");
    expect(dateInput.required).toBe(true);
  });

  it("blocks confirm when anniversary benefit has empty date", () => {
    const handler = vi.fn();
    const benefit = makeBenefit({ resetType: "anniversary" });
    const card = makeCard();
    render(<BenefitCard benefit={benefit} card={card} onToggleUsage={handler} />);

    fireEvent.click(screen.getByLabelText("标记使用"));
    fireEvent.change(screen.getByLabelText("使用日期"), { target: { value: "" } });
    fireEvent.click(screen.getByLabelText("确认"));

    expect(handler).not.toHaveBeenCalled();
  });

  it("shows rollover badge for rolloverable benefit", () => {
    const benefit = makeBenefit({ rolloverable: true, rolloverMaxYears: 2 });
    render(<BenefitCard benefit={benefit} card={makeCard()} onToggleUsage={vi.fn()} />);
    expect(screen.getByText("可Roll")).toBeInTheDocument();
  });

  it("does not show rollover badge for non-rolloverable benefit", () => {
    const benefit = makeBenefit({ rolloverable: false });
    render(<BenefitCard benefit={benefit} card={makeCard()} onToggleUsage={vi.fn()} />);
    expect(screen.queryByText("可Roll")).not.toBeInTheDocument();
  });

  it("shows rollover button for unused rolloverable benefit", () => {
    const benefit = makeBenefit({ rolloverable: true, rolloverMaxYears: 2 });
    render(
      <BenefitCard benefit={benefit} card={makeCard()} onToggleUsage={vi.fn()} onRollover={vi.fn()} />
    );
    expect(screen.getByLabelText("Rollover")).toBeInTheDocument();
  });

  it("fires onRollover when rollover button is clicked", () => {
    const handler = vi.fn();
    const benefit = makeBenefit({ id: "b1", rolloverable: true, rolloverMaxYears: 2 });
    const card = makeCard({ id: "c1" });
    render(
      <BenefitCard benefit={benefit} card={card} onToggleUsage={vi.fn()} onRollover={handler} />
    );
    fireEvent.click(screen.getByLabelText("Rollover"));
    expect(handler).toHaveBeenCalledWith("c1", "b1");
  });

  it("shows accumulated value when rollover records exist", () => {
    // Today is 2026-04-25 → Q2. Q1 was rolled → available = 300 + 300 = 600
    const benefit = makeBenefit({
      faceValue: 300,
      rolloverable: true,
      rolloverMaxYears: 2,
      resetConfig: { period: "quarterly" },
      usageRecords: [
        { usedDate: "2026-01-15", faceValue: 0, actualValue: 0, isRollover: true },
      ],
    });
    render(<BenefitCard benefit={benefit} card={makeCard()} onToggleUsage={vi.fn()} />);
    expect(screen.getByText("$600")).toBeInTheDocument();
  });

  it("unchecks directly without prompting when already used", () => {
    const handler = vi.fn();
    const benefit = makeBenefit({
      id: "b7",
      usageRecords: [{ usedDate: "2026-04-20", faceValue: 100, actualValue: 100 }],
    });
    const card = makeCard({ id: "c7" });
    render(<BenefitCard benefit={benefit} card={card} onToggleUsage={handler} />);

    fireEvent.click(screen.getByLabelText("取消使用"));
    expect(handler).toHaveBeenCalledWith("c7", "b7");
    expect(screen.queryByLabelText("实际到手")).not.toBeInTheDocument();
  });
});
