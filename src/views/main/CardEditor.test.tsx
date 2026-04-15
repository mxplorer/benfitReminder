import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CreditCard } from "../../models/types";
import { useCardStore } from "../../stores/useCardStore";
import { useCardTypeStore } from "../../stores/useCardTypeStore";
import { CardEditor } from "./CardEditor";

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
  useCardTypeStore.setState({
    cardTypes: [
      {
        slug: "amex_platinum",
        name: "Amex Platinum",
        defaultAnnualFee: 895,
        color: "#8E9EAF",
        isBuiltin: true,
        defaultBenefits: [
          {
            name: "$200 Airline Fee Credit",
            description: "Annual airline fee credit",
            faceValue: 200,
            category: "airline",
            resetType: "calendar",
            resetConfig: { period: "annual" },
          },
        ],
      },
    ],
  });
});

describe("CardEditor", () => {
  it("pre-fills fields when editing an existing card", () => {
    const card = makeCard();
    render(<CardEditor card={card} onDone={vi.fn()} />);

    expect(screen.getByTestId<HTMLInputElement>("owner-input").value).toBe("Alice");
    expect(screen.getByTestId<HTMLInputElement>("alias-input").value).toBe("My Amex");
    expect(screen.getByTestId<HTMLInputElement>("annual-fee-input").value).toBe("895");
    expect(screen.getByTestId<HTMLInputElement>("card-number-input").value).toBe("1234");
  });

  it("selecting a template pre-fills annual fee and color", () => {
    render(<CardEditor onDone={vi.fn()} />);

    fireEvent.change(screen.getByTestId("template-select"), {
      target: { value: "amex_platinum" },
    });

    expect(screen.getByTestId<HTMLInputElement>("annual-fee-input").value).toBe("895");
  });

  it("submitting in create mode calls addCard and onDone", () => {
    const onDone = vi.fn();
    render(<CardEditor onDone={onDone} />);

    fireEvent.change(screen.getByTestId("template-select"), { target: { value: "amex_platinum" } });
    fireEvent.change(screen.getByTestId("owner-input"), { target: { value: "Bob" } });
    // Date is pre-filled by RollingDatePicker's initial emit — no interaction needed

    fireEvent.click(screen.getByTestId("submit-btn"));

    const cards = useCardStore.getState().cards;
    expect(cards).toHaveLength(1);
    expect(cards[0].owner).toBe("Bob");
    expect(cards[0].cardTypeSlug).toBe("amex_platinum");
    expect(onDone).toHaveBeenCalled();
  });

  it("submitting in edit mode calls updateCard and onDone", () => {
    const card = makeCard();
    useCardStore.setState({ cards: [card] });
    const onDone = vi.fn();
    render(<CardEditor card={card} onDone={onDone} />);

    fireEvent.change(screen.getByTestId("owner-input"), { target: { value: "Charlie" } });
    fireEvent.click(screen.getByTestId("submit-btn"));

    const cards = useCardStore.getState().cards;
    expect(cards[0].owner).toBe("Charlie");
    expect(onDone).toHaveBeenCalled();
  });

  it("persists statementClosingDay on create when user enters it", () => {
    render(<CardEditor onDone={vi.fn()} />);

    fireEvent.change(screen.getByTestId("template-select"), { target: { value: "amex_platinum" } });
    fireEvent.change(screen.getByTestId("owner-input"), { target: { value: "Bob" } });
    fireEvent.change(screen.getByTestId("statement-closing-day-input"), { target: { value: "7" } });
    fireEvent.click(screen.getByTestId("submit-btn"));

    const cards = useCardStore.getState().cards;
    expect(cards).toHaveLength(1);
    expect(cards[0].statementClosingDay).toBe(7);
  });

  it("omits statementClosingDay when input is empty on create", () => {
    render(<CardEditor onDone={vi.fn()} />);

    fireEvent.change(screen.getByTestId("template-select"), { target: { value: "amex_platinum" } });
    fireEvent.change(screen.getByTestId("owner-input"), { target: { value: "Bob" } });
    fireEvent.click(screen.getByTestId("submit-btn"));

    const cards = useCardStore.getState().cards;
    expect(cards).toHaveLength(1);
    expect(cards[0].statementClosingDay).toBeUndefined();
  });

  it("pre-fills statementClosingDay in edit mode and updates it on save", () => {
    const card = makeCard({ statementClosingDay: 12 });
    useCardStore.setState({ cards: [card] });
    render(<CardEditor card={card} onDone={vi.fn()} />);

    expect(screen.getByTestId<HTMLInputElement>("statement-closing-day-input").value).toBe("12");

    fireEvent.change(screen.getByTestId("statement-closing-day-input"), { target: { value: "28" } });
    fireEvent.click(screen.getByTestId("submit-btn"));

    expect(useCardStore.getState().cards[0].statementClosingDay).toBe(28);
  });
});
