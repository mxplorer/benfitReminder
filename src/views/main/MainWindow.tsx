import { useState, useEffect } from "react";
import { useCardStore } from "../../stores/useCardStore";
import { initPersistence } from "../../tauri/persistence";
import { updateTrayStatus } from "../../tauri/tray";
import { computeTrayStatus } from "../../utils/trayState";
import { checkAndSendReminders } from "../../tauri/notifications";
import { Sidebar } from "./Sidebar";
import { Dashboard } from "./Dashboard";
import { History } from "./History";
import { Settings } from "./Settings";
import { CardDetail } from "./CardDetail";
import { CardEditor } from "./CardEditor";
import { BenefitEditor } from "./BenefitEditor";
import { BackfillDialog } from "./BackfillDialog";
import { getPastPeriods } from "../../utils/rollover";
import "./MainWindow.css";

export type ActiveView =
  | "dashboard"
  | "history"
  | "settings"
  | { type: "card"; cardId: string }
  | { type: "card-editor"; cardId?: string }
  | { type: "benefit-editor"; cardId: string; benefitId?: string };

export const MainWindow = () => {
  const [activeView, setActiveView] = useState<ActiveView>("dashboard");
  const [backfillCardId, setBackfillCardId] = useState<string | null>(null);
  const cards = useCardStore((s) => s.cards);

  useEffect(() => {
    // Initialize file persistence (hydrate from disk + start auto-save)
    void initPersistence();
  }, []);

  useEffect(() => {
    // Keep tray icon + tooltip in sync with benefit status, and send reminders.
    const syncTray = () => {
      const { cards, settings, now } = useCardStore.getState();
      const status = computeTrayStatus(cards, now, settings.reminderDays);
      void updateTrayStatus(status);
      void checkAndSendReminders(cards, settings);
    };

    // Run on mount (after hydration) and on every store change
    const unsubscribe = useCardStore.subscribe(syncTray);
    syncTray();
    return unsubscribe;
  }, []);

  // Refresh "today" and reminders on focus; schedule a daily tick just past midnight
  // so long-running sessions pick up the new day without a manual focus event.
  useEffect(() => {
    const onFocus = () => {
      useCardStore.getState().recalculate();
      const { cards, settings } = useCardStore.getState();
      void checkAndSendReminders(cards, settings);
    };
    window.addEventListener("focus", onFocus);

    let timer: number | null = null;
    const schedule = () => {
      const now = new Date();
      const nextMidnight = new Date(
        now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5,
      );
      // Floor to 60s to avoid a pathological tight loop if the clock jumps.
      const ms = Math.max(60_000, nextMidnight.getTime() - now.getTime());
      timer = window.setTimeout(() => {
        useCardStore.getState().recalculate();
        schedule();
      }, ms);
    };
    schedule();

    return () => {
      window.removeEventListener("focus", onFocus);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  const renderView = () => {
    if (activeView === "dashboard") return <div data-testid="view-dashboard"><Dashboard onNavigate={setActiveView} /></div>;
    if (activeView === "history") return <div data-testid="view-history"><History /></div>;
    if (activeView === "settings") return <div data-testid="view-settings"><Settings /></div>;
    if (typeof activeView === "object") {
      if (activeView.type === "card-editor") {
        const editCard = activeView.cardId
          ? cards.find((c) => c.id === activeView.cardId)
          : undefined;
        return (
          <div data-testid="view-card-editor">
            <CardEditor
              card={editCard}
              onDone={(result) => {
                if (activeView.cardId) {
                  // Edit mode — return to the card detail view
                  setActiveView({ type: "card", cardId: activeView.cardId });
                } else if (result?.newCardId) {
                  // New card submitted — prompt for backfill and jump to detail
                  setBackfillCardId(result.newCardId);
                  setActiveView({ type: "card", cardId: result.newCardId });
                } else {
                  // Cancelled — go back to dashboard without triggering backfill
                  setActiveView("dashboard");
                }
              }}
            />
          </div>
        );
      }
      if (activeView.type === "benefit-editor") {
        const editCard = cards.find((c) => c.id === activeView.cardId);
        const benefit = activeView.benefitId
          ? editCard?.benefits.find((b) => b.id === activeView.benefitId)
          : undefined;
        return (
          <div data-testid="view-benefit-editor">
            <BenefitEditor
              cardId={activeView.cardId}
              benefit={benefit}
              onDone={() => { setActiveView({ type: "card", cardId: activeView.cardId }); }}
            />
          </div>
        );
      }
      return (
        <div data-testid={`view-card-${activeView.cardId}`}>
          <CardDetail cardId={activeView.cardId} onNavigate={setActiveView} />
        </div>
      );
    }
    return null;
  };

  return (
    <div className="main-window">
      <div className="main-window__sidebar">
        <Sidebar activeView={activeView} onNavigate={setActiveView} />
      </div>
      <main className="main-window__content">{renderView()}</main>
      {backfillCardId && (() => {
        const backfillCard = cards.find((c) => c.id === backfillCardId);
        if (!backfillCard) return null;
        // Only open the dialog when at least one benefit has a past period
        // whose start is on/after the card's open date — otherwise there is
        // nothing the user could meaningfully backfill.
        const today = new Date();
        const hasBackfillableContent = backfillCard.benefits.some((b) => {
          if (b.resetType !== "calendar") return false;
          const period = b.resetConfig.period;
          if (!period) return false;
          return getPastPeriods(period, today, 12).some(
            (p) => p.end >= backfillCard.cardOpenDate,
          );
        });
        if (!hasBackfillableContent) return null;
        return (
          <BackfillDialog
            card={backfillCard}
            onDone={() => { setBackfillCardId(null); }}
          />
        );
      })()}
    </div>
  );
};
