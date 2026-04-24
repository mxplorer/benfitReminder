import { describe, it, expect, beforeEach } from "vitest";
import { useCardStore } from "../src/stores/useCardStore";
import { computeTrayStatus } from "../src/utils/trayState";
import type { AppSettings, Benefit, CreditCard } from "../src/models/types";

const d = (iso: string) => new Date(iso + "T00:00:00");

const makeBenefit = (overrides: Partial<Benefit> = {}): Benefit => ({
  id: "b1",
  name: "Monthly Credit",
  description: "",
  faceValue: 25,
  category: "other",
  resetType: "calendar",
  resetConfig: { period: "monthly" },
  isHidden: false,
  rolloverable: false,
  rolloverMaxYears: 2,
  usageRecords: [],
  ...overrides,
});

const makeCard = (benefits: Benefit[]): CreditCard => ({
  id: "card-1",
  owner: "Test",
  cardTypeSlug: "amex_platinum",
  annualFee: 895,
  cardOpenDate: "2024-03-15",
  color: "#8E9EAF",
  isEnabled: true,
  benefits,
});

const defaultSettings: AppSettings = {
  logLevel: "info",
  debugLogEnabled: false,
  reminderEnabled: true,
  reminderDays: 3,
  dismissedDate: null,
  trayOpacity: 80,
  theme: "system",
  sidebarCollapsed: false,
};

const trayState = () => {
  const { cards, now, settings } = useCardStore.getState();
  return computeTrayStatus(cards, now, settings.reminderDays);
};

describe("tray status across store mutations", () => {
  beforeEach(() => {
    useCardStore.setState({
      cards: [],
      settings: { ...defaultSettings },
      now: d("2026-04-16"),
    });
  });

  it("adding a card with an unused benefit transitions clean → unused", () => {
    expect(trayState().state).toBe("clean");

    useCardStore
      .getState()
      .addCard(makeCard([makeBenefit({ resetConfig: { period: "quarterly" } })]));

    expect(trayState().state).toBe("unused");
  });

  it("advancing now toward a deadline transitions unused → urgent", () => {
    useCardStore.getState().addCard(makeCard([makeBenefit()]));
    useCardStore.setState({ now: d("2026-04-16") });
    expect(trayState().state).toBe("unused");

    useCardStore.setState({ now: d("2026-04-29") });
    expect(trayState().state).toBe("urgent");
  });

  it("toggling the benefit as used returns to clean", () => {
    useCardStore.getState().addCard(makeCard([makeBenefit()]));
    useCardStore.setState({ now: d("2026-04-29") });
    useCardStore.getState().toggleBenefitUsage("card-1", "b1");

    expect(trayState().state).toBe("clean");
  });

  it("changing reminderDays promotes unused → urgent without other mutations", () => {
    // Quarterly benefit — Jun 21 is 9 days before Jun 30 quarter-end.
    useCardStore
      .getState()
      .addCard(makeCard([makeBenefit({ resetConfig: { period: "quarterly" } })]));
    useCardStore.setState({ now: d("2026-06-21") });

    expect(
      computeTrayStatus(useCardStore.getState().cards, useCardStore.getState().now, 3).state,
    ).toBe("unused");
    expect(
      computeTrayStatus(useCardStore.getState().cards, useCardStore.getState().now, 14).state,
    ).toBe("urgent");
  });
});
