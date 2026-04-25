import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { Benefit, CreditCard } from "../../models/types";
import { useCardStore } from "../../stores/useCardStore";
import { Sidebar } from "./Sidebar";
import type { ActiveView } from "./MainWindow";

const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "Benefit",
  faceValue: 100,
  category: "general",
  resetType: "calendar",
  resetConfig: { period: "yearly" },
  isHidden: false,
  rolloverable: false,
  rolloverMaxYears: 0,
  usageRecords: [],
  ...overrides,
});

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

const renderSidebar = (
  activeView: ActiveView = "dashboard",
  onNavigate: (v: ActiveView) => void = vi.fn(),
) => render(<Sidebar activeView={activeView} onNavigate={onNavigate} />);

beforeEach(() => {
  useCardStore.setState({
    cards: [],
    settings: {
      logLevel: "info",
      debugLogEnabled: false,
      reminderEnabled: true,
      reminderDays: 3,
      dismissedDate: null,
      trayOpacity: 100,
      theme: "system",
      sidebarCollapsed: false,
    },
  });
});

describe("Sidebar — expanded state (default)", () => {
  it("renders nav buttons with icons + labels", () => {
    renderSidebar();
    expect(screen.getByText("概览")).toBeInTheDocument();
    expect(screen.getByText("历史记录")).toBeInTheDocument();
    expect(screen.getByText("设置")).toBeInTheDocument();
  });

  it("renders card list with badges for unused benefits", () => {
    useCardStore.setState({
      cards: [
        makeCard({
          id: "c1",
          alias: "Card A",
          benefits: [makeBenefit({ id: "b1", faceValue: 50 })],
        }),
      ],
    });
    renderSidebar();
    const cardBtn = screen.getByRole("button", { name: /Card A/ });
    expect(cardBtn).toBeInTheDocument();
    // 1 unused benefit shows badge "1"
    expect(within(cardBtn).getByText("1")).toBeInTheDocument();
  });

  it("clicking a nav button calls onNavigate with the view name", () => {
    const onNavigate = vi.fn();
    renderSidebar("dashboard", onNavigate);
    fireEvent.click(screen.getByText("历史记录"));
    expect(onNavigate).toHaveBeenCalledWith("history");
  });

  it("clicking a card row navigates to that card view", () => {
    useCardStore.setState({
      cards: [makeCard({ id: "c-foo", alias: "Foo Card" })],
    });
    const onNavigate = vi.fn();
    renderSidebar("dashboard", onNavigate);
    fireEvent.click(screen.getByRole("button", { name: /Foo Card/ }));
    expect(onNavigate).toHaveBeenCalledWith({ type: "card", cardId: "c-foo" });
  });

  it("clicking 添加卡片 opens the card editor", () => {
    const onNavigate = vi.fn();
    renderSidebar("dashboard", onNavigate);
    fireEvent.click(screen.getByText("添加卡片"));
    expect(onNavigate).toHaveBeenCalledWith({ type: "card-editor" });
  });

  it("active nav button reflects activeView", () => {
    renderSidebar("history");
    const historyBtn = screen.getByRole("button", { name: "历史记录" });
    expect(historyBtn.className).toContain("sidebar__nav-item--active");
  });

  it("active card row reflects activeView for that card", () => {
    useCardStore.setState({
      cards: [
        makeCard({ id: "c1", alias: "A" }),
        makeCard({ id: "c2", alias: "B" }),
      ],
    });
    renderSidebar({ type: "card", cardId: "c2" });
    const cardB = screen.getByRole("button", { name: /^B$/ });
    expect(cardB.className).toContain("sidebar__card-item--active");
  });

  it("renders only enabled cards", () => {
    useCardStore.setState({
      cards: [
        makeCard({ id: "c1", alias: "Visible", isEnabled: true }),
        makeCard({ id: "c2", alias: "Hidden", isEnabled: false }),
      ],
    });
    renderSidebar();
    expect(screen.getByText("Visible")).toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });
});

