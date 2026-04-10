import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CreditCard } from "../../models/types";
import { useCardStore } from "../../stores/useCardStore";
import { MainWindow } from "./MainWindow";

const makeCard = (overrides: Partial<CreditCard> = {}): CreditCard => ({
  id: "c1",
  owner: "Test",
  cardTypeSlug: "amex_platinum",
  alias: "My Card",
  annualFee: 895,
  cardOpenDate: "2024-03-15",
  color: "#8E9EAF",
  isEnabled: true,
  benefits: [],
  ...overrides,
});

beforeEach(() => {
  useCardStore.setState({ cards: [] });
});

describe("MainWindow", () => {
  it("renders Dashboard by default", () => {
    render(<MainWindow />);
    expect(screen.getByTestId("view-dashboard")).toBeInTheDocument();
  });

  it("switches to 历史记录 view when clicked", () => {
    render(<MainWindow />);
    fireEvent.click(screen.getByText("历史记录"));
    expect(screen.getByTestId("view-history")).toBeInTheDocument();
  });

  it("switches to 设置 view when clicked", () => {
    render(<MainWindow />);
    fireEvent.click(screen.getByText("设置"));
    expect(screen.getByTestId("view-settings")).toBeInTheDocument();
  });

  it("shows cards from store in sidebar and navigates to card detail", () => {
    useCardStore.setState({ cards: [makeCard({ id: "c1", alias: "My Amex" })] });
    render(<MainWindow />);

    expect(screen.getByText("My Amex")).toBeInTheDocument();

    fireEvent.click(screen.getByText("My Amex"));
    expect(screen.getByTestId("view-card-c1")).toBeInTheDocument();
  });
});
