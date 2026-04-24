import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Benefit, CreditCard } from "../../models/types";
import { RolloverEditDialog } from "./RolloverEditDialog";
import { useCardStore } from "../../stores/useCardStore";

const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "$300 Airline Credit",
  description: "",
  faceValue: 300,
  category: "travel",
  resetType: "calendar",
  resetConfig: { period: "annual" },
  isHidden: false,
  rolloverable: true,
  rolloverMaxYears: 2,
  usageRecords: [],
  ...overrides,
});

const makeCard = (benefits: Benefit[]): CreditCard => ({
  id: "c1",
  owner: "Test",
  cardTypeSlug: "amex_platinum",
  annualFee: 695,
  cardOpenDate: "2023-01-15",
  color: "#8E9EAF",
  isEnabled: true,
  benefits,
});

describe("RolloverEditDialog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00"));
    useCardStore.setState({
      cards: [],
      settings: useCardStore.getState().settings,
      now: new Date("2026-04-10T12:00:00"),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("shows current available and a roll button when no rollover exists", () => {
    const benefit = makeBenefit();
    const card = makeCard([benefit]);
    useCardStore.setState({ cards: [card] });

    render(<RolloverEditDialog card={card} benefit={benefit} onClose={() => {}} />);

    const btn = screen.getByTestId("rollover-toggle-btn");
    expect(btn.textContent).toMatch(/结转.*\$300/);
    expect(btn.hasAttribute("disabled")).toBe(false);
  });

  it("rolling creates a current-cycle rollover record with faceValue = current available", () => {
    const benefit = makeBenefit();
    const card = makeCard([benefit]);
    useCardStore.setState({ cards: [card] });
    const onClose = vi.fn();

    render(<RolloverEditDialog card={card} benefit={benefit} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("rollover-toggle-btn"));

    const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      usedDate: "2026-01-01",
      faceValue: 300,
      actualValue: 0,
      kind: "rollover",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("with partial consumption, rolled amount = remaining available", () => {
    // $75 already consumed this cycle; rolling should transfer the remaining $225.
    const benefit = makeBenefit({
      usageRecords: [
        { usedDate: "2026-02-01", faceValue: 75, actualValue: 75, kind: "usage" },
      ],
    });
    const card = makeCard([benefit]);
    useCardStore.setState({ cards: [card] });

    render(<RolloverEditDialog card={card} benefit={benefit} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("rollover-toggle-btn"));

    const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
    const rollover = records.find((r) => r.kind === "rollover");
    expect(rollover).toMatchObject({
      usedDate: "2026-01-01",
      faceValue: 225,
      kind: "rollover",
    });
  });

  it("clicking again when rollover exists removes it (undo)", () => {
    const benefit = makeBenefit({
      usageRecords: [
        { usedDate: "2026-01-01", faceValue: 300, actualValue: 0, kind: "rollover" },
      ],
    });
    const card = makeCard([benefit]);
    useCardStore.setState({ cards: [card] });

    render(<RolloverEditDialog card={card} benefit={benefit} onClose={() => {}} />);
    const btn = screen.getByTestId("rollover-toggle-btn");
    expect(btn.textContent).toMatch(/撤销/);
    fireEvent.click(btn);

    const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
    expect(records.filter((r) => r.kind === "rollover")).toHaveLength(0);
  });

  it("toggle button is disabled when available is 0 and no existing rollover", () => {
    const benefit = makeBenefit({
      usageRecords: [
        { usedDate: "2026-02-01", faceValue: 300, actualValue: 300, kind: "usage" },
      ],
    });
    const card = makeCard([benefit]);
    useCardStore.setState({ cards: [card] });

    render(<RolloverEditDialog card={card} benefit={benefit} onClose={() => {}} />);
    const btn = screen.getByTestId("rollover-toggle-btn");
    expect(btn.hasAttribute("disabled")).toBe(true);
  });

  it("next-cycle preview = faceValue + rolled amount", () => {
    const benefit = makeBenefit({
      usageRecords: [
        { usedDate: "2026-02-01", faceValue: 100, actualValue: 100, kind: "usage" },
      ],
    });
    const card = makeCard([benefit]);
    useCardStore.setState({ cards: [card] });

    render(<RolloverEditDialog card={card} benefit={benefit} onClose={() => {}} />);
    // available = 300 - 100 = 200, nextCycleTotalFace = 300 + 200 = 500
    expect(screen.getByTestId("rollover-edit-next-available").textContent).toBe("$500");
  });

  it("throws on mount in DEV when benefit is non-rolloverable", () => {
    vi.stubEnv("DEV", true);
    const benefit = makeBenefit({ rolloverable: false });
    const card = makeCard([benefit]);
    useCardStore.setState({ cards: [card] });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(<RolloverEditDialog card={card} benefit={benefit} onClose={() => {}} />),
    ).toThrow(/rolloverable/i);
    consoleError.mockRestore();
  });

  it("renders null in prod when benefit is non-rolloverable", () => {
    vi.stubEnv("DEV", false);
    const benefit = makeBenefit({ rolloverable: false });
    const card = makeCard([benefit]);
    useCardStore.setState({ cards: [card] });

    const { container } = render(
      <RolloverEditDialog card={card} benefit={benefit} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
