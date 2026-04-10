import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useCardStore } from "../../stores/useCardStore";
import { Settings } from "./Settings";

beforeEach(() => {
  useCardStore.setState({
    cards: [],
    settings: {
      logLevel: "info",
      debugLogEnabled: false,
      reminderEnabled: true,
      reminderDays: 3,
      dismissedDate: null,
    },
  });
});

describe("Settings", () => {
  it("reminder toggle updates reminderEnabled in store", () => {
    render(<Settings />);
    const toggle = screen.getByTestId("reminder-toggle");

    expect((toggle as HTMLInputElement).checked).toBe(true);
    fireEvent.click(toggle);

    expect(useCardStore.getState().settings.reminderEnabled).toBe(false);
  });

  it("reminder days input updates reminderDays in store", () => {
    render(<Settings />);
    const daysInput = screen.getByTestId("reminder-days-input");

    fireEvent.change(daysInput, { target: { value: "7" } });

    expect(useCardStore.getState().settings.reminderDays).toBe(7);
  });

  it("export button calls exportData from the store", () => {
    const exportSpy = vi.spyOn(useCardStore.getState(), "exportData").mockReturnValue("{}");
    // Stub URL.createObjectURL to avoid jsdom limitations
    vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValue("blob:x"), revokeObjectURL: vi.fn() });

    render(<Settings />);
    fireEvent.click(screen.getByTestId("export-btn"));

    expect(exportSpy).toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
