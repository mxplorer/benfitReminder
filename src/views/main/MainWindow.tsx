import { useState } from "react";
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

  return (
    <div className="main-window">
      <div className="main-window__sidebar">
        <Sidebar activeView={activeView} onNavigate={setActiveView} />
      </div>
      <main className="main-window__content">{renderView(activeView)}</main>
    </div>
  );
};
