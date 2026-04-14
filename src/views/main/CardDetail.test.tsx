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
  rolloverable: false,
  rolloverMaxYears: 2,
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
    render(<CardDetail cardId="c1" onNavigate={() => undefined} />);

    expect(screen.getByText("My Amex")).toBeInTheDocument();
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
  });

  it("renders usage history table with records", () => {
    const benefit = makeBenefit({
      usageRecords: [{ usedDate: "2026-03-01", faceValue: 200, actualValue: 150 }],
    });
    const card = makeCard({ benefits: [benefit] });
    useCardStore.setState({ cards: [card] });

    render(<CardDetail cardId="c1" onNavigate={() => undefined} />);

    const table = screen.getByTestId("history-table");
    expect(table).toBeInTheDocument();
    expect(table).toHaveTextContent("2026-03-01");
    expect(table).toHaveTextContent("$200");
    expect(table).toHaveTextContent("$150");
  });
});

describe("CardDetail filter integration", () => {
  beforeEach(() => {
    useCardStore.setState({
      cards: [
        {
          id: "c1", owner: "me", cardTypeSlug: "amex-plat",
          annualFee: 695, cardOpenDate: "2024-01-01",
          color: "#000", isEnabled: true,
          benefits: [
            {
              id: "b-uber", name: "Uber Eats", description: "",
              faceValue: 15, category: "dining",
              resetType: "calendar", resetConfig: { period: "monthly" },
              isHidden: false, autoRecur: false,
              rolloverable: false, rolloverMaxYears: 0,
              usageRecords: [
                { usedDate: "2026-01-10", faceValue: 15, actualValue: 15 },
              ],
            },
            {
              id: "b-hidden", name: "Hidden One", description: "",
              faceValue: 50, category: "other",
              resetType: "calendar", resetConfig: { period: "annual" },
              isHidden: true, autoRecur: false,
              rolloverable: false, rolloverMaxYears: 0,
              usageRecords: [],
            },
          ],
        },
      ],
    });
  });

  it("defaults to 可使用 filter", () => {
    render(<CardDetail cardId="c1" onNavigate={() => undefined} />);
    const pill = screen.getByTestId("filter-pill-available");
    expect(pill.className).toMatch(/active/);
  });

  it("switches to 已使用 and shows aggregated monthly card", () => {
    render(<CardDetail cardId="c1" onNavigate={() => undefined} />);
    fireEvent.click(screen.getByTestId("filter-pill-used"));
    const grid = screen.getByTestId("benefits-grid");
    expect(grid).toHaveTextContent(/Uber Eats/);
    expect(grid).toHaveTextContent(/1 次/);
  });

  it("shows hidden benefit only when 已隐藏 filter active", () => {
    render(<CardDetail cardId="c1" onNavigate={() => undefined} />);
    fireEvent.click(screen.getByTestId("filter-pill-hidden"));
    expect(screen.getByText("Hidden One")).toBeInTheDocument();
  });

  it("includes hidden benefits in 全部", () => {
    render(<CardDetail cardId="c1" onNavigate={() => undefined} />);
    fireEvent.click(screen.getByTestId("filter-pill-all"));
    expect(screen.getByText("Hidden One")).toBeInTheDocument();
  });

  it("shows year-scope toggle only on 未使用 and 全部", () => {
    render(<CardDetail cardId="c1" onNavigate={() => undefined} />);
    fireEvent.click(screen.getByTestId("filter-pill-unused"));
    expect(screen.getByTestId("year-scope-toggle")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("filter-pill-used"));
    expect(screen.queryByTestId("year-scope-toggle")).toBeNull();
  });
});
