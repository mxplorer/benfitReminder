import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BenefitFilterBar } from "./BenefitFilterBar";

describe("BenefitFilterBar", () => {
  const defaultProps = {
    filter: "available" as const,
    onChange: vi.fn(),
    scope: "calendar" as const,
    onScopeChange: vi.fn(),
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

  it("hides year-scope toggle for 可使用", () => {
    render(<BenefitFilterBar {...defaultProps} filter="available" />);
    expect(screen.queryByTestId("year-scope-toggle")).toBeNull();
  });

  it("hides year-scope toggle for 已使用", () => {
    render(<BenefitFilterBar {...defaultProps} filter="used" />);
    expect(screen.queryByTestId("year-scope-toggle")).toBeNull();
  });

  it("hides year-scope toggle for 已隐藏", () => {
    render(<BenefitFilterBar {...defaultProps} filter="hidden" />);
    expect(screen.queryByTestId("year-scope-toggle")).toBeNull();
  });

  it("shows year-scope toggle for 未使用", () => {
    render(<BenefitFilterBar {...defaultProps} filter="unused" />);
    expect(screen.getByTestId("year-scope-toggle")).toBeInTheDocument();
  });

  it("shows year-scope toggle for 全部", () => {
    render(<BenefitFilterBar {...defaultProps} filter="all" />);
    expect(screen.getByTestId("year-scope-toggle")).toBeInTheDocument();
  });

  it("calls onScopeChange when scope toggled", () => {
    const onScopeChange = vi.fn();
    render(
      <BenefitFilterBar {...defaultProps} filter="unused" onScopeChange={onScopeChange} />,
    );
    fireEvent.click(screen.getByTestId("scope-anniversary"));
    expect(onScopeChange).toHaveBeenCalledWith("anniversary");
  });
});
