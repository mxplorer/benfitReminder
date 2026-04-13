import { useState, useEffect } from "react";
import { useCardStore } from "../../stores/useCardStore";
import { initPersistence } from "../../tauri/persistence";
import { updateTrayBadge } from "../../tauri/tray";
import { checkAndSendReminders } from "../../tauri/notifications";
import { Sidebar } from "./Sidebar";
import { Dashboard } from "./Dashboard";
import { History } from "./History";
import { Settings } from "./Settings";
import { CardDetail } from "./CardDetail";
import { CardEditor } from "./CardEditor";
import { BenefitEditor } from "./BenefitEditor";
import { BackfillDialog } from "./BackfillDialog";
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
    // Keep tray badge in sync with unused benefit count and send reminders
    const syncTray = () => {
      const { getUnusedBenefitCount, cards, settings } = useCardStore.getState();
      const count = getUnusedBenefitCount();
      void updateTrayBadge(count);
      void checkAndSendReminders(cards, settings);
    };

    // Run on mount (after hydration) and on every store change
    const unsubscribe = useCardStore.subscribe(syncTray);
    syncTray();
    return unsubscribe;
  }, []);

  // Re-send reminders when window is focused (per spec)
  useEffect(() => {
    const onFocus = () => {
      const { cards, settings } = useCardStore.getState();
      void checkAndSendReminders(cards, settings);
    };
    window.addEventListener("focus", onFocus);
    return () => { window.removeEventListener("focus", onFocus); };
  }, []);

  const renderView = () => {
    if (activeView === "dashboard") return <div data-testid="view-dashboard"><Dashboard /></div>;
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
              onDone={() => {
                if (activeView.cardId) {
                  setActiveView({ type: "card", cardId: activeView.cardId });
                } else {
                  // New card added — navigate to the newest card in the store
                  const latest = useCardStore.getState().cards;
                  const newest = latest[latest.length - 1] as { id: string } | undefined;
                  if (newest) {
                    setBackfillCardId(newest.id);
                    setActiveView({ type: "card", cardId: newest.id });
                  } else {
                    setActiveView("dashboard");
                  }
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
        const hasPastPeriods = backfillCard.benefits.some(
          (b) => b.resetType === "calendar" && b.resetConfig.period,
        );
        if (!hasPastPeriods) return null;
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
