import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Benefit, CreditCard } from "../../models/types";
import { useCardStore } from "../../stores/useCardStore";
import { NoteEditor } from "./NoteEditor";

const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "Test Benefit",
  description: "",
  faceValue: 100,
  category: "other",
  resetType: "calendar",
  resetConfig: { period: "monthly" },
  isHidden: false,
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

describe("NoteEditor", () => {
  const card = makeCard();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-12T12:00:00"));
    // Pin the store's monotonic `now` (useToday reads s.now; fake timers don't touch it).
    useCardStore.setState({
      cards: [],
      now: new Date("2026-05-12T12:00:00"),
      settings: useCardStore.getState().settings,
    });
    useCardStore.getState().addCard(card);
    useCardStore.getState().addBenefit(card.id, makeBenefit());
  });
  afterEach(() => { vi.useRealTimers(); });

  it("renders both sections for monthly benefits", () => {
    render(
      <NoteEditor benefit={makeBenefit()} card={card} onClose={() => {}} />,
    );
    expect(screen.getByText(/本周期备注/)).toBeInTheDocument();
    expect(screen.getByText(/通用备注/)).toBeInTheDocument();
    expect(screen.getByText(/2026 年 5 月/)).toBeInTheDocument();
  });

  it("hides cycle section for one_time benefits", () => {
    const oneTime = makeBenefit({ resetType: "one_time", resetConfig: {} });
    render(<NoteEditor benefit={oneTime} card={card} onClose={() => {}} />);
    expect(screen.queryByText(/本周期备注/)).not.toBeInTheDocument();
    expect(screen.getByText(/通用备注/)).toBeInTheDocument();
  });

  it("hides cycle section for since_last_use benefits", () => {
    const slu = makeBenefit({
      resetType: "since_last_use",
      resetConfig: { cooldownDays: 90 },
    });
    render(<NoteEditor benefit={slu} card={card} onClose={() => {}} />);
    expect(screen.queryByText(/本周期备注/)).not.toBeInTheDocument();
    expect(screen.getByText(/通用备注/)).toBeInTheDocument();
  });

  it("save persists both notes to the store", () => {
    const onClose = vi.fn();
    render(
      <NoteEditor benefit={makeBenefit()} card={card} onClose={onClose} />,
    );
    const [cycleTa, genericTa] = screen.getAllByRole("textbox");
    fireEvent.change(cycleTa, { target: { value: "may plan" } });
    fireEvent.change(genericTa, { target: { value: "book online" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    const b = useCardStore.getState().cards[0].benefits[0];
    expect(b.note).toBe("book online");
    expect(b.cycleNotes).toEqual({ "M:2026-05": "may plan" });
    expect(onClose).toHaveBeenCalled();
  });

  it("save is disabled until the user changes something", () => {
    render(
      <NoteEditor benefit={makeBenefit()} card={card} onClose={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    const [cycleTa] = screen.getAllByRole("textbox");
    fireEvent.change(cycleTa, { target: { value: "x" } });
    expect(screen.getByRole("button", { name: "保存" })).not.toBeDisabled();
  });

  it("cancel closes without saving", () => {
    const onClose = vi.fn();
    render(
      <NoteEditor benefit={makeBenefit()} card={card} onClose={onClose} />,
    );
    const [cycleTa] = screen.getAllByRole("textbox");
    fireEvent.change(cycleTa, { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onClose).toHaveBeenCalled();
    expect(useCardStore.getState().cards[0].benefits[0].cycleNotes).toBeUndefined();
  });

  it("enforces 500-char limit via maxlength", () => {
    render(
      <NoteEditor benefit={makeBenefit()} card={card} onClose={() => {}} />,
    );
    const [cycleTa] = screen.getAllByRole("textbox");
    expect(cycleTa).toHaveAttribute("maxLength", "500");
  });

  it("renders history list only for non-current cycle keys, newest first", () => {
    const benefit = makeBenefit({
      cycleNotes: {
        "M:2026-03": "march",
        "M:2026-04": "april",
        "M:2026-05": "may", // current
      },
    });
    render(<NoteEditor benefit={benefit} card={card} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /查看历史周期备注/ }));
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("2026 年 4 月");
    expect(items[0]).toHaveTextContent("april");
    expect(items[1]).toHaveTextContent("2026 年 3 月");
    expect(items[1]).toHaveTextContent("march");
  });

  it("hides history section when no history exists", () => {
    render(
      <NoteEditor benefit={makeBenefit()} card={card} onClose={() => {}} />,
    );
    expect(screen.queryByRole("button", { name: /查看历史周期备注/ })).not.toBeInTheDocument();
  });
});
