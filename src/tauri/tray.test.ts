import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateTrayStatus } from "./tray";
import type { TrayStatus } from "../utils/trayState";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args: unknown) => invokeMock(cmd, args),
}));

describe("updateTrayStatus", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("no-ops outside Tauri (no __TAURI_INTERNALS__ on window)", async () => {
    const status: TrayStatus = { state: "urgent", unusedCount: 2, urgentCount: 1 };
    await updateTrayStatus(status);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("invokes update_tray_status with the full status when running in Tauri", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    invokeMock.mockResolvedValue(undefined);

    const status: TrayStatus = { state: "unused", unusedCount: 3, urgentCount: 0 };
    await updateTrayStatus(status);

    expect(invokeMock).toHaveBeenCalledWith("update_tray_status", {
      state: "unused",
      unusedCount: 3,
      urgentCount: 0,
    });

    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("swallows invoke failures", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    invokeMock.mockRejectedValue(new Error("command missing"));
    const status: TrayStatus = { state: "clean", unusedCount: 0, urgentCount: 0 };
    await expect(updateTrayStatus(status)).resolves.toBeUndefined();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });
});
