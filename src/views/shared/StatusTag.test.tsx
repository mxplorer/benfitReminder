import { describe, it, expect } from "vitest";
import { getTagState } from "./statusTagUtils";

describe("StatusTag getTagState", () => {
  it("returns '已使用' with done class when used", () => {
    const result = getTagState(5, true);
    expect(result.text).toBe("已使用");
    expect(result.className).toBe("status-tag--done");
  });

  it("returns danger class when daysRemaining <= reminderDays", () => {
    const result = getTagState(3, false, false, 3);
    expect(result.text).toBe("剩 3 天");
    expect(result.className).toBe("status-tag--danger");
  });

  it("returns warning class when daysRemaining > reminderDays", () => {
    const result = getTagState(15, false, false, 3);
    expect(result.text).toBe("剩 15 天");
    expect(result.className).toBe("status-tag--warning");
  });

  it("returns warning class when daysRemaining is null (no deadline)", () => {
    const result = getTagState(null, false);
    expect(result.text).toBe("可用");
    expect(result.className).toBe("status-tag--warning");
  });

  it("prioritizes used state over daysRemaining", () => {
    const result = getTagState(3, true);
    expect(result.text).toBe("已使用");
    expect(result.className).toBe("status-tag--done");
  });

  it("returns danger at boundary value equal to reminderDays", () => {
    const result = getTagState(7, false, false, 7);
    expect(result.className).toBe("status-tag--danger");
  });

  it("returns warning just above reminderDays", () => {
    const result = getTagState(8, false, false, 7);
    expect(result.className).toBe("status-tag--warning");
  });

  it("respects custom reminderDays", () => {
    // With reminderDays=14, 10 days is danger
    const result = getTagState(10, false, false, 14);
    expect(result.className).toBe("status-tag--danger");
  });

  it("returns '未激活' with pending class when notYetActive and not used", () => {
    const result = getTagState(20, false, true);
    expect(result.text).toBe("未激活");
    expect(result.className).toBe("status-tag--pending");
  });

  it("prioritizes used over notYetActive (a used record wins)", () => {
    const result = getTagState(20, true, true);
    expect(result.text).toBe("已使用");
    expect(result.className).toBe("status-tag--done");
  });
});
