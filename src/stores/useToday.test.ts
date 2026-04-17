import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useToday } from "./useToday";
import { useCardStore } from "./useCardStore";

describe("useToday", () => {
  it("re-renders when recalculate() bumps now", () => {
    const { result } = renderHook(() => useToday());
    const before = result.current;
    // Ensure a different Date identity by advancing system time before recalculate.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(before.getTime() + 1000));
    act(() => {
      useCardStore.getState().recalculate();
    });
    vi.useRealTimers();
    const after = result.current;
    expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(after).not.toBe(before);
  });
});
