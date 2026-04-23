import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Benefit, CreditCard, UsageRecord } from "../../models/types";
import { BenefitCard } from "./BenefitCard";
import { useCardStore } from "../../stores/useCardStore";

const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "Test Benefit",
  description: "A test benefit description",
  faceValue: 100,
  category: "other",
  resetType: "calendar",
  resetConfig: { period: "monthly" },
  isHidden: false,
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
    useCardStore.getState().recalculate();
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
      usageRecords: [{ usedDate: "2026-04-20", faceValue: 100, actualValue: 100, kind: "usage" }],
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

  it("renders rollover settings button when onEditRollover is supplied and benefit is rolloverable", () => {
    const benefit = makeBenefit({ rolloverable: true, rolloverMaxYears: 2 });
    render(
      <BenefitCard
        benefit={benefit}
        card={makeCard()}
        onToggleUsage={vi.fn()}
        onEditRollover={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Rollover 设置")).toBeInTheDocument();
  });

  it("does not render rollover settings button when onEditRollover is omitted", () => {
    const benefit = makeBenefit({ rolloverable: true, rolloverMaxYears: 2 });
    render(
      <BenefitCard
        benefit={benefit}
        card={makeCard()}
        onToggleUsage={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Rollover 设置")).not.toBeInTheDocument();
  });

  it("does not render rollover settings button when benefit is not rolloverable", () => {
    const benefit = makeBenefit({ rolloverable: false });
    render(
      <BenefitCard
        benefit={benefit}
        card={makeCard()}
        onToggleUsage={vi.fn()}
        onEditRollover={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Rollover 设置")).not.toBeInTheDocument();
  });

  it("fires onEditRollover with (cardId, benefitId) when rollover button is clicked", () => {
    const handler = vi.fn();
    const benefit = makeBenefit({ id: "b1", rolloverable: true, rolloverMaxYears: 2 });
    const card = makeCard({ id: "c1" });
    render(
      <BenefitCard
        benefit={benefit}
        card={card}
        onToggleUsage={vi.fn()}
        onEditRollover={handler}
      />,
    );
    fireEvent.click(screen.getByLabelText("Rollover 设置"));
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
        { usedDate: "2026-01-15", faceValue: 0, actualValue: 0, kind: "rollover" },
      ],
    });
    render(<BenefitCard benefit={benefit} card={makeCard()} onToggleUsage={vi.fn()} />);
    expect(screen.getByText("$600")).toBeInTheDocument();
  });

  it("hides delete button for benefits with templateBenefitId", () => {
    const benefit = makeBenefit({ templateBenefitId: "some_template_id" });
    render(
      <BenefitCard
        benefit={benefit}
        card={makeCard()}
        onToggleUsage={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("删除权益")).not.toBeInTheDocument();
  });

  it("shows delete button for custom benefits without templateBenefitId", () => {
    const benefit = makeBenefit(); // no templateBenefitId
    render(
      <BenefitCard
        benefit={benefit}
        card={makeCard()}
        onToggleUsage={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("删除权益")).toBeInTheDocument();
  });

  it("unchecks directly without prompting when already used", () => {
    const handler = vi.fn();
    const benefit = makeBenefit({
      id: "b7",
      usageRecords: [{ usedDate: "2026-04-20", faceValue: 100, actualValue: 100, kind: "usage" }],
    });
    const card = makeCard({ id: "c7" });
    render(<BenefitCard benefit={benefit} card={card} onToggleUsage={handler} />);

    fireEvent.click(screen.getByLabelText("取消使用"));
    expect(handler).toHaveBeenCalledWith("c7", "b7");
    expect(screen.queryByLabelText("实际到手")).not.toBeInTheDocument();
  });
});

describe("BenefitCard — subscription reset label", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-25T12:00:00"));
    useCardStore.getState().recalculate();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows '订阅·自动' when the latest usage record has propagateNext=true", () => {
    const benefit = makeBenefit({
      resetType: "subscription",
      resetConfig: {},
      usageRecords: [
        { usedDate: "2026-03-15", faceValue: 100, actualValue: 100, propagateNext: true, kind: "usage" },
      ],
    });
    render(<BenefitCard benefit={benefit} card={makeCard()} onToggleUsage={vi.fn()} />);
    expect(screen.getByText("订阅·自动")).toBeInTheDocument();
  });

  it("shows '订阅' when the latest record lacks propagateNext", () => {
    const benefit = makeBenefit({
      resetType: "subscription",
      resetConfig: {},
      usageRecords: [
        { usedDate: "2026-03-15", faceValue: 100, actualValue: 100, kind: "usage" },
      ],
    });
    render(<BenefitCard benefit={benefit} card={makeCard()} onToggleUsage={vi.fn()} />);
    expect(screen.getByText("订阅")).toBeInTheDocument();
  });
});

