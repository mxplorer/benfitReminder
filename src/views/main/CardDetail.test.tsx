import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Benefit, CreditCard } from "../../models/types";
import { useCardStore } from "../../stores/useCardStore";
import { CardDetail } from "./CardDetail";

const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "Hotel Credit",
  description: "",
  faceValue: 200,
  category: "hotel",
  resetType: "calendar",
  resetConfig: { period: "monthly" },
  isHidden: false,
  autoRecur: false,
  usageRecords: [],
  ...overrides,
});

const makeCard = (overrides: Partial<CreditCard> = {}): CreditCard => ({
  id: "c1",
  owner: "Alice",
  cardTypeSlug: "amex_platinum",
  alias: "My Amex",
  cardNumber: "1234",
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

describe("CardDetail", () => {
  it("shows card name and owner in header", () => {
    const card = makeCard();
    useCardStore.setState({ cards: [card] });
    render(<CardDetail cardId="c1" />);

    expect(screen.getByText("My Amex")).toBeInTheDocument();
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
  });

  it("shows all benefits by default (全部 filter)", () => {
    const b1 = makeBenefit({ id: "b1", name: "Benefit One" });
    const b2 = makeBenefit({ id: "b2", name: "Benefit Two", isHidden: true });
    const card = makeCard({ benefits: [b1, b2] });
    useCardStore.setState({ cards: [card] });

    render(<CardDetail cardId="c1" />);
    // 全部 shows non-hidden only by default (hidden excluded unless 已隐藏 filter)
    // Note: 全部 filter shows non-hidden benefits, 已隐藏 filter shows hidden
    expect(screen.getByText("Benefit One")).toBeInTheDocument();
    expect(screen.queryByText("Benefit Two")).not.toBeInTheDocument();
  });

  it("filter pill 已隐藏 shows only hidden benefits", () => {
    const b1 = makeBenefit({ id: "b1", name: "Visible" });
    const b2 = makeBenefit({ id: "b2", name: "Hidden Benefit", isHidden: true });
    const card = makeCard({ benefits: [b1, b2] });
    useCardStore.setState({ cards: [card] });

    render(<CardDetail cardId="c1" />);
    fireEvent.click(screen.getByText("已隐藏"));

    expect(screen.queryByText("Visible")).not.toBeInTheDocument();
    expect(screen.getByText("Hidden Benefit")).toBeInTheDocument();
  });

  it("filter pill 已使用 shows only used benefits", () => {
    const unused = makeBenefit({ id: "b1", name: "Unused Benefit" });
    const used = makeBenefit({
      id: "b2",
      name: "Used Benefit",
      usageRecords: [{ usedDate: "2026-04-05", faceValue: 200, actualValue: 200 }],
    });
    const card = makeCard({ benefits: [unused, used] });
    useCardStore.setState({ cards: [card] });

    render(<CardDetail cardId="c1" />);
    // Use the filter pills container to avoid ambiguity with StatusTag "已使用" text
    const filterPills = screen.getByTestId("filter-pills");
    const usedPill = filterPills.querySelector(".card-detail__filter-pill:nth-child(3)");
    if (!usedPill) throw new Error("已使用 filter pill not found");
    fireEvent.click(usedPill);

    const grid = screen.getByTestId("benefits-grid");
    expect(grid).not.toHaveTextContent("Unused Benefit");
    expect(grid).toHaveTextContent("Used Benefit");
  });

  it("renders usage history table with records", () => {
    const benefit = makeBenefit({
      usageRecords: [{ usedDate: "2026-03-01", faceValue: 200, actualValue: 150 }],
    });
    const card = makeCard({ benefits: [benefit] });
    useCardStore.setState({ cards: [card] });

    render(<CardDetail cardId="c1" />);

    const table = screen.getByTestId("history-table");
    expect(table).toBeInTheDocument();
    expect(table).toHaveTextContent("2026-03-01");
    expect(table).toHaveTextContent("$200");
    expect(table).toHaveTextContent("$150");
  });
});
