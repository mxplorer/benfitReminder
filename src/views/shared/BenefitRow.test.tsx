import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Benefit, CreditCard } from "../../models/types";
import { BenefitRow } from "./BenefitRow";
import { useCardStore } from "../../stores/useCardStore";

const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "Test Benefit",
  description: "",
  faceValue: 50,
  category: "other",
  resetType: "calendar",
  resetConfig: { period: "monthly" },
  isHidden: false,
  rolloverable: false,
  rolloverMaxYears: 0,
  usageRecords: [],
  ...overrides,
});

const makeCard = (overrides: Partial<CreditCard> = {}): CreditCard => ({
  id: "c1",
  owner: "Test",
  cardTypeSlug: "amex_platinum",
  annualFee: 695,
  cardOpenDate: "2024-03-15",
  color: "#336699",
  isEnabled: true,
  benefits: [],
  ...overrides,
});

describe("BenefitRow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00"));
    useCardStore.setState({ cards: [] });
    useCardStore.getState().recalculate();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders benefit name, deadline, amount", () => {
    const benefit = makeBenefit({ name: "Uber Credit", faceValue: 15 });
    render(<BenefitRow benefit={benefit} card={makeCard()} onToggle={vi.fn()} />);

    expect(screen.getByText("Uber Credit")).toBeInTheDocument();
    // Monthly deadline on April 10 → April 30 = 20 days
    expect(screen.getByText("20 天")).toBeInTheDocument();
    expect(screen.getByText("$15")).toBeInTheDocument();
  });

  it("renders partial consumption as '$A of $F'", () => {
    const benefit = makeBenefit({
      faceValue: 15,
      usageRecords: [
        { usedDate: "2026-04-05", faceValue: 10, actualValue: 10, kind: "usage" },
      ],
    });
    render(<BenefitRow benefit={benefit} card={makeCard()} onToggle={vi.fn()} />);

    expect(screen.getByText("$10 of $15")).toBeInTheDocument();
  });

  it("calls onToggle with remaining value and today's date when checkbox clicked", () => {
    const handler = vi.fn();
    const benefit = makeBenefit({ id: "b1", faceValue: 25 });
    const card = makeCard({ id: "c1" });
    render(<BenefitRow benefit={benefit} card={card} onToggle={handler} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "标记使用" }));
    expect(handler).toHaveBeenCalledWith("c1", "b1", 25, "2026-04-10");
  });

  it("does not call onToggle when already used", () => {
    const handler = vi.fn();
    const benefit = makeBenefit({
      faceValue: 25,
      usageRecords: [
        { usedDate: "2026-04-05", faceValue: 25, actualValue: 25, kind: "usage" },
      ],
    });
    render(<BenefitRow benefit={benefit} card={makeCard()} onToggle={handler} />);

    // Already used — checkbox shows checked; clicking should be a no-op
    const box = screen.getByRole("checkbox", { name: "已使用" });
    fireEvent.click(box);
    expect(handler).not.toHaveBeenCalled();
  });

  it("hides card tag when showCardTag is false", () => {
    const benefit = makeBenefit();
    const card = makeCard({ owner: "Only-Me" });
    render(
      <BenefitRow benefit={benefit} card={card} onToggle={vi.fn()} showCardTag={false} />,
    );
    // No card name rendered
    expect(screen.queryByText(/Only-Me/)).toBeNull();
  });

  it("applies urgent styling when days remaining is within reminder window", () => {
    // reminderDays default 3 — set system time to April 29 so monthly deadline
    // April 30 is within 3 days.
    vi.setSystemTime(new Date("2026-04-29T12:00:00"));
    useCardStore.getState().recalculate();
    const benefit = makeBenefit();
    const { container } = render(
      <BenefitRow benefit={benefit} card={makeCard()} onToggle={vi.fn()} />,
    );
    expect(container.querySelector(".benefit-row--urgent")).not.toBeNull();
    expect(container.querySelector(".benefit-row__dot--urgent")).not.toBeNull();
  });

  it("renders months label when deadline is more than 30 days away", () => {
    const benefit = makeBenefit({
      resetType: "calendar",
      resetConfig: { period: "quarterly" },
    });
    render(<BenefitRow benefit={benefit} card={makeCard()} onToggle={vi.fn()} />);
    // April 10 → June 30 = ~81 days → 3 个月
    expect(screen.getByText("3 个月")).toBeInTheDocument();
  });
});
