import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Benefit, CreditCard } from "../../models/types";
import { BenefitCard } from "./BenefitCard";

const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "Test Benefit",
  description: "A test benefit description",
  faceValue: 100,
  category: "other",
  resetType: "calendar",
  resetConfig: { period: "monthly" },
  isHidden: false,
  autoRecur: false,
  usageRecords: [],
  ...overrides,
});

const makeCard = (overrides: Partial<CreditCard> = {}): CreditCard => ({
  id: "card-1",
  owner: "Test",
  cardTypeSlug: "amex_platinum",
  annualFee: 895,
  cardOpenDate: "2024-03-15",
  color: "#8E9EAF",
  isEnabled: true,
  benefits: [],
  ...overrides,
});

describe("BenefitCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-25T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders benefit name, value, and description", () => {
    const benefit = makeBenefit({ name: "Hotel Credit", faceValue: 300 });
    render(<BenefitCard benefit={benefit} card={makeCard()} onToggleUsage={vi.fn()} />);

    expect(screen.getByText("Hotel Credit")).toBeInTheDocument();
    expect(screen.getByText("$300")).toBeInTheDocument();
    expect(screen.getByText("A test benefit description")).toBeInTheDocument();
  });

  it("hides description in compact mode", () => {
    const benefit = makeBenefit({ description: "Should be hidden" });
    render(<BenefitCard benefit={benefit} card={makeCard()} onToggleUsage={vi.fn()} compact />);

    expect(screen.queryByText("Should be hidden")).not.toBeInTheDocument();
  });

  it("fires onToggleUsage with correct cardId and benefitId on click", () => {
    const handler = vi.fn();
    const benefit = makeBenefit({ id: "b42" });
    const card = makeCard({ id: "c99" });
    render(<BenefitCard benefit={benefit} card={card} onToggleUsage={handler} />);

    fireEvent.click(screen.getByRole("button"));
    expect(handler).toHaveBeenCalledWith("c99", "b42");
  });

  it("shows used state with checkmark and strikethrough", () => {
    const benefit = makeBenefit({
      usageRecords: [{ usedDate: "2026-04-20", faceValue: 100, actualValue: 100 }],
    });
    render(<BenefitCard benefit={benefit} card={makeCard()} onToggleUsage={vi.fn()} />);

    expect(screen.getByText("已使用")).toBeInTheDocument();
    expect(screen.getByText("✓")).toBeInTheDocument();
  });

  it("shows dash for zero faceValue", () => {
    const benefit = makeBenefit({ faceValue: 0 });
    render(<BenefitCard benefit={benefit} card={makeCard()} onToggleUsage={vi.fn()} />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
