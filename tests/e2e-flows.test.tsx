/**
 * E2E flow tests — verify complete user journeys through the UI.
 * These test the exact flows from Task 26's manual smoke test checklist,
 * but automated: add card → check benefits → edit → delete → verify dashboard.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { useCardStore } from "../src/stores/useCardStore";
import { useCardTypeStore } from "../src/stores/useCardTypeStore";
import { MainWindow } from "../src/views/main/MainWindow";
import { CardDetail } from "../src/views/main/CardDetail";

beforeEach(() => {
  useCardStore.setState({ cards: [], settings: {
    logLevel: "info",
    debugLogEnabled: false,
    reminderEnabled: true,
    reminderDays: 3,
    dismissedDate: null,
  }});
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
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-11T10:00:00"));
  useCardStore.getState().recalculate();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("E2E: Add card from template → verify in sidebar → view detail", () => {
  it("adds a card from template, appears in sidebar, navigates to detail", () => {
    render(<MainWindow />);

    // 1. Click "+ 添加卡片" in sidebar
    fireEvent.click(screen.getByText("+ 添加卡片"));
    expect(screen.getByTestId("view-card-editor")).toBeInTheDocument();

    // 2. Select Amex Platinum template
    const templateSelect = screen.getByTestId("template-select");
    fireEvent.change(templateSelect, { target: { value: "amex_platinum" } });

    // 3. Fill required fields
    fireEvent.change(screen.getByTestId("owner-input"), { target: { value: "Alice" } });
    // Date is pre-filled by RollingDatePicker's initial emit — no interaction needed

    // 4. Submit
    fireEvent.click(screen.getByTestId("submit-btn"));

    // 5. Verify: navigated to card detail, card appears in sidebar
    const { cards } = useCardStore.getState();
    expect(cards).toHaveLength(1);
    expect(cards[0].owner).toBe("Alice");
    expect(cards[0].cardTypeSlug).toBe("amex_platinum");
    // Template should have created default benefits
    expect(cards[0].benefits.length).toBeGreaterThan(0);
  });
});

describe("E2E: Check off benefit → verify used state → uncheck", () => {
  it("toggles benefit usage and updates store", () => {
    // Setup: add a card with one benefit directly
    const cardId = "card-1";
    const benefitId = "benefit-1";
    useCardStore.setState({
      cards: [{
        id: cardId,
        owner: "Bob",
        cardTypeSlug: "custom",
        annualFee: 100,
        cardOpenDate: "2025-01-01",
        color: "#4A90D9",
        isEnabled: true,
        benefits: [{
          id: benefitId,
          name: "Monthly Dining",
          description: "Restaurant credit",
          faceValue: 25,
          category: "dining",
          resetType: "calendar",
          resetConfig: { period: "monthly" },
          isHidden: false,
          usageRecords: [],
        }],
      }],
    });

    render(<MainWindow />);

    // Navigate to card detail
    const sidebarCard = document.querySelector(".sidebar__card-item");
    if (!sidebarCard) throw new Error("Card not found in sidebar");
    fireEvent.click(sidebarCard);

    // Benefit should be visible with check button
    expect(screen.getByText("Monthly Dining")).toBeInTheDocument();

    // Click the check button to open the actual-value prompt, then confirm
    const checkBtn = screen.getByLabelText("标记使用");
    fireEvent.click(checkBtn);
    fireEvent.click(screen.getByLabelText("确认"));

    // Verify store has usage record
    const { cards } = useCardStore.getState();
    const benefit = cards[0].benefits[0];
    expect(benefit.usageRecords).toHaveLength(1);
    expect(benefit.usageRecords[0].faceValue).toBe(25);
    expect(benefit.usageRecords[0].usedDate).toBe("2026-04-11");

    // After marking used, default "可使用" filter excludes the now-used benefit.
    // Uncheck via store (aggregated view in 已使用 has no inline uncheck button).
    useCardStore.getState().toggleBenefitUsage(cardId, benefitId);

    const updated = useCardStore.getState().cards[0].benefits[0];
    expect(updated.usageRecords).toHaveLength(0);
  });
});

describe("E2E: Add benefit → edit card → delete card", () => {
  it("creates benefit via editor, edits card, then deletes card", () => {
    // Setup: card with no benefits
    useCardStore.setState({
      cards: [{
        id: "card-2",
        owner: "Carol",
        cardTypeSlug: "custom",
        annualFee: 250,
        cardOpenDate: "2024-06-01",
        color: "#2ECC71",
        isEnabled: true,
        benefits: [],
      }],
    });

    render(<MainWindow />);

    // Navigate to card detail
    const sidebarCard = document.querySelector(".sidebar__card-item");
    if (!sidebarCard) throw new Error("Card not found in sidebar");
    fireEvent.click(sidebarCard);

    // Click "+ 添加 Benefit"
    fireEvent.click(screen.getByText("+ 添加 Benefit"));
    expect(screen.getByTestId("view-benefit-editor")).toBeInTheDocument();

    // Fill benefit form
    fireEvent.change(screen.getByTestId("name-input"), { target: { value: "Uber Credit" } });
    fireEvent.change(screen.getByTestId("face-value-input"), { target: { value: "15" } });
    fireEvent.click(screen.getByTestId("submit-btn"));

    // Verify benefit added
    let { cards } = useCardStore.getState();
    expect(cards[0].benefits).toHaveLength(1);
    expect(cards[0].benefits[0].name).toBe("Uber Credit");
    expect(cards[0].benefits[0].faceValue).toBe(15);

    // Click edit card button
    fireEvent.click(screen.getByText("编辑"));
    expect(screen.getByTestId("view-card-editor")).toBeInTheDocument();

    // Change alias
    fireEvent.change(screen.getByTestId("alias-input"), { target: { value: "Carol的卡" } });
    fireEvent.click(screen.getByTestId("submit-btn"));

    // Verify card updated
    cards = useCardStore.getState().cards;
    expect(cards[0].alias).toBe("Carol的卡");

    // Navigate back to card detail and delete
    const sidebarCard2 = document.querySelector(".sidebar__card-item");
    if (!sidebarCard2) throw new Error("Card not found in sidebar after edit");
    fireEvent.click(sidebarCard2);

    // Mock window.confirm
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByTestId("delete-card-btn"));

    // Verify card deleted
    cards = useCardStore.getState().cards;
    expect(cards).toHaveLength(0);

    // Should be back on dashboard
    expect(screen.getByTestId("view-dashboard")).toBeInTheDocument();
  });
});

describe("E2E: Filter pills in card detail", () => {
  it("filters benefits by status correctly", () => {
    useCardStore.setState({
      cards: [{
        id: "card-3",
        owner: "Dave",
        cardTypeSlug: "custom",
        annualFee: 95,
        cardOpenDate: "2025-01-01",
        color: "#E74C3C",
        isEnabled: true,
        benefits: [
          {
            id: "b1",
            name: "Active Benefit",
            description: "",
            faceValue: 50,
            category: "hotel",
            resetType: "calendar",
            resetConfig: { period: "monthly" },
            isHidden: false,
            usageRecords: [],
          },
          {
            id: "b2",
            name: "Used Benefit",
            description: "",
            faceValue: 30,
            category: "dining",
            resetType: "calendar",
            resetConfig: { period: "monthly" },
            isHidden: false,
            usageRecords: [{ usedDate: "2026-04-05", faceValue: 30, actualValue: 30 }],
          },
          {
            id: "b3",
            name: "Hidden Benefit",
            description: "",
            faceValue: 20,
            category: "other",
            resetType: "calendar",
            resetConfig: { period: "monthly" },
            isHidden: true,
            usageRecords: [],
          },
        ],
      }],
    });

    render(<MainWindow />);

    // Navigate to card
    const sidebarCard = document.querySelector(".sidebar__card-item");
    if (!sidebarCard) throw new Error("Card not found in sidebar");
    fireEvent.click(sidebarCard);

    const grid = screen.getByTestId("benefits-grid");

    // Default "可使用": shows only currently-actionable, non-used, non-hidden benefits
    expect(within(grid).getByText("Active Benefit")).toBeInTheDocument();
    expect(within(grid).queryByText("Used Benefit")).not.toBeInTheDocument();
    expect(within(grid).queryByText("Hidden Benefit")).not.toBeInTheDocument();

    // "已使用" filter: only used benefit appears (aggregated card)
    fireEvent.click(screen.getByTestId("filter-pill-used"));
    expect(within(grid).queryByText("Active Benefit")).not.toBeInTheDocument();
    expect(within(grid).getByText(/Used Benefit/)).toBeInTheDocument();

    // "已隐藏" filter
    fireEvent.click(screen.getByTestId("filter-pill-hidden"));
    expect(within(grid).queryByText("Active Benefit")).not.toBeInTheDocument();
    expect(within(grid).getByText("Hidden Benefit")).toBeInTheDocument();

    // "全部" filter: includes hidden
    fireEvent.click(screen.getByTestId("filter-pill-all"));
    expect(within(grid).getByText(/Hidden Benefit/)).toBeInTheDocument();
  });
});

describe("E2E: Sidebar navigation + Dashboard", () => {
  it("navigates between all views from sidebar", () => {
    render(<MainWindow />);

    // Dashboard is default
    expect(screen.getByTestId("view-dashboard")).toBeInTheDocument();

    // Navigate to 历史记录
    fireEvent.click(screen.getByText("历史记录"));
    expect(screen.getByTestId("view-history")).toBeInTheDocument();
    expect(screen.queryByTestId("view-dashboard")).not.toBeInTheDocument();

    // Navigate to 设置
    fireEvent.click(screen.getByText("设置"));
    expect(screen.getByTestId("view-settings")).toBeInTheDocument();

    // Back to Dashboard
    fireEvent.click(screen.getByText("Dashboard"));
    expect(screen.getByTestId("view-dashboard")).toBeInTheDocument();
  });
});

describe("E2E: Export and import data round-trip", () => {
  it("exports data as JSON and re-imports it successfully", () => {
    // Setup card with benefit and usage
    useCardStore.setState({
      cards: [{
        id: "export-card",
        owner: "Eve",
        cardTypeSlug: "custom",
        annualFee: 200,
        cardOpenDate: "2025-05-01",
        color: "#9B59B6",
        isEnabled: true,
        benefits: [{
          id: "export-benefit",
          name: "Travel Credit",
          description: "Monthly travel credit",
          faceValue: 50,
          category: "travel",
          resetType: "calendar",
          resetConfig: { period: "monthly" },
          isHidden: false,
          usageRecords: [{ usedDate: "2026-04-01", faceValue: 50, actualValue: 50 }],
        }],
      }],
    });

    // Export
    const json = useCardStore.getState().exportData();
    expect(json).toContain("Eve");
    expect(json).toContain("Travel Credit");

    // Clear store
    useCardStore.setState({ cards: [] });
    expect(useCardStore.getState().cards).toHaveLength(0);

    // Import
    useCardStore.getState().importData(json);
    const { cards } = useCardStore.getState();
    expect(cards).toHaveLength(1);
    expect(cards[0].owner).toBe("Eve");
    expect(cards[0].benefits[0].usageRecords).toHaveLength(1);
  });

  it("rejects malformed JSON import", () => {
    useCardStore.setState({
      cards: [{
        id: "safe-card",
        owner: "Frank",
        cardTypeSlug: "custom",
        annualFee: 100,
        cardOpenDate: "2025-01-01",
        color: "#333",
        isEnabled: true,
        benefits: [],
      }],
    });

    // Try importing garbage
    expect(() => { useCardStore.getState().importData("not json"); }).toThrow();

    // Original data preserved
    expect(useCardStore.getState().cards[0].owner).toBe("Frank");
  });
});

describe("E2E: Subscription auto-recur record generation", () => {
  it("generates auto-recur records for subscription benefits via propagateNext", () => {
    // Seed a prev-month record with propagateNext=true; store.now must match faked time
    useCardStore.setState({
      now: new Date("2026-04-11T10:00:00"),
      cards: [{
        id: "sub-card",
        owner: "Grace",
        cardTypeSlug: "custom",
        annualFee: 0,
        cardOpenDate: "2025-01-01",
        color: "#1ABC9C",
        isEnabled: true,
        benefits: [{
          id: "sub-benefit",
          name: "Disney+",
          description: "Monthly streaming",
          faceValue: 14,
          category: "streaming",
          resetType: "subscription",
          resetConfig: { period: "monthly" },
          isHidden: false,
          rolloverable: false,
          rolloverMaxYears: 0,
          usageRecords: [
            { usedDate: "2026-03-01", faceValue: 14, actualValue: 14, propagateNext: true },
          ],
        }],
      }],
    });

    // Run auto-recur generation
    act(() => {
      useCardStore.getState().generateAutoRecurRecords();
    });

    const benefit = useCardStore.getState().cards[0].benefits[0];
    expect(benefit.usageRecords).toHaveLength(2);
    expect(benefit.usageRecords[1].faceValue).toBe(14);
    expect(benefit.usageRecords[1].usedDate).toBe("2026-04-01");

    // Running again in same month should not add duplicate
    act(() => {
      useCardStore.getState().generateAutoRecurRecords();
    });
    expect(useCardStore.getState().cards[0].benefits[0].usageRecords).toHaveLength(2);
  });
});

describe("E2E: Unused benefit count in sidebar badge", () => {
  it("shows correct unused count badge on card in sidebar", () => {
    useCardStore.setState({
      cards: [{
        id: "badge-card",
        owner: "Hank",
        cardTypeSlug: "custom",
        annualFee: 100,
        cardOpenDate: "2025-01-01",
        color: "#3498DB",
        isEnabled: true,
        benefits: [
          {
            id: "unused1",
            name: "Unused One",
            description: "",
            faceValue: 10,
            category: "other",
            resetType: "calendar",
            resetConfig: { period: "monthly" },
            isHidden: false,
            usageRecords: [],
          },
          {
            id: "unused2",
            name: "Unused Two",
            description: "",
            faceValue: 20,
            category: "other",
            resetType: "calendar",
            resetConfig: { period: "monthly" },
            isHidden: false,
            usageRecords: [],
          },
          {
            id: "used1",
            name: "Already Used",
            description: "",
            faceValue: 30,
            category: "other",
            resetType: "calendar",
            resetConfig: { period: "monthly" },
            isHidden: false,
            usageRecords: [{ usedDate: "2026-04-10", faceValue: 30, actualValue: 30 }],
          },
          {
            id: "hidden1",
            name: "Hidden One",
            description: "",
            faceValue: 15,
            category: "other",
            resetType: "calendar",
            resetConfig: { period: "monthly" },
            isHidden: true,
            usageRecords: [],
          },
        ],
      }],
    });

    render(<MainWindow />);

    // Badge should show "2" (unused1 + unused2; used1 is used, hidden1 is hidden)
    const badge = document.querySelector(".sidebar__card-badge");
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe("2");
  });
});

describe("E2E: Settings — reminder config and data management", () => {
  it("toggles reminder settings", () => {
    render(<MainWindow />);

    // Navigate to settings
    fireEvent.click(screen.getByText("设置"));
    expect(screen.getByTestId("settings")).toBeInTheDocument();

    // Toggle reminder off
    const toggle = screen.getByTestId("reminder-toggle");
    fireEvent.click(toggle);
    expect(useCardStore.getState().settings.reminderEnabled).toBe(false);

    // Toggle back on
    fireEvent.click(toggle);
    expect(useCardStore.getState().settings.reminderEnabled).toBe(true);
  });
});

describe("E2E: benefit filter switching", () => {
  it("switches between all 5 filters and anniversary scope", () => {
    useCardStore.setState({
      cards: [
        {
          id: "c1", owner: "me", cardTypeSlug: "amex-plat",
          annualFee: 695, cardOpenDate: "2024-01-01",
          color: "#000", isEnabled: true,
          benefits: [
            {
              id: "bm", name: "Monthly X", description: "",
              faceValue: 10, category: "other",
              resetType: "calendar", resetConfig: { period: "monthly" },
              isHidden: false,
              rolloverable: false, rolloverMaxYears: 0,
              usageRecords: [{ usedDate: "2026-02-05", faceValue: 10, actualValue: 10 }],
            },
            {
              id: "bh", name: "Hidden Y", description: "",
              faceValue: 20, category: "other",
              resetType: "calendar", resetConfig: { period: "annual" },
              isHidden: true,
              rolloverable: false, rolloverMaxYears: 0,
              usageRecords: [],
            },
          ],
        },
      ],
    });

    render(<CardDetail cardId="c1" onNavigate={() => undefined} />);

    fireEvent.click(screen.getByTestId("filter-pill-used"));
    expect(screen.getAllByText(/Monthly X/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId("filter-pill-hidden"));
    expect(screen.getAllByText(/Hidden Y/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId("filter-pill-all"));
    expect(screen.getByTestId("year-scope-toggle")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("scope-anniversary"));

    fireEvent.click(screen.getByTestId("filter-pill-unused"));
    expect(screen.getByTestId("year-scope-toggle")).toBeInTheDocument();
  });
});
