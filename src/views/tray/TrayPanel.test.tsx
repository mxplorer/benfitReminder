import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useCardStore } from "../../stores/useCardStore";
import { TrayPanel } from "./TrayPanel";

// Reset store before each test
beforeEach(() => {
  useCardStore.setState({ cards: [], settings: useCardStore.getState().settings });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-10T12:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TrayPanel", () => {
  it("renders both tab buttons", () => {
    render(<TrayPanel />);
    expect(screen.getByText("按卡分组")).toBeInTheDocument();
    expect(screen.getByText("按紧急度")).toBeInTheDocument();
  });

  it("shows 按卡分组 as default active tab and switches on click", () => {
    render(<TrayPanel />);
    const byCardTab = screen.getByText("按卡分组");
    const byUrgencyTab = screen.getByText("按紧急度");

    expect(byCardTab.className).toContain("tray-panel__tab--active");
    expect(byUrgencyTab.className).not.toContain("tray-panel__tab--active");

    fireEvent.click(byUrgencyTab);

    expect(byUrgencyTab.className).toContain("tray-panel__tab--active");
    expect(byCardTab.className).not.toContain("tray-panel__tab--active");
  });

  it("renders open-main-window icon button", () => {
    render(<TrayPanel />);
    expect(screen.getByLabelText("打开主窗口")).toBeInTheDocument();
  });

  it("dismiss button sets dismissedDate in store", () => {
    render(<TrayPanel />);
    const dismissBtn = screen.getByText(/关闭今日通知提醒/);
    fireEvent.click(dismissBtn);

    const settings = useCardStore.getState().settings;
    expect(settings.dismissedDate).toBe("2026-04-10");
  });
});