describe("BenefitCard — per-cycle props", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-25T12:00:00"));
    useCardStore.getState().recalculate();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows period label when periodLabel is set", () => {
    const benefit = makeBenefit({ resetConfig: { period: "quarterly" } });
    render(
      <BenefitCard
        benefit={benefit}
        card={makeCard()}
        onToggleUsage={vi.fn()}
        periodLabel="Q2 2026"
        cycleUsed={false}
      />,
    );
    expect(screen.getByText("Q2 2026")).toBeInTheDocument();
  });

  it("shows used state when cycleUsed=true", () => {
    const benefit = makeBenefit();
    const record: UsageRecord = { usedDate: "2026-04-10", faceValue: 100, actualValue: 80, kind: "usage" };
    render(
      <BenefitCard
        benefit={benefit}
        card={makeCard()}
        onToggleUsage={vi.fn()}
        periodLabel="Q2 2026"
        cycleUsed
        cycleRecord={record}
      />,
    );
    expect(screen.getByLabelText("取消使用")).toBeInTheDocument();
  });

  it("stays backward compatible without cycle props", () => {
    const benefit = makeBenefit();
    render(
      <BenefitCard benefit={benefit} card={makeCard()} onToggleUsage={vi.fn()} />,
    );
    expect(screen.getByText(benefit.name)).toBeInTheDocument();
  });
});

describe("BenefitCard — cycle-scoped toggle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-25T12:00:00"));
    useCardStore.getState().recalculate();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("unchecking a past used cycle routes through onSetCycleUsed, not onToggleUsage", () => {
    const benefit = makeBenefit({ id: "b1", resetConfig: { period: "quarterly" } });
    const card = makeCard({ id: "c1" });
    const record: UsageRecord = { usedDate: "2026-02-05", faceValue: 100, actualValue: 100, kind: "usage" };
    const onToggle = vi.fn();
    const setCycleUsed = vi.fn();
    render(
      <BenefitCard
        benefit={benefit}
        card={card}
        onToggleUsage={onToggle}
        onSetCycleUsed={setCycleUsed}
        periodLabel="Q1 2026"
        cycleStart="2026-01-01"
        cycleEnd="2026-03-31"
        cycleUsed
        cycleRecord={record}
      />,
    );
    fireEvent.click(screen.getByLabelText("取消使用"));
    expect(setCycleUsed).toHaveBeenCalledWith("c1", "b1", "2026-01-01", "2026-03-31", false);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("disables the use button on a future (not-yet-active) cycle to prevent accidental check-off", () => {
    const benefit = makeBenefit({ id: "b1", faceValue: 100, resetConfig: { period: "quarterly" } });
    const card = makeCard({ id: "c1" });
    const setCycleUsed = vi.fn();
    render(
      <BenefitCard
        benefit={benefit}
        card={card}
        onToggleUsage={vi.fn()}
        onSetCycleUsed={setCycleUsed}
        periodLabel="Q3 2026"
        cycleStart="2026-07-01"
        cycleEnd="2026-09-30"
        cycleUsed={false}
      />,
    );
    const btn = screen.getByLabelText<HTMLButtonElement>("未激活");
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(setCycleUsed).not.toHaveBeenCalled();
  });

  it("checking an unused current cycle defaults pendingDate to today", () => {
    const benefit = makeBenefit({ id: "b1", faceValue: 50, resetConfig: { period: "quarterly" } });
    const card = makeCard({ id: "c1" });
    const setCycleUsed = vi.fn();
    render(
      <BenefitCard
        benefit={benefit}
        card={card}
        onToggleUsage={vi.fn()}
        onSetCycleUsed={setCycleUsed}
        periodLabel="Q2 2026"
        cycleStart="2026-04-01"
        cycleEnd="2026-06-30"
        cycleUsed={false}
      />,
    );
    fireEvent.click(screen.getByLabelText("标记使用"));
    const dateInput = screen.getByLabelText<HTMLInputElement>("使用日期");
    expect(dateInput.value).toBe("2026-04-25");
    fireEvent.click(screen.getByLabelText("确认"));
    expect(setCycleUsed).toHaveBeenCalledWith(
      "c1",
      "b1",
      "2026-04-01",
      "2026-06-30",
      true,
      { actualValue: 50, usedDate: "2026-04-25" },
    );
  });

  it("falls back to onToggleUsage when no cycle context", () => {
    const benefit = makeBenefit({ id: "b1", faceValue: 40 });
    const card = makeCard({ id: "c1" });
    const onToggle = vi.fn();
    const setCycleUsed = vi.fn();
    render(
      <BenefitCard
        benefit={benefit}
        card={card}
        onToggleUsage={onToggle}
        onSetCycleUsed={setCycleUsed}
      />,
    );
    fireEvent.click(screen.getByLabelText("标记使用"));
    fireEvent.click(screen.getByLabelText("确认"));
    expect(onToggle).toHaveBeenCalledWith("c1", "b1", 40, "2026-04-25");
    expect(setCycleUsed).not.toHaveBeenCalled();
  });
});

