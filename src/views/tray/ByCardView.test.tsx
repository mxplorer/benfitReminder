import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Benefit, CreditCard } from "../../models/types";
import { useCardStore } from "../../stores/useCardStore";
import { ByCardView } from "./ByCardView";

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
  vi.setSystemTime(new Date("2026-04-10T12:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ByCardView", () => {
  it("renders benefits grouped under their card", () => {
    const benefit1 = makeBenefit({ id: "b1", name: "Airline Credit" });
    const benefit2 = makeBenefit({ id: "b2", name: "Hotel Credit" });
    const card = makeCard({ id: "c1", alias: "My Amex", benefits: [benefit1, benefit2] });
    useCardStore.setState({ cards: [card] });

    render(<ByCardView />);

    expect(screen.getByText("My Amex")).toBeInTheDocument();
    expect(screen.getByText("Airline Credit")).toBeInTheDocument();
    expect(screen.getByText("Hotel Credit")).toBeInTheDocument();
  });

  it("excludes hidden benefits from the grid", () => {
    const visible = makeBenefit({ id: "b1", name: "Visible Benefit" });
    const hidden = makeBenefit({ id: "b2", name: "Hidden Benefit", isHidden: true });
    const card = makeCard({ benefits: [visible, hidden] });
    useCardStore.setState({ cards: [card] });

    render(<ByCardView />);

    expect(screen.getByText("Visible Benefit")).toBeInTheDocument();
    expect(screen.queryByText("Hidden Benefit")).not.toBeInTheDocument();
  });

  it("excludes disabled cards entirely", () => {
    const card = makeCard({ isEnabled: false, benefits: [makeBenefit({ name: "Disabled Card Benefit" })] });
    useCardStore.setState({ cards: [card] });

    render(<ByCardView />);

    expect(screen.queryByText("Disabled Card Benefit")).not.toBeInTheDocument();
  });

  it("calls store toggleBenefitUsage with actual value after prompt confirm", () => {
    const benefit = makeBenefit({ id: "b1", name: "Clickable Benefit", faceValue: 100 });
    const card = makeCard({ id: "c1", benefits: [benefit] });
    useCardStore.setState({ cards: [card] });
    const toggleSpy = vi.spyOn(useCardStore.getState(), "toggleBenefitUsage");

    render(<ByCardView />);

    // Click check button → prompt appears
    fireEvent.click(screen.getByRole("button", { name: "标记使用" }));
    // Confirm with default face value
    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    expect(toggleSpy).toHaveBeenCalledWith("c1", "b1", 100, "2026-04-10");
  });
});
