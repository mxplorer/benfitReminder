import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Benefit, CreditCard } from "../../models/types";
import { useCardStore } from "../../stores/useCardStore";
import { BenefitEditor } from "./BenefitEditor";

const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "Hotel Credit",
  description: "A nice credit",
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

describe("BenefitEditor", () => {
  it("pre-fills fields when editing an existing benefit", () => {
    const benefit = makeBenefit();
    const card = makeCard({ benefits: [benefit] });
    useCardStore.setState({ cards: [card] });

    render(<BenefitEditor cardId="c1" benefit={benefit} onDone={vi.fn()} />);

    expect(screen.getByTestId<HTMLInputElement>("name-input").value).toBe("Hotel Credit");
    expect(screen.getByTestId<HTMLInputElement>("face-value-input").value).toBe("200");
    expect(screen.getByTestId<HTMLSelectElement>("category-select").value).toBe("hotel");
  });

  it("shows calendar-specific fields when resetType is calendar", () => {
    render(<BenefitEditor cardId="c1" onDone={vi.fn()} />);
    // calendar is the default
    expect(screen.getByTestId("calendar-fields")).toBeInTheDocument();
    expect(screen.queryByTestId("cooldown-field")).not.toBeInTheDocument();
    expect(screen.queryByTestId("auto-recur-field")).not.toBeInTheDocument();
  });

  it("shows cooldown field when resetType switches to since_last_use", () => {
    render(<BenefitEditor cardId="c1" onDone={vi.fn()} />);

    fireEvent.change(screen.getByTestId("reset-type-select"), {
      target: { value: "since_last_use" },
    });

    expect(screen.getByTestId("cooldown-field")).toBeInTheDocument();
    expect(screen.queryByTestId("calendar-fields")).not.toBeInTheDocument();
  });

  it("shows auto-recur checkbox when resetType is subscription", () => {
    render(<BenefitEditor cardId="c1" onDone={vi.fn()} />);

    fireEvent.change(screen.getByTestId("reset-type-select"), {
      target: { value: "subscription" },
    });

    expect(screen.getByTestId("auto-recur-field")).toBeInTheDocument();
  });

  it("submitting in create mode calls addBenefit and onDone", () => {
    const card = makeCard();
    useCardStore.setState({ cards: [card] });
    const onDone = vi.fn();

    render(<BenefitEditor cardId="c1" onDone={onDone} />);

    fireEvent.change(screen.getByTestId("name-input"), { target: { value: "New Benefit" } });
    fireEvent.change(screen.getByTestId("face-value-input"), { target: { value: "100" } });
    fireEvent.click(screen.getByTestId("submit-btn"));

    const updatedCard = useCardStore.getState().cards.find((c) => c.id === "c1");
    expect(updatedCard?.benefits).toHaveLength(1);
    expect(updatedCard?.benefits[0].name).toBe("New Benefit");
    expect(updatedCard?.benefits[0].faceValue).toBe(100);
    expect(onDone).toHaveBeenCalled();
  });

  it("submitting in edit mode updates the benefit in place", () => {
    const benefit = makeBenefit({ id: "b1" });
    const card = makeCard({ benefits: [benefit] });
    useCardStore.setState({ cards: [card] });
    const onDone = vi.fn();

    render(<BenefitEditor cardId="c1" benefit={benefit} onDone={onDone} />);

    fireEvent.change(screen.getByTestId("name-input"), { target: { value: "Updated Name" } });
    fireEvent.click(screen.getByTestId("submit-btn"));

    const updatedCard = useCardStore.getState().cards.find((c) => c.id === "c1");
    expect(updatedCard?.benefits[0].name).toBe("Updated Name");
    expect(updatedCard?.benefits[0].id).toBe("b1"); // same id, not duplicated
    expect(onDone).toHaveBeenCalled();
  });
});
