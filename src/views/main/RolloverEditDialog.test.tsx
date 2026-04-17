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
    useCardStore.setState({ cards: [], settings: useCardStore.getState().settings });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("seeds amount input from (past-cycle rollover count × faceValue)", () => {
    const benefit = makeBenefit({
      usageRecords: [
        { usedDate: "2025-01-01", faceValue: 0, actualValue: 0, kind: "rollover" },
        { usedDate: "2024-01-01", faceValue: 0, actualValue: 0, kind: "rollover" },
      ],
    });
    const card = makeCard([benefit]);
    useCardStore.setState({ cards: [card] });

    render(<RolloverEditDialog card={card} benefit={benefit} onClose={() => {}} />);

    const input = screen.getByLabelText(/accumulated/i);
    expect(input.value).toBe("600");
  });

  it("seeds to 0 when no past-cycle rollover records exist", () => {
    const benefit = makeBenefit();
    const card = makeCard([benefit]);
    useCardStore.setState({ cards: [card] });

    render(<RolloverEditDialog card={card} benefit={benefit} onClose={() => {}} />);

    const input = screen.getByLabelText(/accumulated/i);
    expect(input.value).toBe("0");
  });

  it("ignores current-cycle rollover record when computing seed", () => {
    const benefit = makeBenefit({
      usageRecords: [
        { usedDate: "2026-01-01", faceValue: 0, actualValue: 0, kind: "rollover" },
        { usedDate: "2025-01-01", faceValue: 0, actualValue: 0, kind: "rollover" },
      ],
    });
    const card = makeCard([benefit]);
    useCardStore.setState({ cards: [card] });

    render(<RolloverEditDialog card={card} benefit={benefit} onClose={() => {}} />);

    const input = screen.getByLabelText(/accumulated/i);
    expect(input.value).toBe("300");
  });

  it("preview updates live as user types", () => {
    const benefit = makeBenefit();
    const card = makeCard([benefit]);
    useCardStore.setState({ cards: [card] });

    render(<RolloverEditDialog card={card} benefit={benefit} onClose={() => {}} />);

    const input = screen.getByLabelText(/accumulated/i);
    fireEvent.change(input, { target: { value: "600" } });

    const preview = screen.getByTestId("rollover-edit-preview");
    expect(preview.querySelectorAll("li")).toHaveLength(2);
    expect(preview.textContent).toContain("2025-01-01");
    expect(preview.textContent).toContain("2024-01-01");
  });

  it("preview caps at rolloverMaxYears * period multiplier", () => {
    const benefit = makeBenefit({ rolloverMaxYears: 2 });
    const card = makeCard([benefit]);
    useCardStore.setState({ cards: [card] });

    render(<RolloverEditDialog card={card} benefit={benefit} onClose={() => {}} />);

    const input = screen.getByLabelText(/accumulated/i);
    fireEvent.change(input, { target: { value: "1500" } });

    const preview = screen.getByTestId("rollover-edit-preview");
    expect(preview.querySelectorAll("li")).toHaveLength(2);
  });

  it("Save dispatches replaceRolloverRecords with the typed amount and closes", () => {
    const benefit = makeBenefit();
    const card = makeCard([benefit]);
    useCardStore.setState({ cards: [card] });
    const onClose = vi.fn();

    render(<RolloverEditDialog card={card} benefit={benefit} onClose={onClose} />);

    const input = screen.getByLabelText(/accumulated/i);
    fireEvent.change(input, { target: { value: "600" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
    // 2 past-cycle rollovers + 1 current-cycle marker (marks cycle as decided)
    expect(records.filter((r) => r.kind === "rollover")).toHaveLength(3);
    expect(records.some((r) => r.usedDate === "2026-01-01")).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Cancel closes without dispatching", () => {
    const benefit = makeBenefit({
      usageRecords: [
        { usedDate: "2025-01-01", faceValue: 0, actualValue: 0, kind: "rollover" },
      ],
    });
    const card = makeCard([benefit]);
    useCardStore.setState({ cards: [card] });
    const onClose = vi.fn();

    render(<RolloverEditDialog card={card} benefit={benefit} onClose={onClose} />);

    const input = screen.getByLabelText(/accumulated/i);
    fireEvent.change(input, { target: { value: "900" } });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
    expect(records).toHaveLength(1);
    expect(records[0].usedDate).toBe("2025-01-01");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Clear dispatches clearRolloverRecords and closes", () => {
    const benefit = makeBenefit({
      usageRecords: [
        { usedDate: "2025-01-01", faceValue: 0, actualValue: 0, kind: "rollover" },
        { usedDate: "2024-01-01", faceValue: 0, actualValue: 0, kind: "rollover" },
      ],
    });
    const card = makeCard([benefit]);
    useCardStore.setState({ cards: [card] });
    const onClose = vi.fn();

    render(<RolloverEditDialog card={card} benefit={benefit} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
    expect(records.filter((r) => r.kind === "rollover")).toHaveLength(0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shrinks preview when user lowers amount; save silently prunes", () => {
    const benefit = makeBenefit({
      rolloverMaxYears: 3,
      usageRecords: [
        { usedDate: "2025-01-01", faceValue: 0, actualValue: 0, kind: "rollover" },
        { usedDate: "2024-01-01", faceValue: 0, actualValue: 0, kind: "rollover" },
        { usedDate: "2023-01-01", faceValue: 0, actualValue: 0, kind: "rollover" },
      ],
    });
    const card = makeCard([benefit]);
    useCardStore.setState({ cards: [card] });

    render(<RolloverEditDialog card={card} benefit={benefit} onClose={() => {}} />);

    const input = screen.getByLabelText(/accumulated/i);
    expect(input.value).toBe("900");

    fireEvent.change(input, { target: { value: "300" } });
    const preview = screen.getByTestId("rollover-edit-preview");
    expect(preview.querySelectorAll("li")).toHaveLength(1);

    // No confirm prompt rendered
    expect(screen.queryByText(/confirm/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
    // 1 past-cycle rollover (2025-01-01) + 1 current-cycle marker (2026-01-01)
    expect(records.filter((r) => r.kind === "rollover")).toHaveLength(2);
    expect(records.map((r) => r.usedDate).sort()).toEqual([
      "2025-01-01",
      "2026-01-01",
    ]);
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

  it("renders null and logs warn in prod when benefit is non-rolloverable", () => {
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
