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

  it("does not render the autoRecur field for subscription benefits", () => {
    render(<BenefitEditor cardId="c1" onDone={vi.fn()} />);
    fireEvent.change(screen.getByTestId("reset-type-select"), {
      target: { value: "subscription" },
    });
    expect(screen.queryByTestId("auto-recur-field")).not.toBeInTheDocument();
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

  it("shows rollover fields when resetType is calendar", () => {
    render(<BenefitEditor cardId="c1" onDone={vi.fn()} />);
    expect(screen.getByTestId("rollover-field")).toBeInTheDocument();
    expect(screen.getByTestId("rollover-input")).toBeInTheDocument();
  });

  it("hides rollover fields for non-calendar reset types", () => {
    render(<BenefitEditor cardId="c1" onDone={vi.fn()} />);
    fireEvent.change(screen.getByTestId("reset-type-select"), {
      target: { value: "anniversary" },
    });
    expect(screen.queryByTestId("rollover-field")).not.toBeInTheDocument();
  });

  it("shows max years input when rollover is checked", () => {
    render(<BenefitEditor cardId="c1" onDone={vi.fn()} />);
    fireEvent.click(screen.getByTestId("rollover-input"));
    expect(screen.getByTestId("rollover-max-years-input")).toBeInTheDocument();
  });

  it("saves rolloverable and rolloverMaxYears on submit", () => {
    const card = { id: "c1", owner: "X", cardTypeSlug: "", annualFee: 0, cardOpenDate: "2024-01-01", color: "#000", isEnabled: true, benefits: [] };
    useCardStore.setState({ cards: [card] });
    render(<BenefitEditor cardId="c1" onDone={vi.fn()} />);

    fireEvent.change(screen.getByTestId("name-input"), { target: { value: "Test" } });
    fireEvent.change(screen.getByTestId("face-value-input"), { target: { value: "100" } });
    fireEvent.click(screen.getByTestId("rollover-input"));
    fireEvent.change(screen.getByTestId("rollover-max-years-input"), { target: { value: "3" } });
    fireEvent.click(screen.getByTestId("submit-btn"));

    const benefits = useCardStore.getState().cards[0].benefits;
    expect(benefits[0].rolloverable).toBe(true);
    expect(benefits[0].rolloverMaxYears).toBe(3);
  });

  it("shows resetsAtStatementClose checkbox only when resetType=anniversary", () => {
    useCardStore.setState({ cards: [makeCard({ statementClosingDay: 7 })] });
    render(<BenefitEditor cardId="c1" onDone={vi.fn()} />);

    fireEvent.change(screen.getByTestId("reset-type-select"), { target: { value: "anniversary" } });
    expect(screen.getByTestId("resets-at-statement-close")).toBeInTheDocument();
  });

  it("hides the checkbox when resetType is not anniversary", () => {
    useCardStore.setState({ cards: [makeCard({ statementClosingDay: 7 })] });
    render(<BenefitEditor cardId="c1" onDone={vi.fn()} />);

    fireEvent.change(screen.getByTestId("reset-type-select"), { target: { value: "calendar" } });
    expect(screen.queryByTestId("resets-at-statement-close")).not.toBeInTheDocument();
  });

  it("disables the checkbox when the parent card has no statementClosingDay", () => {
    useCardStore.setState({ cards: [makeCard({ statementClosingDay: undefined })] });
    render(<BenefitEditor cardId="c1" onDone={vi.fn()} />);

    fireEvent.change(screen.getByTestId("reset-type-select"), { target: { value: "anniversary" } });
    const checkbox = screen.getByTestId<HTMLInputElement>("resets-at-statement-close");
    expect(checkbox.disabled).toBe(true);
  });

  it("persists resetsAtStatementClose=true into resetConfig on save", () => {
    useCardStore.setState({ cards: [makeCard({ statementClosingDay: 7 })] });
    render(<BenefitEditor cardId="c1" onDone={vi.fn()} />);

    fireEvent.change(screen.getByTestId("name-input"), { target: { value: "Hotel" } });
    fireEvent.change(screen.getByTestId("face-value-input"), { target: { value: "50" } });
    fireEvent.change(screen.getByTestId("reset-type-select"), { target: { value: "anniversary" } });
    fireEvent.click(screen.getByTestId("resets-at-statement-close"));
    fireEvent.click(screen.getByTestId("submit-btn"));

    const benefits = useCardStore.getState().cards[0].benefits;
    expect(benefits[0].resetConfig.resetsAtStatementClose).toBe(true);
  });

  it("omits resetsAtStatementClose from resetConfig when unchecked", () => {
    useCardStore.setState({ cards: [makeCard({ statementClosingDay: 7 })] });
    render(<BenefitEditor cardId="c1" onDone={vi.fn()} />);

    fireEvent.change(screen.getByTestId("name-input"), { target: { value: "Hotel" } });
    fireEvent.change(screen.getByTestId("face-value-input"), { target: { value: "50" } });
    fireEvent.change(screen.getByTestId("reset-type-select"), { target: { value: "anniversary" } });
    fireEvent.click(screen.getByTestId("submit-btn"));

    const benefits = useCardStore.getState().cards[0].benefits;
    expect(benefits[0].resetConfig.resetsAtStatementClose).toBeUndefined();
  });
});
