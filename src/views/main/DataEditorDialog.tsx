import { useEffect, useState } from "react";
import { useCardStore } from "../../stores/useCardStore";
import "./DataEditorDialog.css";

interface DataEditorDialogProps {
  onClose: () => void;
}

const prettyPrint = (raw: string): string => {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
};

export const DataEditorDialog = ({ onClose }: DataEditorDialogProps) => {
  const exportData = useCardStore((s) => s.exportData);
  const importData = useCardStore((s) => s.importData);

  const [text, setText] = useState<string>(() => prettyPrint(exportData()));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<boolean>(false);
  const [dirty, setDirty] = useState<boolean>(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const handleSave = () => {
    try {
      importData(text);
      setError(null);
      setSaved(true);
      setDirty(false);
      setTimeout(() => { setSaved(false); }, 1800);
    } catch (err) {
      setError(String(err));
      setSaved(false);
    }
  };

  const handleReload = () => {
    setText(prettyPrint(exportData()));
    setError(null);
    setDirty(false);
  };

  const handleFormat = () => {
    try {
      setText(JSON.stringify(JSON.parse(text), null, 2));
      setError(null);
    } catch (err) {
      setError(`无法格式化: ${String(err)}`);
    }
  };

  return (
    <div
      className="data-editor__overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="data-editor-overlay"
    >
      <div className="data-editor" role="dialog" aria-label="数据编辑器">
        <div className="data-editor__header">
          <h2 className="data-editor__title">数据编辑器</h2>
          <span className="data-editor__subtitle">
            直接编辑持久化的 JSON 数据。保存会走导入校验，格式错误不会污染 store。
          </span>
        </div>

        <textarea
          className="data-editor__textarea"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDirty(true);
            setSaved(false);
          }}
          spellCheck={false}
          autoFocus
          data-testid="data-editor-textarea"
        />

        {error && (
          <div className="data-editor__error" role="alert">
            {error}
          </div>
        )}

        <div className="data-editor__actions">
          <button
            type="button"
            className="data-editor__btn"
            onClick={handleFormat}
          >
            格式化
          </button>
          <button
            type="button"
            className="data-editor__btn"
            onClick={handleReload}
            disabled={!dirty}
          >
            重新加载
          </button>
          <span className="data-editor__status" aria-live="polite">
            {saved ? "已保存" : dirty ? "未保存" : ""}
          </span>
          <button
            type="button"
            className="data-editor__btn"
            onClick={onClose}
          >
            关闭
          </button>
          <button
            type="button"
            className="data-editor__btn data-editor__btn--primary"
            onClick={handleSave}
            data-testid="data-editor-save"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};
