import { useState, useEffect, useMemo } from "react";
import { useCardStore } from "../../stores/useCardStore";
import {
  formatDate,
  getDaysRemaining,
  getDeadline,
  isApplicableNow,
  isBenefitUsedInPeriod,
} from "../../utils/period";
import { getAvailableValue } from "../../utils/rollover";
import { initPersistence } from "../../tauri/persistence";
import { ByCardView } from "./ByCardView";
import { ByUrgencyView } from "./ByUrgencyView";
import "./TrayPanel.css";

type Tab = "by-card" | "by-urgency";

export const TrayPanel = () => {
  const [activeTab, setActiveTab] = useState<Tab>("by-card");
  const cards = useCardStore((s) => s.cards);
  const reminderDays = useCardStore((s) => s.settings.reminderDays);
  const updateSettings = useCardStore((s) => s.updateSettings);

  useEffect(() => {
    void initPersistence();
  }, []);

  const summary = useMemo(() => {
    const today = new Date();
    let count = 0;
    let value = 0;
    let urgent = 0;
    for (const card of cards) {
      if (!card.isEnabled) continue;
      for (const benefit of card.benefits) {
        if (benefit.isHidden) continue;
        if (!isApplicableNow(benefit, today)) continue;
        if (isBenefitUsedInPeriod(benefit, today, card.cardOpenDate)) continue;
        count++;
        value += getAvailableValue(benefit, today);
        const deadline = getDeadline(today, {
          resetType: benefit.resetType,
          resetConfig: benefit.resetConfig,
          cardOpenDate: card.cardOpenDate,
        });
        const days = deadline ? getDaysRemaining(today, deadline) : null;
        if (days !== null && days <= reminderDays) urgent++;
      }
    }
    return { count, value, urgent };
  }, [cards, reminderDays]);

  const handleDismiss = () => {
    updateSettings({ dismissedDate: formatDate(new Date()) });
  };

  const handleOpenMain = () => {
    void (async () => {
      if (!("__TAURI_INTERNALS__" in window)) return;
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("show_main_window");
        const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        await getCurrentWebviewWindow().hide();
      } catch {
        // Not in Tauri context
      }
    })();
  };

  return (
    <div className="tray-panel">
      <header className="tray-panel__header">
        <div className="tray-panel__summary">
          <span className="tray-panel__summary-label">待使用</span>
          <span className="tray-panel__summary-value">
            <span className="tray-panel__summary-currency">$</span>
            {summary.value.toLocaleString("en-US")}
          </span>
          <div className="tray-panel__summary-sub">
            {summary.urgent > 0 && (
              <>
                <span className="tray-panel__summary-dot" aria-hidden="true" />
                <span className="tray-panel__summary-urgent">
                  {String(summary.urgent)} 项即将到期
                </span>
                <span className="tray-panel__summary-sep">·</span>
              </>
            )}
            <span>{String(summary.count)} 项未使用权益</span>
          </div>
        </div>
        <button
          className="tray-panel__open-link"
          onClick={handleOpenMain}
          aria-label="打开主窗口"
          title="打开主窗口"
        >
          ↗
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
          关闭今日通知提醒
        </button>
      </footer>
    </div>
  );
};
