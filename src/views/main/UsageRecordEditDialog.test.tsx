import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Benefit, CreditCard, UsageRecord } from "../../models/types";
import { useCardStore } from "../../stores/useCardStore";
import { UsageRecordEditDialog } from "./UsageRecordEditDialog";

const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "Hotel Credit",
  description: "",
  faceValue: 200,
  category: "hotel",
  resetType: "calendar",
  resetConfig: { period: "annual" },
  isHidden: false,
  rolloverable: false,
  rolloverMaxYears: 0,
  usageRecords: [],
  ...overrides,
});

const makeCard = (overrides: Partial<CreditCard> = {}): CreditCard => ({
  id: "c1",
  owner: "Alice",
  cardTypeSlug: "amex_platinum",
  annualFee: 695,
  cardOpenDate: "2024-01-01",
  color: "#000",
  isEnabled: true,
  benefits: [],
  ...overrides,
});

const makeRecord = (overrides: Partial<UsageRecord> = {}): UsageRecord => ({
  usedDate: "2026-03-01",
  faceValue: 200,
  actualValue: 150,
  kind: "usage",
  ...overrides,
});

beforeEach(() => {
  useCardStore.setState({ cards: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("UsageRecordEditDialog", () => {
  it("renders with record values prefilled", () => {
    const benefit = makeBenefit({ usageRecords: [makeRecord()] });
    const card = makeCard({ benefits: [benefit] });
    useCardStore.setState({ cards: [card] });

    render(
      <UsageRecordEditDialog
        cardId="c1"
        benefitId="b1"
        recordIndex={0}
        record={benefit.usageRecords[0]}
        benefit={benefit}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByLabelText<HTMLInputElement>("本次面值").value).toBe("200");
    expect(screen.getByLabelText<HTMLInputElement>("实际到手").value).toBe("150");
    expect(screen.getByLabelText<HTMLInputElement>("使用日期").value).toBe("2026-03-01");
  });

  it("editing and saving calls updateBenefitUsageRecord with the patch", () => {
    const benefit = makeBenefit({ usageRecords: [makeRecord()] });
    const card = makeCard({ benefits: [benefit] });
    useCardStore.setState({ cards: [card] });
    const onClose = vi.fn();

    render(
      <UsageRecordEditDialog
        cardId="c1"
        benefitId="b1"
        recordIndex={0}
        record={benefit.usageRecords[0]}
        benefit={benefit}
        onClose={onClose}
      />,
    );

    fireEvent.change(screen.getByLabelText("实际到手"), { target: { value: "175" } });
    fireEvent.change(screen.getByLabelText("使用日期"), { target: { value: "2026-03-05" } });
    fireEvent.click(screen.getByLabelText("保存"));

    const updated = useCardStore.getState().cards[0].benefits[0].usageRecords[0];
    expect(updated.actualValue).toBe(175);
    expect(updated.usedDate).toBe("2026-03-05");
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking 删除记录 after confirm calls removeBenefitUsageRecord", () => {
    const benefit = makeBenefit({
      usageRecords: [
        makeRecord({ usedDate: "2026-03-01" }),
        makeRecord({ usedDate: "2026-02-01" }),
      ],
    });
    const card = makeCard({ benefits: [benefit] });
    useCardStore.setState({ cards: [card] });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onClose = vi.fn();

    render(
      <UsageRecordEditDialog
        cardId="c1"
        benefitId="b1"
        recordIndex={0}
        record={benefit.usageRecords[0]}
        benefit={benefit}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByLabelText("删除记录"));

    const records = useCardStore.getState().cards[0].benefits[0].usageRecords;
    expect(records).toHaveLength(1);
    expect(records[0].usedDate).toBe("2026-02-01");
    expect(onClose).toHaveBeenCalled();
  });

  it("删除记录 without confirm does not remove nor close", () => {
    const benefit = makeBenefit({ usageRecords: [makeRecord()] });
    const card = makeCard({ benefits: [benefit] });
    useCardStore.setState({ cards: [card] });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onClose = vi.fn();

    render(
      <UsageRecordEditDialog
        cardId="c1"
        benefitId="b1"
        recordIndex={0}
        record={benefit.usageRecords[0]}
        benefit={benefit}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByLabelText("删除记录"));

    expect(useCardStore.getState().cards[0].benefits[0].usageRecords).toHaveLength(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cancel closes without persisting", () => {
    const benefit = makeBenefit({ usageRecords: [makeRecord()] });
    const card = makeCard({ benefits: [benefit] });
    useCardStore.setState({ cards: [card] });
    const onClose = vi.fn();

    render(
      <UsageRecordEditDialog
        cardId="c1"
        benefitId="b1"
        recordIndex={0}
        record={benefit.usageRecords[0]}
        benefit={benefit}
        onClose={onClose}
      />,
    );

    fireEvent.change(screen.getByLabelText("实际到手"), { target: { value: "999" } });
    fireEvent.click(screen.getByLabelText("取消"));

    const unchanged = useCardStore.getState().cards[0].benefits[0].usageRecords[0];
    expect(unchanged.actualValue).toBe(150);
    expect(onClose).toHaveBeenCalled();
  });

  it("自动续期下月 checkbox is only shown for monthly-like benefits", () => {
    const annual = makeBenefit({
      resetType: "calendar",
      resetConfig: { period: "annual" },
      usageRecords: [makeRecord()],
    });
    const monthly = makeBenefit({
      resetType: "calendar",
      resetConfig: { period: "monthly" },
      usageRecords: [makeRecord()],
    });

    const { rerender } = render(
      <UsageRecordEditDialog
        cardId="c1"
        benefitId="b1"
        recordIndex={0}
        record={annual.usageRecords[0]}
        benefit={annual}
        onClose={() => undefined}
      />,
    );
    expect(screen.queryByLabelText("自动续期下月")).toBeNull();

    rerender(
      <UsageRecordEditDialog
        cardId="c1"
        benefitId="b1"
        recordIndex={0}
        record={monthly.usageRecords[0]}
        benefit={monthly}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByLabelText("自动续期下月")).toBeInTheDocument();
  });

  it("clicking the overlay closes the dialog", () => {
    const benefit = makeBenefit({ usageRecords: [makeRecord()] });
    const onClose = vi.fn();

    render(
      <UsageRecordEditDialog
        cardId="c1"
        benefitId="b1"
        recordIndex={0}
        record={benefit.usageRecords[0]}
        benefit={benefit}
        onClose={onClose}
      />,
    );

    const overlay = screen.getByTestId("usage-record-dialog-overlay");
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });
});