describe("BenefitCard — propagateNext prompt (Task 7)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-25T12:00:00"));
    useCardStore.getState().recalculate();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes propagateNext=true when the checkbox is checked on confirm", () => {
    const onSetCycleUsed = vi.fn();
    const benefit = makeBenefit({
      id: "b1",
      name: "$25/mo",
      description: "",
      faceValue: 25,
      category: "streaming",
      resetType: "subscription",
      resetConfig: {},
      usageRecords: [],
    });
    render(
      <BenefitCard
        benefit={benefit}
        card={makeCard()}
        onToggleUsage={vi.fn()}
        onSetCycleUsed={onSetCycleUsed}
        cycleStart="2026-04-01"
        cycleEnd="2026-04-30"
        cycleUsed={false}
      />,
    );
    fireEvent.click(screen.getByLabelText("标记使用"));
    fireEvent.click(screen.getByLabelText("自动续期下月"));
    fireEvent.click(screen.getByLabelText("确认"));
    expect(onSetCycleUsed).toHaveBeenCalledWith(
      expect.any(String),
      "b1",
      "2026-04-01",
      "2026-04-30",
      true,
      expect.objectContaining({ propagateNext: true }),
    );
  });

  it("does NOT render the propagate checkbox for non-monthly benefits", () => {
    const benefit = makeBenefit({
      id: "b1",
      name: "Q credit",
      faceValue: 50,
      resetType: "calendar",
      resetConfig: { period: "quarterly" },
    });
    render(
      <BenefitCard
        benefit={benefit}
        card={makeCard()}
        onToggleUsage={vi.fn()}
        onSetCycleUsed={vi.fn()}
        cycleStart="2026-04-01"
        cycleEnd="2026-06-30"
        cycleUsed={false}
      />,
    );
    fireEvent.click(screen.getByLabelText("标记使用"));
    expect(screen.queryByLabelText("自动续期下月")).not.toBeInTheDocument();
  });

  it("opens edit prompt (not uncheck) when clicking ✓ on a used monthly record", () => {
    const onSetCycleUsed = vi.fn();
    const benefit = makeBenefit({
      id: "b1",
      resetType: "subscription",
      resetConfig: {},
      usageRecords: [],
    });
    const usedRecord: UsageRecord = {
      usedDate: "2026-04-10",
      faceValue: 25,
      actualValue: 22,
      propagateNext: true,
      kind: "usage",
    };
    render(
      <BenefitCard
        benefit={benefit}
        card={makeCard()}
        onToggleUsage={vi.fn()}
        onSetCycleUsed={onSetCycleUsed}
        cycleStart="2026-04-01"
        cycleEnd="2026-04-30"
        cycleUsed={true}
        cycleRecord={usedRecord}
      />,
    );
    fireEvent.click(screen.getByLabelText("取消使用"));
    expect(screen.getByLabelText<HTMLInputElement>("实际到手").value).toBe("22");
    expect(screen.getByLabelText("自动续期下月")).toBeChecked();
    expect(onSetCycleUsed).not.toHaveBeenCalled();
  });

  it("confirming in edit mode updates the record via setBenefitCycleUsed", () => {
    const onSetCycleUsed = vi.fn();
    const benefit = makeBenefit({
      id: "b1",
      resetType: "subscription",
      resetConfig: {},
      usageRecords: [],
    });
    const usedRecord: UsageRecord = {
      usedDate: "2026-04-10",
      faceValue: 25,
      actualValue: 22,
      propagateNext: true,
      kind: "usage",
    };
    render(
      <BenefitCard
        benefit={benefit}
        card={makeCard()}
        onToggleUsage={vi.fn()}
        onSetCycleUsed={onSetCycleUsed}
        cycleStart="2026-04-01"
        cycleEnd="2026-04-30"
        cycleUsed={true}
        cycleRecord={usedRecord}
      />,
    );
    fireEvent.click(screen.getByLabelText("取消使用"));
    fireEvent.click(screen.getByLabelText("自动续期下月")); // uncheck
    fireEvent.change(screen.getByLabelText("实际到手"), { target: { value: "18" } });
    fireEvent.click(screen.getByLabelText("确认"));
    expect(onSetCycleUsed).toHaveBeenCalledWith(
      expect.any(String),
      "b1",
      "2026-04-01",
      "2026-04-30",
      true,
      expect.objectContaining({ actualValue: 18, propagateNext: false }),
    );
  });

  it("shows a delete button in edit mode that removes the record", () => {
    const onSetCycleUsed = vi.fn();
    const benefit = makeBenefit({
      id: "b1",
      resetType: "subscription",
      resetConfig: {},
      usageRecords: [],
    });
    const usedRecord: UsageRecord = {
      usedDate: "2026-04-10",
      faceValue: 25,
      actualValue: 22,
      kind: "usage",
    };
    render(
      <BenefitCard
        benefit={benefit}
        card={makeCard()}
        onToggleUsage={vi.fn()}
        onSetCycleUsed={onSetCycleUsed}
        cycleStart="2026-04-01"
        cycleEnd="2026-04-30"
        cycleUsed={true}
        cycleRecord={usedRecord}
      />,
    );
    fireEvent.click(screen.getByLabelText("取消使用"));
    fireEvent.click(screen.getByLabelText("删除记录"));
    expect(onSetCycleUsed).toHaveBeenCalledWith(
      expect.any(String),
      "b1",
      "2026-04-01",
      "2026-04-30",
      false,
    );
  });
});

