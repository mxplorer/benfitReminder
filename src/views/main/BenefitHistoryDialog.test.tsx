import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useCardStore } from "../../stores/useCardStore";
import type { Benefit, CreditCard } from "../../models/types";
import { BenefitHistoryDialog } from "./BenefitHistoryDialog";

const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "Spotify",
  description: "",
  faceValue: 15,
  category: "other",
  resetType: "subscription",
  resetConfig: {},
  isHidden: false,
  rolloverable: false,
  rolloverMaxYears: 0,
  usageRecords: [
    { usedDate: "2026-02-05", faceValue: 15, actualValue: 15, kind: "usage" },
    { usedDate: "2026-04-05", faceValue: 15, actualValue: 12, kind: "usage" },
    { usedDate: "2026-03-05", faceValue: 15, actualValue: 15, kind: "usage" },
  ],
  ...overrides,
});

const makeCard = (overrides: Partial<CreditCard> = {}): CreditCard => ({
  id: "c1",
  owner: "me",
  cardTypeSlug: "amex",
  annualFee: 695,
  cardOpenDate: "2024-01-01",
  color: "#000",
  isEnabled: true,
  benefits: [makeBenefit()],
  ...overrides,
});

beforeEach(() => {
  useCardStore.setState({ cards: [makeCard()] });
});

describe("BenefitHistoryDialog", () => {
  it("lists records sorted by usedDate DESC", () => {
    render(<BenefitHistoryDialog cardId="c1" benefitId="b1" onClose={() => undefined} />);
    const rows = screen.getAllByTestId("benefit-history-row");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("2026-04-05");
    expect(rows[1]).toHaveTextContent("2026-03-05");
    expect(rows[2]).toHaveTextContent("2026-02-05");
  });

  it("deletes the correct record (by original index, not rendered index) after confirm", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<BenefitHistoryDialog cardId="c1" benefitId="b1" onClose={() => undefined} />);
    // First rendered row is 2026-04-05 which is original index 1.
    fireEvent.click(screen.getAllByLabelText("删除")[0]);
    const remaining = useCardStore.getState().cards[0].benefits[0].usageRecords;
    expect(remaining).toHaveLength(2);
    expect(remaining.map((r) => r.usedDate)).toEqual(["2026-02-05", "2026-03-05"]);
    confirmSpy.mockRestore();
  });

  it("opens UsageRecordEditDialog prefilled with row values when 编辑 clicked", () => {
    render(<BenefitHistoryDialog cardId="c1" benefitId="b1" onClose={() => undefined} />);
    fireEvent.click(screen.getAllByLabelText("编辑")[0]); // 2026-04-05
    expect(screen.getByRole("dialog", { name: "编辑使用记录" })).toBeInTheDocument();
    const date = screen.getByLabelText<HTMLInputElement>("使用日期");
    expect(date.value).toBe("2026-04-05");
  });

  it("calls onClose when overlay is clicked", () => {
    const onClose = vi.fn();
    render(<BenefitHistoryDialog cardId="c1" benefitId="b1" onClose={onClose} />);
    fireEvent.click(screen.getByTestId("benefit-history-dialog-overlay"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when 关闭 button is clicked", () => {
    const onClose = vi.fn();
    render(<BenefitHistoryDialog cardId="c1" benefitId="b1" onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("关闭"));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders empty state when benefit has no records", () => {
    useCardStore.setState({
      cards: [makeCard({ benefits: [makeBenefit({ usageRecords: [] })] })],
    });
    render(<BenefitHistoryDialog cardId="c1" benefitId="b1" onClose={() => undefined} />);
    expect(screen.getByText("暂无使用记录")).toBeInTheDocument();
  });

  it("marks rollover records with a 结转 tag", () => {
    useCardStore.setState({
      cards: [
        makeCard({
          benefits: [
            makeBenefit({
              usageRecords: [
                { usedDate: "2026-01-01", faceValue: 0, actualValue: 0, kind: "rollover" },
              ],
            }),
          ],
        }),
      ],
    });
    render(<BenefitHistoryDialog cardId="c1" benefitId="b1" onClose={() => undefined} />);
    expect(screen.getByText("结转")).toBeInTheDocument();
  });
});
