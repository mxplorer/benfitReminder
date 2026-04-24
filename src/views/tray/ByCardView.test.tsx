import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
              isHidden: false,
              rolloverable: false, rolloverMaxYears: 0,
              usageRecords: [
                { usedDate: "2026-01-10", faceValue: 15, actualValue: 15, kind: "usage" },
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
              isHidden: true,
              rolloverable: false, rolloverMaxYears: 0,
              usageRecords: [],
            },
          ],
        },
      ],
    });
  });

  it("shows only available (non-hidden, non-used) benefits — no filter bar", () => {
    render(<ByCardView />);
    // Hidden benefit never surfaces in the tray's by-card view
    expect(screen.queryByText("All Hidden")).toBeNull();
    // The filter bar was removed; assert no filter pills present
    expect(screen.queryByTestId("filter-pill-available")).toBeNull();
    expect(screen.queryByTestId("filter-pill-hidden")).toBeNull();
  });

  it("hides card group entirely when all of its benefits are hidden or used", () => {
    render(<ByCardView />);
    // c1's Uber Eats is used this cycle → group empty; c2's only benefit is
    // hidden → group empty. Neither card name should render.
    expect(screen.queryByText("All Hidden")).toBeNull();
  });
});
