import { useState } from "react";
import { Sidebar } from "./Sidebar";
import "./MainWindow.css";

export type ActiveView =
  | "dashboard"
  | "history"
  | "settings"
  | { type: "card"; cardId: string };

// Placeholder views — replaced in Tasks 18-21
const DashboardPlaceholder = () => <div data-testid="view-dashboard">Dashboard</div>;
const HistoryPlaceholder = () => <div data-testid="view-history">历史记录</div>;
const SettingsPlaceholder = () => <div data-testid="view-settings">设置</div>;
const CardDetailPlaceholder = ({ cardId }: { cardId: string }) => (
  <div data-testid={`view-card-${cardId}`}>Card {cardId}</div>
);

const renderView = (view: ActiveView) => {
  if (view === "dashboard") return <DashboardPlaceholder />;
  if (view === "history") return <HistoryPlaceholder />;
  if (view === "settings") return <SettingsPlaceholder />;
  return <CardDetailPlaceholder cardId={view.cardId} />;
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
