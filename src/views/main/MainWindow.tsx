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
import "./MainWindow.css";

export type ActiveView =
  | "dashboard"
  | "history"
  | "settings"
  | { type: "card"; cardId: string };

const renderView = (view: ActiveView) => {
  if (view === "dashboard") return <div data-testid="view-dashboard"><Dashboard /></div>;
  if (view === "history") return <div data-testid="view-history"><History /></div>;
  if (view === "settings") return <div data-testid="view-settings"><Settings /></div>;
  return <div data-testid={`view-card-${view.cardId}`}><CardDetail cardId={view.cardId} /></div>;
};

export const MainWindow = () => {
  const [activeView, setActiveView] = useState<ActiveView>("dashboard");

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

  return (
    <div className="main-window">
      <div className="main-window__sidebar">
        <Sidebar activeView={activeView} onNavigate={setActiveView} />
      </div>
      <main className="main-window__content">{renderView(activeView)}</main>
    </div>
  );
};
