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
      usageRecords: [{ usedDate: "2026-03-01", faceValue: 200, actualValue: 150, kind: "usage" }],
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
              isHidden: false,
              rolloverable: false, rolloverMaxYears: 0,
              usageRecords: [
                { usedDate: "2026-01-10", faceValue: 15, actualValue: 15, kind: "usage" },
              ],
            },
            {
              id: "b-hidden", name: "Hidden One", description: "",
              faceValue: 50, category: "other",
              resetType: "calendar", resetConfig: { period: "annual" },
              isHidden: true,
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

describe("CardDetail rollover edit dialog", () => {
  it("clicking ⚙ gear opens dialog with a toggle button reflecting current available", () => {
    useCardStore.setState({
      cards: [
        makeCard({
          benefits: [
            makeBenefit({
              id: "b1",
              name: "Airline Credit",
              faceValue: 300,
              rolloverable: true,
              rolloverMaxYears: 3,
              resetType: "calendar",
              resetConfig: { period: "annual" },
              usageRecords: [],
            }),
          ],
        }),
      ],
    });
    render(<CardDetail cardId="c1" onNavigate={() => undefined} />);

    fireEvent.click(screen.getByLabelText("Rollover 设置"));

    const btn = screen.getByTestId("rollover-toggle-btn");
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toMatch(/结转.*\$300/);
  });

  it("clicking 关闭 closes the dialog without touching records", () => {
    useCardStore.setState({
      cards: [
        makeCard({
          benefits: [
            makeBenefit({
              id: "b1",
              faceValue: 300,
              rolloverable: true,
              rolloverMaxYears: 2,
              resetType: "calendar",
              resetConfig: { period: "annual" },
              usageRecords: [
                { usedDate: "2025-01-01", faceValue: 300, actualValue: 0, kind: "rollover" },
              ],
            }),
          ],
        }),
      ],
    });
    render(<CardDetail cardId="c1" onNavigate={() => undefined} />);
    fireEvent.click(screen.getByLabelText("Rollover 设置"));
    fireEvent.click(screen.getByRole("button", { name: /关闭/ }));

    expect(screen.queryByTestId("rollover-toggle-btn")).toBeNull();
    expect(useCardStore.getState().cards[0].benefits[0].usageRecords).toHaveLength(1);
  });
});

describe("CardDetail usage-record row actions", () => {
  const seedCardWithRecords = () => {
    useCardStore.setState({
      cards: [
        makeCard({
          id: "c1",
          benefits: [
            makeBenefit({
              id: "b1",
              name: "Hotel Credit",
              faceValue: 200,
              resetType: "calendar",
              resetConfig: { period: "annual" },
              usageRecords: [
                { usedDate: "2026-03-01", faceValue: 200, actualValue: 150, kind: "usage" },
                { usedDate: "2026-02-10", faceValue: 200, actualValue: 175, kind: "usage" },
              ],
            }),
          ],
        }),
      ],
    });
  };

  it("renders 编辑 and 删除 buttons per history row", () => {
    seedCardWithRecords();
    render(<CardDetail cardId="c1" onNavigate={() => undefined} />);
    const rows = screen.getAllByTestId("history-row");
    expect(rows).toHaveLength(2);
    expect(screen.getAllByLabelText("编辑")).toHaveLength(2);
    expect(screen.getAllByLabelText("删除")).toHaveLength(2);
  });

  it("clicking 编辑 opens dialog prefilled with row values", () => {
    seedCardWithRecords();
    render(<CardDetail cardId="c1" onNavigate={() => undefined} />);
    // First row sorted desc by date => 2026-03-01 (faceValue 200, actualValue 150)
    const editBtns = screen.getAllByLabelText("编辑");
    fireEvent.click(editBtns[0]);

    expect(screen.getByRole("dialog", { name: "编辑使用记录" })).toBeInTheDocument();
    const face = screen.getByLabelText<HTMLInputElement>("本次面值");
    const actual = screen.getByLabelText<HTMLInputElement>("实际到手");
    const date = screen.getByLabelText<HTMLInputElement>("使用日期");
    expect(face.value).toBe("200");
    expect(actual.value).toBe("150");
    expect(date.value).toBe("2026-03-01");
  });

  it("clicking 删除 after confirm removes the correct record by original index", () => {
    seedCardWithRecords();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CardDetail cardId="c1" onNavigate={() => undefined} />);

    // First row in rendered table is sorted-desc => record with usedDate 2026-03-01
    // which is at original index 0 in benefit.usageRecords.
    fireEvent.click(screen.getAllByLabelText("删除")[0]);

    const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
    expect(records).toHaveLength(1);
    expect(records[0].usedDate).toBe("2026-02-10");
    confirmSpy.mockRestore();
  });

  it("onManageUsage from BenefitCard highlights matching rows", () => {
    seedCardWithRecords();
    render(<CardDetail cardId="c1" onNavigate={() => undefined} />);

    // Switch to 全部 so the annual benefit renders as a BenefitCard regardless
    // of whether its current annual cycle has been marked used.
    fireEvent.click(screen.getByTestId("filter-pill-all"));

    // Open BenefitCard's ⋯ menu then click 管理使用. CardDetail header also has
    // a 更多操作 button, so scope to the benefit grid.
    const grid = screen.getByTestId("benefits-grid");
    const moreBtns = grid.querySelectorAll<HTMLButtonElement>('[aria-label="更多操作"]');
    if (moreBtns.length === 0) throw new Error("no BenefitCard more-button");
    fireEvent.click(moreBtns[0]);
    fireEvent.click(screen.getByLabelText("管理使用"));

    const rows = screen.getAllByTestId("history-row");
    expect(rows[0].className).toMatch(/card-detail__history-row--highlight/);
    expect(rows[0].getAttribute("data-benefit-id")).toBe("b1");
  });
});

describe("CardDetail cycle-scoped toggle integration", () => {
  it("unchecking a past quarterly cycle in 全部 removes that cycle's record, not today's", () => {
    useCardStore.setState({
      cards: [
        {
          id: "c1",
          owner: "me",
          cardTypeSlug: "amex-plat",
          annualFee: 100,
          cardOpenDate: "2024-01-01",
          color: "#000",
          isEnabled: true,
          benefits: [
            {
              id: "bq",
              name: "CLEAR",
              description: "",
              faceValue: 199,
              category: "travel",
              resetType: "calendar",
              resetConfig: { period: "quarterly" },
              isHidden: false,
              rolloverable: false,
              rolloverMaxYears: 0,
              usageRecords: [
                { usedDate: "2026-02-10", faceValue: 199, actualValue: 199, kind: "usage" }, // Q1
              ],
            },
          ],
        },
      ],
    });
    render(<CardDetail cardId="c1" onNavigate={() => undefined} />);
    fireEvent.click(screen.getByTestId("filter-pill-all"));

    const q1Card = screen.getByText("Q1 2026").closest(".benefit-card");
    if (!q1Card) throw new Error("Q1 card not found");
    const uncheckBtn = q1Card.querySelector('[aria-label="取消使用"]');
    if (!uncheckBtn) throw new Error("Q1 uncheck button not found");
    fireEvent.click(uncheckBtn);

    const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
    expect(records).toHaveLength(0);
  });
});
