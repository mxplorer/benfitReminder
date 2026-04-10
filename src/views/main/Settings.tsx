import { useCardStore } from "../../stores/useCardStore";
import { GlassContainer } from "../shared/GlassContainer";
import { getMetrics } from "../../lib/transports";

export const Settings = () => {
  const settings = useCardStore((s) => s.settings);
  const updateSettings = useCardStore((s) => s.updateSettings);
  const exportData = useCardStore((s) => s.exportData);
  const importData = useCardStore((s) => s.importData);

  const handleExport = () => {
    const json = exportData();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ccb-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    try {
      getMetrics().count("data.exported");
    } catch {
      // metrics not initialized in test environment
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text !== "string") return;
      try {
        importData(text);
        try {
          getMetrics().count("data.imported");
        } catch {
          // metrics not initialized in test environment
        }
      } catch (err) {
        // Log import error to console — real UI would show a dialog
        // Using a direct window alert here to avoid requiring a modal component
        window.alert(`导入失败: ${String(err)}`);
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-imported
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
        <button onClick={handleExport} data-testid="export-btn">
          导出数据
        </button>
        <label>
          <span>导入数据</span>
          <input
            type="file"
            accept=".json"
            onChange={handleImport}
            data-testid="import-input"
            style={{ display: "none" }}
          />
          <button
            type="button"
            onClick={() => {
              document.querySelector<HTMLInputElement>('[data-testid="import-input"]')?.click();
            }}
            data-testid="import-btn"
          >
            选择文件
          </button>
        </label>
      </GlassContainer>

      <GlassContainer className="settings__section settings__danger-zone">
        <h3>危险操作</h3>
        <button onClick={handleResetConfirm} data-testid="reset-btn">
          恢复默认数据
        </button>
      </GlassContainer>
    </div>
  );
};
