import { useEffect, useState } from "react";
import { TrayPanel } from "./views/tray/TrayPanel";
import { MainWindow } from "./views/main/MainWindow";

// Detect which window to render.
// In Tauri: getCurrentWebviewWindow().label gives the window label.
// Dev fallback: ?window=tray in URL to test the tray panel, otherwise default to main.
const getWindowLabelSync = (): string => {
  // Check URL param first (works in both dev and Tauri)
  const params = new URLSearchParams(window.location.search);
  const urlParam = params.get("window");
  if (urlParam) return urlParam;

  // In Tauri runtime, __TAURI_INTERNALS__ is available synchronously
  try {
    const internals = (window as unknown as Record<string, unknown>)["__TAURI_INTERNALS__"] as
      | { metadata?: { currentWindow?: { label?: string } } }
      | undefined;
    const label = internals?.metadata?.currentWindow?.label;
    if (label) return label;
  } catch {
    // not in Tauri context
  }

  return "main";
};

export const App = () => {
  const [windowLabel, setWindowLabel] = useState<string>(getWindowLabelSync);

  useEffect(() => {
    // Confirm/refine label async via Tauri API when available
    import("@tauri-apps/api/webviewWindow")
      .then(({ getCurrentWebviewWindow }) => {
        const label = getCurrentWebviewWindow().label;
        if (label) setWindowLabel(label);
      })
      .catch(() => {
        // not in Tauri — keep the sync-detected label
      });
  }, []);

  if (windowLabel === "tray") return <TrayPanel />;
  return <MainWindow />;
};
