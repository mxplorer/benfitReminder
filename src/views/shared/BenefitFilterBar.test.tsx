import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BenefitFilterBar } from "./BenefitFilterBar";

describe("BenefitFilterBar", () => {
  const defaultProps = {
    filter: "available" as const,
    onChange: vi.fn(),
  };

  it("renders 5 pills in declared order", () => {
    render(<BenefitFilterBar {...defaultProps} />);
    const pills = screen.getAllByTestId(/^filter-pill-/);
    expect(pills.map((p) => p.getAttribute("data-testid"))).toEqual([
      "filter-pill-available",
      "filter-pill-unused",
      "filter-pill-used",
      "filter-pill-hidden",
      "filter-pill-all",
    ]);
  });

  it("calls onChange when pill clicked", () => {
    const onChange = vi.fn();
    render(<BenefitFilterBar {...defaultProps} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("filter-pill-used"));
    expect(onChange).toHaveBeenCalledWith("used");
  });

  it("does not render any year-scope toggle (owned by CardDetail's hero toggle now)", () => {
    render(<BenefitFilterBar {...defaultProps} filter="unused" />);
    expect(screen.queryByTestId("year-scope-toggle")).toBeNull();
  });
});
