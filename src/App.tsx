import { TrayPanel } from "./views/tray/TrayPanel";
import { MainWindow } from "./views/main/MainWindow";

// Detect which window to render.
// In Tauri: window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label gives the window label.
// Dev fallback: ?window=tray in URL to test the tray panel, otherwise default to main.
const getWindowLabel = (): string => {
  try {
    const tauriInternals = (window as Record<string, unknown>)["__TAURI_INTERNALS__"] as
      | { metadata?: { currentWindow?: { label?: string } } }
      | undefined;
    const label = tauriInternals?.metadata?.currentWindow?.label;
    if (label) return label;
  } catch {
    // not in Tauri context
  }
  const params = new URLSearchParams(window.location.search);
  return params.get("window") ?? "main";
};

export const App = () => {
  const windowLabel = getWindowLabel();
  if (windowLabel === "tray") return <TrayPanel />;
  return <MainWindow />;
};
