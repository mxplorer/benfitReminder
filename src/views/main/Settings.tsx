import { useState, type ReactNode } from "react";
import { useCardStore } from "../../stores/useCardStore";
import { GlassContainer } from "../shared/GlassContainer";
import { Switch } from "../shared/Switch";
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

interface RowProps {
  title: string;
  description?: string;
  control: ReactNode;
}

const Row = ({ title, description, control }: RowProps) => (
  <div className="settings__row">
    <div className="settings__row-text">
      <div className="settings__row-title">{title}</div>
      {description && <div className="settings__row-desc">{description}</div>}
    </div>
    <div className="settings__row-control">{control}</div>
  </div>
);

interface StepperProps {
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (n: number) => void;
  testId?: string;
}

const Stepper = ({ value, min, max, unit, onChange, testId }: StepperProps) => (
  <div className="settings__stepper">
    <button
      type="button"
      className="settings__stepper-btn"
      onClick={() => { onChange(Math.max(min, value - 1)); }}
      disabled={value <= min}
      aria-label="减少"
    >
      −
    </button>
    <input
      type="number"
      className="settings__stepper-value"
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
      }}
      data-testid={testId}
    />
    {unit && <span className="settings__stepper-unit">{unit}</span>}
    <button
      type="button"
      className="settings__stepper-btn"
      onClick={() => { onChange(Math.min(max, value + 1)); }}
      disabled={value >= max}
      aria-label="增加"
    >
      +
    </button>
  </div>
);

export const Settings = () => {
  const settings = useCardStore((s) => s.settings);
  const updateSettings = useCardStore((s) => s.updateSettings);
  const exportData = useCardStore((s) => s.exportData);
  const importData = useCardStore((s) => s.importData);
  const [editorOpen, setEditorOpen] = useState<boolean>(false);

  const handleExport = async () => {
    const json = exportData();
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
        <h3 className="settings__section-title">外观</h3>
        <Row
          title="主题"
          description="跟随系统将根据 macOS 外观自动切换"
          control={
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
          }
        />
      </GlassContainer>

      <GlassContainer className="settings__section">
        <h3 className="settings__section-title">提醒</h3>
        <Row
          title="启用使用提醒"
          description="权益即将到期前在系统通知中心提醒"
          control={
            <Switch
              checked={settings.reminderEnabled}
              onChange={(v) => { updateSettings({ reminderEnabled: v }); }}
              testId="reminder-toggle"
              ariaLabel="启用使用提醒"
            />
          }
        />
        {settings.reminderEnabled && (
          <Row
            title="提前提醒"
            description="到期前提前几天开始提醒"
            control={
              <Stepper
                value={settings.reminderDays}
                min={1}
                max={30}
                unit="天"
                onChange={(n) => { updateSettings({ reminderDays: n }); }}
                testId="reminder-days-input"
              />
            }
          />
        )}
      </GlassContainer>

      <GlassContainer className="settings__section">
        <h3 className="settings__section-title">调试</h3>
        <Row
          title="调试日志"
          description="在控制台输出 debug 级别日志，仅排查问题时开启"
          control={
            <Switch
              checked={settings.debugLogEnabled}
              onChange={(v) => { updateSettings({ debugLogEnabled: v }); }}
              testId="debug-toggle"
              ariaLabel="启用调试日志"
            />
          }
        />
      </GlassContainer>

      <GlassContainer className="settings__section">
        <h3 className="settings__section-title">数据</h3>
        <Row
          title="导出数据"
          description="将所有卡片和权益记录导出为 JSON"
          control={
            <button
              type="button"
              className="settings__btn settings__btn--primary"
              onClick={() => { void handleExport(); }}
              data-testid="export-btn"
            >
              导出
            </button>
          }
        />
        <Row
          title="导入数据"
          description="从 JSON 文件恢复，会覆盖当前数据"
          control={
            <>
              <input
                type="file"
                accept=".json"
                onChange={handleImportFile}
                data-testid="import-input"
                style={{ display: "none" }}
              />
              <button
                type="button"
                className="settings__btn settings__btn--secondary"
                onClick={() => { void handleImport(); }}
                data-testid="import-btn"
              >
                选择文件
              </button>
            </>
          }
        />
      </GlassContainer>

      {import.meta.env.DEV && (
        <GlassContainer className="settings__section">
          <h3 className="settings__section-title">开发者</h3>
          <Row
            title="数据编辑器"
            description="直接修改 store 内容，仅开发模式可用"
            control={
              <button
                type="button"
                className="settings__btn settings__btn--secondary"
                onClick={() => { setEditorOpen(true); }}
                data-testid="open-data-editor-btn"
              >
                打开
              </button>
            }
          />
        </GlassContainer>
      )}

      {editorOpen && (
        <DataEditorDialog onClose={() => { setEditorOpen(false); }} />
      )}

      <GlassContainer className="settings__section settings__danger-zone">
        <h3 className="settings__section-title">危险操作</h3>
        <Row
          title="恢复默认数据"
          description="清空所有卡片和权益记录，此操作不可撤销"
          control={
            <button
              type="button"
              className="settings__btn settings__btn--danger"
              onClick={handleResetConfirm}
              data-testid="reset-btn"
            >
              恢复
            </button>
          }
        />
      </GlassContainer>
    </div>
  );
};