describe("Sidebar — collapsed rail", () => {
  beforeEach(() => {
    useCardStore.getState().updateSettings({ sidebarCollapsed: true });
  });

  it("renders the 5 rail icons with aria-labels (no text labels)", () => {
    renderSidebar();
    expect(screen.getByRole("button", { name: "概览" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "历史记录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "我的卡片" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加卡片" })).toBeInTheDocument();
    // No text label "概览" rendered (it's only in tooltip data attribute)
    expect(screen.queryByText("历史记录", { selector: "span" })).toBeNull();
  });

  it("rail icons carry data-tip attribute for tooltips", () => {
    renderSidebar();
    const dashboardIcon = screen.getByRole("button", { name: "概览" });
    expect(dashboardIcon.getAttribute("data-tip")).toBe("概览");
  });

  it("clicking a rail nav icon navigates without expanding", () => {
    const onNavigate = vi.fn();
    renderSidebar("dashboard", onNavigate);
    fireEvent.click(screen.getByRole("button", { name: "历史记录" }));
    expect(onNavigate).toHaveBeenCalledWith("history");
    expect(useCardStore.getState().settings.sidebarCollapsed).toBe(true);
  });

  it("clicking the cards icon expands the sidebar (does not navigate)", () => {
    const onNavigate = vi.fn();
    renderSidebar("dashboard", onNavigate);
    fireEvent.click(screen.getByRole("button", { name: "我的卡片" }));
    expect(useCardStore.getState().settings.sidebarCollapsed).toBe(false);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("clicking the + icon opens the card editor without expanding", () => {
    const onNavigate = vi.fn();
    renderSidebar("dashboard", onNavigate);
    fireEvent.click(screen.getByRole("button", { name: "添加卡片" }));
    expect(onNavigate).toHaveBeenCalledWith({ type: "card-editor" });
    expect(useCardStore.getState().settings.sidebarCollapsed).toBe(true);
  });

  it("active rail nav icon reflects activeView", () => {
    renderSidebar("settings");
    const settingsBtn = screen.getByRole("button", { name: "设置" });
    expect(settingsBtn.className).toContain("sidebar__rail-icon--active");
  });

  it("cards icon is active when activeView is a card view", () => {
    useCardStore.setState({
      cards: [makeCard({ id: "c1", alias: "A" })],
    });
    useCardStore.getState().updateSettings({ sidebarCollapsed: true });
    renderSidebar({ type: "card", cardId: "c1" });
    const cardsBtn = screen.getByRole("button", { name: "我的卡片" });
    expect(cardsBtn.className).toContain("sidebar__rail-icon--active");
  });

  it("total-unused badge sums unused benefits across enabled cards", () => {
    useCardStore.setState({
      cards: [
        makeCard({
          id: "c1",
          alias: "A",
          benefits: [
            makeBenefit({ id: "b1" }),
            makeBenefit({ id: "b2" }),
          ],
        }),
        makeCard({
          id: "c2",
          alias: "B",
          benefits: [makeBenefit({ id: "b3" })],
        }),
      ],
    });
    useCardStore.getState().updateSettings({ sidebarCollapsed: true });
    renderSidebar();
    const cardsBtn = screen.getByRole("button", { name: "我的卡片" });
    expect(within(cardsBtn).getByText("3")).toBeInTheDocument();
  });

  it("total-unused badge is hidden when count is 0", () => {
    useCardStore.setState({ cards: [] });
    useCardStore.getState().updateSettings({ sidebarCollapsed: true });
    renderSidebar();
    const cardsBtn = screen.getByRole("button", { name: "我的卡片" });
    expect(within(cardsBtn).queryByText(/^\d+$/)).toBeNull();
  });
});

describe("Sidebar — edge trigger", () => {
  it("renders aria-label '展开侧栏' when collapsed", () => {
    useCardStore.getState().updateSettings({ sidebarCollapsed: true });
    renderSidebar();
    expect(screen.getByRole("button", { name: "展开侧栏" })).toBeInTheDocument();
  });

  it("renders aria-label '收起侧栏' when expanded", () => {
    renderSidebar();
    expect(screen.getByRole("button", { name: "收起侧栏" })).toBeInTheDocument();
  });

  it("clicking the edge trigger toggles sidebarCollapsed", () => {
    renderSidebar();
    expect(useCardStore.getState().settings.sidebarCollapsed).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "收起侧栏" }));
    expect(useCardStore.getState().settings.sidebarCollapsed).toBe(true);
  });
});

describe("Sidebar — keyboard shortcut", () => {
  it("⌘B toggles sidebarCollapsed", () => {
    renderSidebar();
    expect(useCardStore.getState().settings.sidebarCollapsed).toBe(false);
    fireEvent.keyDown(window, { key: "b", metaKey: true });
    expect(useCardStore.getState().settings.sidebarCollapsed).toBe(true);
    fireEvent.keyDown(window, { key: "b", metaKey: true });
    expect(useCardStore.getState().settings.sidebarCollapsed).toBe(false);
  });

  it("Ctrl+B toggles sidebarCollapsed (non-mac)", () => {
    renderSidebar();
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(useCardStore.getState().settings.sidebarCollapsed).toBe(true);
  });

  it("plain B keypress without modifier does nothing", () => {
    renderSidebar();
    fireEvent.keyDown(window, { key: "b" });
    expect(useCardStore.getState().settings.sidebarCollapsed).toBe(false);
  });
});

describe("Sidebar — data-state attribute", () => {
  it("nav has data-state='expanded' by default", () => {
    const { container } = renderSidebar();
    const nav = container.querySelector(".sidebar");
    expect(nav?.getAttribute("data-state")).toBe("expanded");
  });

  it("nav has data-state='collapsed' when sidebarCollapsed is true", () => {
    useCardStore.getState().updateSettings({ sidebarCollapsed: true });
    const { container } = renderSidebar();
    const nav = container.querySelector(".sidebar");
    expect(nav?.getAttribute("data-state")).toBe("collapsed");
  });
});
