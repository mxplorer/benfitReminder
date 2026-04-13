import { useState, useEffect } from "react";
import { useCardStore } from "../../stores/useCardStore";
import { formatDate } from "../../utils/period";
import { initPersistence } from "../../tauri/persistence";
import { ByCardView } from "./ByCardView";
import { ByUrgencyView } from "./ByUrgencyView";
import "./TrayPanel.css";

type Tab = "by-card" | "by-urgency";

export const TrayPanel = () => {
  const [activeTab, setActiveTab] = useState<Tab>("by-card");
  const unusedCount = useCardStore((s) => s.getUnusedBenefitCount());
  const trayOpacity = useCardStore((s) => s.settings.trayOpacity);
  const updateSettings = useCardStore((s) => s.updateSettings);

  useEffect(() => {
    // Hydrate tray panel store from disk so it shows real data
    void initPersistence();
  }, []);

  const handleDismiss = () => {
    updateSettings({ dismissedDate: formatDate(new Date()) });
  };

  const handleOpenMain = () => {
    void (async () => {
      if (!("__TAURI_INTERNALS__" in window)) return;
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("show_main_window");
        // Hide the dropdown panel after navigating to the main window
        const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        await getCurrentWebviewWindow().hide();
      } catch {
        // Not in Tauri context
      }
    })();
  };

  return (
    <div
      className="tray-panel glass-panel"
      style={{ "--tray-bg-alpha": String(trayOpacity / 100) } as React.CSSProperties}
    >
      <header className="tray-panel__header">
        <span className="tray-panel__count">
          {unusedCount > 0 ? `${String(unusedCount)} 项未使用权益` : "全部权益已使用"}
        </span>
        <button className="tray-panel__open-link" onClick={handleOpenMain}>
          详情窗口 ↗
        </button>
      </header>

      <div className="tray-panel__tabs">
        <button
          className={`tray-panel__tab${activeTab === "by-card" ? " tray-panel__tab--active" : ""}`}
          onClick={() => { setActiveTab("by-card"); }}
        >
          按卡分组
        </button>
        <button
          className={`tray-panel__tab${activeTab === "by-urgency" ? " tray-panel__tab--active" : ""}`}
          onClick={() => { setActiveTab("by-urgency"); }}
        >
          按紧急度
        </button>
      </div>

      <div className="tray-panel__content">
        {activeTab === "by-card" ? <ByCardView /> : <ByUrgencyView />}
      </div>

      <footer className="tray-panel__footer">
        <button className="tray-panel__dismiss-btn" onClick={handleDismiss}>
          Dismiss · 今日不再提醒
        </button>
      </footer>
    </div>
  );
};
