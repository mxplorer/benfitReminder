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
  it("renders current year as title with range picker label", () => {
    render(<Dashboard />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("2026");
    expect(screen.getByTestId("year-picker")).toHaveTextContent("Jan 2026 — Dec 2026");
  });

  it("shows current month, quarter, and half pills", () => {
    render(<Dashboard />);
    const bar = screen.getByTestId("period-bar");
    expect(bar).toHaveTextContent("4月");
    expect(bar).toHaveTextContent("Q2");
    expect(bar).toHaveTextContent("H1");
  });

  it("hides 待拿 cell when selected year is not current year", () => {
    render(<Dashboard />);
    expect(screen.getByTestId("hero-pending")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Previous year"));
    expect(screen.queryByTestId("hero-pending")).toBeNull();
    expect(screen.queryByTestId("hero-review-btn")).toBeNull();
  });

  it("shows current-month usage only for current year", () => {
    const card = makeCard({
      benefits: [{
        id: "b1",
        name: "B",
        description: "",
        faceValue: 200,
        category: "other",
        resetType: "calendar",
        resetConfig: { period: "monthly" },
        isHidden: false,
        rolloverable: false,
        rolloverMaxYears: 2,
        usageRecords: [
          { usedDate: "2026-04-02", faceValue: 200, actualValue: 150, kind: "usage" },
          { usedDate: "2026-04-10", faceValue: 100, actualValue: 80, kind: "usage" },
          { usedDate: "2026-03-15", faceValue: 50, actualValue: 40, kind: "usage" },
        ],
      }],
    });
    useCardStore.setState({ cards: [card] });

    render(<Dashboard />);
    // Today is 2026-04-10 → April usage = 150 + 80 = 230
    expect(screen.getByTestId("current-month-usage")).toHaveTextContent("本月 +$230");

    fireEvent.click(screen.getByLabelText("Previous year"));
    expect(screen.queryByTestId("current-month-usage")).toBeNull();
  });

  it("excludes cards opened after selected year from all year-scoped totals", () => {
    const oldCard = makeCard({
      id: "old",
      annualFee: 100,
      cardOpenDate: "2023-01-01",
    });
    const futureCard = makeCard({
      id: "future",
      annualFee: 500,
      cardOpenDate: "2026-06-01",
      benefits: [{
        id: "b1",
        name: "B",
        description: "",
        faceValue: 50,
        category: "other",
        resetType: "calendar",
        resetConfig: { period: "annual" },
        isHidden: false,
        rolloverable: false,
        rolloverMaxYears: 2,
        usageRecords: [],
      }],
    });
    useCardStore.setState({ cards: [oldCard, futureCard] });

    render(<Dashboard />);

    // Current year (2026): both cards active
    expect(screen.getByTestId("active-card-count")).toHaveTextContent("2");
    expect(screen.getByTestId("total-fee")).toHaveTextContent("$600");

    // Previous year (2025): futureCard not yet opened
    fireEvent.click(screen.getByLabelText("Previous year"));
    expect(screen.getByTestId("active-card-count")).toHaveTextContent("1");
    expect(screen.getByTestId("total-fee")).toHaveTextContent("$100");
    // Only old card appears in the bottom list
    expect(document.querySelectorAll(".dashboard__tile")).toHaveLength(1);
  });

  it("year picker arrows advance and retreat selected year", () => {
    render(<Dashboard />);
    fireEvent.click(screen.getByLabelText("Previous year"));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("2025");
    fireEvent.click(screen.getByLabelText("Next year"));
    fireEvent.click(screen.getByLabelText("Next year"));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("2027");
  });

  it("shows total annual fee, redeemed amount, and equivalent fee", () => {
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
        rolloverable: false,
        rolloverMaxYears: 2,
        usageRecords: [{ usedDate: "2026-03-15", faceValue: 200, actualValue: 150, kind: "usage" }],
      }],
    });
    useCardStore.setState({ cards: [card] });

    render(<Dashboard />);
    expect(screen.getByTestId("total-fee")).toHaveTextContent("$895");
    expect(screen.getByTestId("total-actual")).toHaveTextContent("$150");
    // effective = 895 - 150 = 745
    expect(screen.getByTestId("effective-fee")).toHaveTextContent("$745");
  });

  it("shows equivalent fee in recovered style when actual >= annual fee", () => {
    const card = makeCard({
      annualFee: 100,
      benefits: [{
        id: "b1",
        name: "Benefit",
        description: "",
        faceValue: 300,
        category: "other",
        resetType: "calendar",
        resetConfig: { period: "monthly" },
        isHidden: false,
        rolloverable: false,
        rolloverMaxYears: 2,
        usageRecords: [{ usedDate: "2026-03-15", faceValue: 300, actualValue: 300, kind: "usage" }],
      }],
    });
    useCardStore.setState({ cards: [card] });

    render(<Dashboard />);
    const eff = screen.getByTestId("effective-fee");
    expect(eff.className).toContain("dashboard__net--recovered");
    expect(eff).toHaveTextContent("−$200");
  });

  it("shows active card count and tracked benefits count", () => {
    const cards = [
      makeCard({
        id: "c1",
        benefits: [
          {
            id: "b1",
            name: "B1",
            description: "",
            faceValue: 100,
            category: "other",
            resetType: "calendar",
            resetConfig: { period: "annual" },
            isHidden: false,
            rolloverable: false,
            rolloverMaxYears: 2,
            usageRecords: [],
          },
          {
            id: "b2",
            name: "B2 hidden",
            description: "",
            faceValue: 50,
            category: "other",
            resetType: "calendar",
            resetConfig: { period: "annual" },
            isHidden: true,
            rolloverable: false,
            rolloverMaxYears: 2,
            usageRecords: [],
          },
        ],
      }),
      makeCard({ id: "c2" }),
    ];
    useCardStore.setState({ cards });

    render(<Dashboard />);
    expect(screen.getByTestId("active-card-count")).toHaveTextContent("2");
    // only non-hidden: 1
    expect(screen.getByTestId("hero-active")).toHaveTextContent("共 1 项权益");
  });

  it("disables Review when there are no unused benefits at all", () => {
    useCardStore.setState({ cards: [makeCard()] });

    render(<Dashboard />);
    expect(screen.getByTestId("left-on-table")).toHaveTextContent("$0");
    expect(screen.getByTestId("hero-review-btn")).toBeDisabled();
  });

  it("Review navigates to first card with unused benefits even when nothing is urgent", () => {
    const card = makeCard({
      id: "c99",
      benefits: [{
        id: "b1",
        name: "Yearly credit",
        description: "",
        faceValue: 200,
        category: "other",
        // calendar annual benefit is applicable all year, deadline Dec 31 → not urgent in April
        resetType: "calendar",
        resetConfig: { period: "annual" },
        isHidden: false,
        rolloverable: false,
        rolloverMaxYears: 2,
        usageRecords: [],
      }],
    });
    useCardStore.setState({ cards: [card] });
    const onNavigate = vi.fn();

    render(<Dashboard onNavigate={onNavigate} />);
    const btn = screen.getByTestId("hero-review-btn");
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onNavigate).toHaveBeenCalledWith({ type: "card", cardId: "c99" });
  });

  it("Review button navigates to first urgent card", () => {
    const card = makeCard({
      id: "c42",
      benefits: [{
        id: "b1",
        name: "Urgent",
        description: "",
        faceValue: 120,
        category: "other",
        resetType: "calendar",
        resetConfig: { period: "monthly" },
        isHidden: false,
        rolloverable: false,
        rolloverMaxYears: 2,
        usageRecords: [],
      }],
    });
    useCardStore.setState({
      cards: [card],
      settings: { ...useCardStore.getState().settings, reminderDays: 30 },
    });
    const onNavigate = vi.fn();

    render(<Dashboard onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId("hero-review-btn"));
    expect(onNavigate).toHaveBeenCalledWith({ type: "card", cardId: "c42" });
  });

  it("marks tile with danger status when ROI is far below 100%", () => {
    const card = makeCard({ benefits: [] }); // 0 actual, 895 fee → danger (< 80%)
    useCardStore.setState({ cards: [card] });

    render(<Dashboard />);
    const tile = screen.getByTestId("card-tile-c1");
    expect(tile.getAttribute("data-status")).toBe("danger");
    expect(tile).toHaveTextContent("$895");
  });

  it("navigates to card detail when tile is clicked", () => {
    const card = makeCard({ id: "c42" });
    useCardStore.setState({ cards: [card] });
    const onNavigate = vi.fn();

    render(<Dashboard onNavigate={onNavigate} />);

    fireEvent.click(screen.getByTestId("card-tile-c42"));
    expect(onNavigate).toHaveBeenCalledWith({ type: "card", cardId: "c42" });
  });
});
