import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CreditCard } from "../../models/types";
import { useCardStore } from "../../stores/useCardStore";
import { Dashboard } from "./Dashboard";

const makeCard = (overrides: Partial<CreditCard> = {}): CreditCard => ({
  id: "c1",
  owner: "Alice",
  cardTypeSlug: "amex_platinum",
  alias: "My Amex",
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
  vi.setSystemTime(new Date("2026-04-10T12:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Dashboard", () => {
  it("shows current month, quarter, and half in period bar", () => {
    render(<Dashboard />);
    const bar = screen.getByTestId("period-bar");
    expect(bar).toHaveTextContent("4月");
    expect(bar).toHaveTextContent("Q2");
    expect(bar).toHaveTextContent("H1");
  });

  it("renders available years and current year active", () => {
    render(<Dashboard />);
    expect(screen.getByText("2026")).toBeInTheDocument();
    expect(screen.getByText("2025")).toBeInTheDocument();
    expect(screen.getByText("2024")).toBeInTheDocument();
    expect(screen.getByText("2026").className).toContain("dashboard__year-btn--active");
  });

  it("switches year when year button clicked", () => {
    render(<Dashboard />);
    fireEvent.click(screen.getByText("2025"));
    expect(screen.getByText("2025").className).toContain("dashboard__year-btn--active");
    expect(screen.getByText("2026").className).not.toContain("dashboard__year-btn--active");
  });

  it("shows correct ROI totals from store data", () => {
    const card = makeCard({
      benefits: [{
        id: "b1",
        name: "Benefit",
        description: "",
        faceValue: 200,
        category: "other",
        resetType: "calendar",
        resetConfig: { period: "monthly" },
        isHidden: false,
        autoRecur: false,
        rolloverable: false,
        rolloverMaxYears: 2,
        usageRecords: [{ usedDate: "2026-03-15", faceValue: 200, actualValue: 150 }],
      }],
    });
    useCardStore.setState({ cards: [card] });

    render(<Dashboard />);
    expect(screen.getByTestId("total-fee")).toHaveTextContent("$895");
    expect(screen.getByTestId("total-face")).toHaveTextContent("$200");
    expect(screen.getByTestId("total-actual")).toHaveTextContent("$150");
  });

  it("applies not-recovered class to cards below 100% ROI", () => {
    const card = makeCard({ benefits: [] }); // 0 actual return, 895 fee → not recovered
    useCardStore.setState({ cards: [card] });

    render(<Dashboard />);
    // The card row wraps in a GlassContainer with the class
    const rows = document.querySelectorAll(".dashboard__card-row--not-recovered");
    expect(rows.length).toBe(1);
  });

  it("navigates to card detail when card row is clicked", () => {
    const card = makeCard({ id: "c42" });
    useCardStore.setState({ cards: [card] });
    const onNavigate = vi.fn();

    render(<Dashboard onNavigate={onNavigate} />);

    const row = document.querySelector(".dashboard__card-row");
    expect(row).not.toBeNull();
    fireEvent.click(row!);
    expect(onNavigate).toHaveBeenCalledWith({ type: "card", cardId: "c42" });
  });
});
