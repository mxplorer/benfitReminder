import { describe, it, expect } from "vitest";
import { getTagState } from "./statusTagUtils";

describe("StatusTag getTagState", () => {
  it("returns '已使用' with done class when used", () => {
    const result = getTagState(5, true);
    expect(result.text).toBe("已使用");
    expect(result.className).toBe("status-tag--done");
  });

  it("returns danger class when daysRemaining <= 7", () => {
    const result = getTagState(3, false);
    expect(result.text).toBe("剩 3 天");
    expect(result.className).toBe("status-tag--danger");
  });

  it("returns warning class when daysRemaining <= 30", () => {
    const result = getTagState(15, false);
    expect(result.text).toBe("剩 15 天");
    expect(result.className).toBe("status-tag--warning");
  });

  it("returns safe class when daysRemaining > 30", () => {
    const result = getTagState(60, false);
    expect(result.text).toBe("剩 60 天");
    expect(result.className).toBe("status-tag--safe");
  });

  it("returns '可用' with safe class when daysRemaining is null", () => {
    const result = getTagState(null, false);
    expect(result.text).toBe("可用");
    expect(result.className).toBe("status-tag--safe");
  });

  it("prioritizes used state over daysRemaining", () => {
    const result = getTagState(3, true);
    expect(result.text).toBe("已使用");
    expect(result.className).toBe("status-tag--done");
  });

  it("returns danger for boundary value of 7", () => {
    const result = getTagState(7, false);
    expect(result.className).toBe("status-tag--danger");
  });
});
