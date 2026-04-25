import { useEffect, useState } from "react";
import { TrayPanel } from "./views/tray/TrayPanel";
import { MainWindow } from "./views/main/MainWindow";
import { useCardStore } from "./stores/useCardStore";

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

/**
 * Apply the user's theme preference to `data-theme-effective` on the document
 * root. Runs in EVERY window (main + tray) so the tray follows the same theme
 * the user picked in Settings, not just the system default at boot.
 */
const useThemeEffect = () => {
  const theme = useCardStore((s) => s.settings.theme);
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const effective =
        theme === "system" ? (mq.matches ? "dark" : "light") : theme;
      root.setAttribute("data-theme-effective", effective);
      if (theme === "system") {
        root.removeAttribute("data-theme");
      } else {
        root.setAttribute("data-theme", theme);
      }
    };
    apply();
    const onChange = () => {
      if (theme === "system") apply();
    };
    mq.addEventListener("change", onChange);
    return () => {
      mq.removeEventListener("change", onChange);
    };
  }, [theme]);
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

  useThemeEffect();

  if (windowLabel === "tray") return <TrayPanel />;
  return <MainWindow />;
};
