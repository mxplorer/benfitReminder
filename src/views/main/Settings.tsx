import { useState } from "react";
import { useCardStore } from "../../stores/useCardStore";
import { GlassContainer } from "../shared/GlassContainer";
import { getMetrics } from "../../lib/transports";
import { exportToFile, importFromFile } from "../../tauri/bridge";
import type { ThemePreference } from "../../models/types";
import { DataEditorDialog } from "./DataEditorDialog";
import "./Settings.css";

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
];

export const Settings = () => {
  const settings = useCardStore((s) => s.settings);
  const updateSettings = useCardStore((s) => s.updateSettings);
  const exportData = useCardStore((s) => s.exportData);
  const importData = useCardStore((s) => s.importData);
  const [editorOpen, setEditorOpen] = useState<boolean>(false);

  const handleExport = async () => {
    const json = exportData();
    // In Tauri: use native save dialog. In browser dev: fall back to download link.
    if ("__TAURI_INTERNALS__" in window) {
      await exportToFile(json);
    } else {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ccb-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
    try {
      getMetrics().count("data.exported");
    } catch { /* metrics not initialized */ }
  };

  const handleImport = async () => {
    // In Tauri: use native file picker. In browser dev: use hidden file input.
    if ("__TAURI_INTERNALS__" in window) {
      const text = await importFromFile();
      if (!text) return;
      try {
        importData(text);
        getMetrics().count("data.imported");
      } catch (err) {
        window.alert(`导入失败: ${String(err)}`);
      }
    } else {
      document.querySelector<HTMLInputElement>('[data-testid="import-input"]')?.click();
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text !== "string") return;
      try {
        importData(text);
        try { getMetrics().count("data.imported"); } catch { /* ok */ }
      } catch (err) {
        window.alert(`导入失败: ${String(err)}`);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleResetConfirm = () => {
    if (window.confirm("确定恢复默认数据？当前数据将被清除。")) {
      useCardStore.setState({ cards: [] });
    }
  };

  return (
    <div className="settings" data-testid="settings">
      <GlassContainer className="settings__section">
        <h3>外观</h3>
        <div className="settings__theme" role="radiogroup" aria-label="主题">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={settings.theme === opt.value}
              className={
                "settings__theme-option" +
                (settings.theme === opt.value ? " settings__theme-option--active" : "")
              }
              onClick={() => { updateSettings({ theme: opt.value }); }}
              data-testid={`theme-${opt.value}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </GlassContainer>

      <GlassContainer className="settings__section">
        <h3>提醒设置</h3>
        <label>
          <input
            type="checkbox"
            checked={settings.reminderEnabled}
            onChange={(e) => { updateSettings({ reminderEnabled: e.target.checked }); }}
            data-testid="reminder-toggle"
          />
          启用使用提醒
        </label>
        {settings.reminderEnabled && (
          <label>
            提前提醒天数
            <input
              type="number"
              value={settings.reminderDays}
              min={1}
              max={30}
              onChange={(e) => { updateSettings({ reminderDays: Number(e.target.value) }); }}
              data-testid="reminder-days-input"
            />
          </label>
        )}
      </GlassContainer>

      <GlassContainer className="settings__section">
        <h3>调试</h3>
        <label>
          <input
            type="checkbox"
            checked={settings.debugLogEnabled}
            onChange={(e) => { updateSettings({ debugLogEnabled: e.target.checked }); }}
            data-testid="debug-toggle"
          />
          启用调试日志
        </label>
      </GlassContainer>

      <GlassContainer className="settings__section">
        <h3>数据管理</h3>
        <button onClick={() => { void handleExport(); }} data-testid="export-btn">
          导出数据
        </button>
        <label>
          <span>导入数据</span>
          {/* Hidden input used as fallback in browser dev mode */}
          <input
            type="file"
            accept=".json"
            onChange={handleImportFile}
            data-testid="import-input"
            style={{ display: "none" }}
          />
          <button
            type="button"
            onClick={() => { void handleImport(); }}
            data-testid="import-btn"
          >
            选择文件
          </button>
        </label>
      </GlassContainer>

      {import.meta.env.DEV && (
        <GlassContainer className="settings__section">
          <h3>开发者</h3>
          <button
            type="button"
            onClick={() => { setEditorOpen(true); }}
            data-testid="open-data-editor-btn"
          >
            打开数据编辑器
          </button>
        </GlassContainer>
      )}

      {editorOpen && (
        <DataEditorDialog onClose={() => { setEditorOpen(false); }} />
      )}

      <GlassContainer className="settings__section settings__danger-zone">
        <h3>危险操作</h3>
        <button onClick={handleResetConfirm} data-testid="reset-btn">
          恢复默认数据
        </button>
      </GlassContainer>
    </div>
  );
};
