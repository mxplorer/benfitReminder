import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ByCardView } from "./ByCardView";
import { useCardStore } from "../../stores/useCardStore";

describe("ByCardView filter integration", () => {
  beforeEach(() => {
    useCardStore.setState({
      cards: [
        {
          id: "c1", owner: "me", cardTypeSlug: "amex-plat",
          annualFee: 695, cardOpenDate: "2024-01-01",
          color: "#000", isEnabled: true,
          benefits: [
            {
              id: "b-u", name: "Uber Eats", description: "",
              faceValue: 15, category: "dining",
              resetType: "calendar", resetConfig: { period: "monthly" },
              isHidden: false, autoRecur: false,
              rolloverable: false, rolloverMaxYears: 0,
              usageRecords: [
                { usedDate: "2026-01-10", faceValue: 15, actualValue: 15 },
              ],
            },
          ],
        },
        {
          id: "c2", owner: "me", cardTypeSlug: "chase-sapphire",
          annualFee: 550, cardOpenDate: "2024-06-01",
          color: "#444", isEnabled: true,
          benefits: [
            {
              id: "b-x", name: "All Hidden", description: "",
              faceValue: 200, category: "other",
              resetType: "calendar", resetConfig: { period: "annual" },
              isHidden: true, autoRecur: false,
              rolloverable: false, rolloverMaxYears: 0,
              usageRecords: [],
            },
          ],
        },
      ],
    });
  });

  it("defaults to 可使用 and shows card groups with applicable benefits only", () => {
    render(<ByCardView />);
    const pill = screen.getByTestId("filter-pill-available");
    expect(pill.className).toMatch(/active/);
    expect(screen.queryByText("All Hidden")).toBeNull();
  });

  it("shows hidden benefits under 已隐藏", () => {
    render(<ByCardView />);
    fireEvent.click(screen.getByTestId("filter-pill-hidden"));
    expect(screen.getByText("All Hidden")).toBeInTheDocument();
  });

  it("aggregates monthly under 已使用", () => {
    render(<ByCardView />);
    fireEvent.click(screen.getByTestId("filter-pill-used"));
    expect(screen.getByText(/Uber Eats/)).toBeInTheDocument();
    expect(screen.getByText(/1 次/)).toBeInTheDocument();
  });

  it("hides card group when its expansion is empty", () => {
    render(<ByCardView />);
    fireEvent.click(screen.getByTestId("filter-pill-used"));
    expect(screen.queryByText("All Hidden")).toBeNull();
  });
});
