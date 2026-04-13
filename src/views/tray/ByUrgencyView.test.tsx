import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Benefit, CreditCard } from "../../models/types";
import { useCardStore } from "../../stores/useCardStore";
import { ByUrgencyView } from "./ByUrgencyView";

const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "Test Benefit",
  description: "",
  faceValue: 50,
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

beforeEach(() => {
  useCardStore.setState({ cards: [] });
  vi.useFakeTimers();
  // April 10: monthly deadline is April 30 (20 days remaining)
  // quarterly deadline is June 30 (81 days remaining)
  vi.setSystemTime(new Date("2026-04-10T12:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ByUrgencyView", () => {
  it("shows empty state when no unused benefits", () => {
    render(<ByUrgencyView />);
    expect(screen.getByText("暂无待使用权益")).toBeInTheDocument();
  });

  it("renders unused benefits sorted by urgency (fewest days first)", () => {
    // monthly resets in ~20 days, quarterly in ~81 days
    const urgentBenefit = makeBenefit({ id: "b1", name: "Monthly Benefit", resetConfig: { period: "monthly" } });
    const lessUrgent = makeBenefit({ id: "b2", name: "Quarterly Benefit", resetType: "calendar", resetConfig: { period: "quarterly" } });
    const card = makeCard({ benefits: [lessUrgent, urgentBenefit] });
    useCardStore.setState({ cards: [card] });

    render(<ByUrgencyView />);

    const items = screen.getAllByText(/Benefit/);
    // Monthly should appear before Quarterly
    expect(items[0].textContent).toBe("Monthly Benefit");
    expect(items[1].textContent).toBe("Quarterly Benefit");
  });

  it("excludes hidden benefits", () => {
    const hidden = makeBenefit({ id: "b1", name: "Hidden Benefit", isHidden: true });
    const card = makeCard({ benefits: [hidden] });
    useCardStore.setState({ cards: [card] });

    render(<ByUrgencyView />);

    expect(screen.queryByText("Hidden Benefit")).not.toBeInTheDocument();
    expect(screen.getByText("暂无待使用权益")).toBeInTheDocument();
  });

  it("excludes already-used benefits", () => {
    const used = makeBenefit({
      id: "b1",
      name: "Used Benefit",
      usageRecords: [{ usedDate: "2026-04-05", faceValue: 50, actualValue: 50 }],
    });
    const card = makeCard({ benefits: [used] });
    useCardStore.setState({ cards: [card] });

    render(<ByUrgencyView />);

    expect(screen.queryByText("Used Benefit")).not.toBeInTheDocument();
  });

  it("calls store toggleBenefitUsage with actual value after prompt confirm", () => {
    const benefit = makeBenefit({ id: "b1", name: "Clickable", faceValue: 100 });
    const card = makeCard({ id: "c1", benefits: [benefit] });
    useCardStore.setState({ cards: [card] });
    const toggleSpy = vi.spyOn(useCardStore.getState(), "toggleBenefitUsage");

    render(<ByUrgencyView />);

    fireEvent.click(screen.getByRole("button", { name: "标记使用" }));
    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    expect(toggleSpy).toHaveBeenCalledWith("c1", "b1", 100, "2026-04-10");
  });

  it("excludes auto-recur subscription benefits", () => {
    const autoSub = makeBenefit({
      id: "b1",
      name: "Auto Sub Benefit",
      resetType: "subscription",
      autoRecur: true,
    });
    const card = makeCard({ benefits: [autoSub] });
    useCardStore.setState({ cards: [card] });

    render(<ByUrgencyView />);

    expect(screen.queryByText("Auto Sub Benefit")).not.toBeInTheDocument();
    expect(screen.getByText("暂无待使用权益")).toBeInTheDocument();
  });
});