describe("BenefitCard — Batch 3 本次面值 + remaining-aware button", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-25T12:00:00"));
    useCardStore.getState().recalculate();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("prompt defaults 本次面值 to remaining (no records → full face)", () => {
    const benefit = makeBenefit({ id: "b1", faceValue: 100, usageRecords: [] });
    render(
      <BenefitCard benefit={benefit} card={makeCard({ id: "c1" })} onToggleUsage={vi.fn()} />,
    );
    fireEvent.click(screen.getByLabelText("标记使用"));
    const input = screen.getByLabelText<HTMLInputElement>("本次面值");
    expect(input).toBeInTheDocument();
    expect(input.value).toBe("100");
  });

  it("prompt defaults 本次面值 to cycle remaining when ≥1 record already exists", () => {
    const benefit = makeBenefit({
      id: "b1",
      faceValue: 100,
      resetConfig: { period: "quarterly" },
      usageRecords: [
        { usedDate: "2026-04-10", faceValue: 30, actualValue: 30, kind: "usage" },
      ],
    });
    const record: UsageRecord = {
      usedDate: "2026-04-10", faceValue: 30, actualValue: 30, kind: "usage",
    };
    render(
      <BenefitCard
        benefit={benefit}
        card={makeCard({ id: "c1" })}
        onToggleUsage={vi.fn()}
        cycleStart="2026-04-01"
        cycleEnd="2026-06-30"
        cycleUsed={false}
        cycleRecord={record}
      />,
    );
    fireEvent.click(screen.getByLabelText("标记使用"));
    const input = screen.getByLabelText<HTMLInputElement>("本次面值");
    expect(input.value).toBe("70");
  });

  it("editing 本次面值 auto-syncs 实际到手 on first keystroke", () => {
    const benefit = makeBenefit({ id: "b1", faceValue: 100 });
    render(
      <BenefitCard benefit={benefit} card={makeCard({ id: "c1" })} onToggleUsage={vi.fn()} />,
    );
    fireEvent.click(screen.getByLabelText("标记使用"));
    const consumed = screen.getByLabelText<HTMLInputElement>("本次面值");
    const actual = screen.getByLabelText<HTMLInputElement>("实际到手");
    expect(actual.value).toBe("100");
    fireEvent.change(consumed, { target: { value: "40" } });
    expect(actual.value).toBe("40");
  });

  it("after user edits 实际到手 manually, further 本次面值 changes do NOT overwrite actual", () => {
    const benefit = makeBenefit({ id: "b1", faceValue: 100 });
    render(
      <BenefitCard benefit={benefit} card={makeCard({ id: "c1" })} onToggleUsage={vi.fn()} />,
    );
    fireEvent.click(screen.getByLabelText("标记使用"));
    const consumed = screen.getByLabelText<HTMLInputElement>("本次面值");
    const actual = screen.getByLabelText<HTMLInputElement>("实际到手");
    fireEvent.change(actual, { target: { value: "35" } });
    expect(actual.value).toBe("35");
    fireEvent.change(consumed, { target: { value: "40" } });
    expect(actual.value).toBe("35");
  });

  it("confirming with onAddUsage receives consumedFace/actualValue/usedDate", () => {
    const onAddUsage = vi.fn();
    const benefit = makeBenefit({ id: "b1", faceValue: 100 });
    render(
      <BenefitCard
        benefit={benefit}
        card={makeCard({ id: "c1" })}
        onToggleUsage={vi.fn()}
        onAddUsage={onAddUsage}
      />,
    );
    fireEvent.click(screen.getByLabelText("标记使用"));
    fireEvent.change(screen.getByLabelText("本次面值"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("实际到手"), { target: { value: "35" } });
    fireEvent.click(screen.getByLabelText("确认"));
    expect(onAddUsage).toHaveBeenCalledWith(
      "c1",
      "b1",
      expect.objectContaining({
        consumedFace: 40,
        actualValue: 35,
        usedDate: "2026-04-25",
      }),
    );
  });

  it("confirming with onAddCycleUsage passes cycle window + consumedFace", () => {
    const onAddCycleUsage = vi.fn();
    const benefit = makeBenefit({
      id: "b1",
      faceValue: 100,
      resetConfig: { period: "quarterly" },
    });
    render(
      <BenefitCard
        benefit={benefit}
        card={makeCard({ id: "c1" })}
        onToggleUsage={vi.fn()}
        onAddCycleUsage={onAddCycleUsage}
        cycleStart="2026-04-01"
        cycleEnd="2026-06-30"
        cycleUsed={false}
      />,
    );
    fireEvent.click(screen.getByLabelText("标记使用"));
    fireEvent.change(screen.getByLabelText("本次面值"), { target: { value: "60" } });
    fireEvent.click(screen.getByLabelText("确认"));
    expect(onAddCycleUsage).toHaveBeenCalledWith(
      "c1",
      "b1",
      "2026-04-01",
      "2026-06-30",
      expect.objectContaining({
        consumedFace: 60,
        actualValue: 60,
        usedDate: "2026-04-25",
      }),
    );
  });

  it("button shows '+ 使用 $X' when 0 records in cycle", () => {
    const benefit = makeBenefit({
      id: "b1",
      faceValue: 50,
      resetConfig: { period: "quarterly" },
    });
    render(
      <BenefitCard
        benefit={benefit}
        card={makeCard({ id: "c1" })}
        onToggleUsage={vi.fn()}
        cycleStart="2026-04-01"
        cycleEnd="2026-06-30"
        cycleUsed={false}
      />,
    );
    expect(screen.getByText("+ 使用 $50")).toBeInTheDocument();
  });

  it("button shows '+ 再用一次 ($X 剩)' when ≥1 record exists in cycle and remaining > 0", () => {
    const benefit = makeBenefit({
      id: "b1",
      faceValue: 100,
      resetConfig: { period: "quarterly" },
      usageRecords: [
        { usedDate: "2026-04-10", faceValue: 30, actualValue: 30, kind: "usage" },
      ],
    });
    const record: UsageRecord = {
      usedDate: "2026-04-10", faceValue: 30, actualValue: 30, kind: "usage",
    };
    render(
      <BenefitCard
        benefit={benefit}
        card={makeCard({ id: "c1" })}
        onToggleUsage={vi.fn()}
        cycleStart="2026-04-01"
        cycleEnd="2026-06-30"
        cycleUsed={false}
        cycleRecord={record}
      />,
    );
    expect(screen.getByText("+ 再用一次 ($70 剩)")).toBeInTheDocument();
  });

  it("button shows '✓ 已用完' when remaining == 0", () => {
    const benefit = makeBenefit({
      id: "b1",
      faceValue: 100,
      resetConfig: { period: "quarterly" },
      usageRecords: [
        { usedDate: "2026-04-10", faceValue: 100, actualValue: 100, kind: "usage" },
      ],
    });
    const record: UsageRecord = {
      usedDate: "2026-04-10", faceValue: 100, actualValue: 100, kind: "usage",
    };
    render(
      <BenefitCard
        benefit={benefit}
        card={makeCard({ id: "c1" })}
        onToggleUsage={vi.fn()}
        cycleStart="2026-04-01"
        cycleEnd="2026-06-30"
        cycleUsed
        cycleRecord={record}
      />,
    );
    expect(screen.getByText("已用完")).toBeInTheDocument();
    expect(screen.getByText("✓")).toBeInTheDocument();
    expect(screen.getByLabelText("取消使用")).toBeInTheDocument();
  });
});
