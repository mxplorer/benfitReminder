import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { initTransports } from "./lib/transports";
import "./styles/theme.css";
import "./styles/glass.css";

// Seed the effective theme BEFORE React paints so the first frame matches
// the system preference. MainWindow takes over once the user's stored
// preference hydrates from disk.
{
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.setAttribute(
    "data-theme-effective",
    systemDark ? "dark" : "light",
  );
}

// Initialize logging and metrics before rendering
const isDev = import.meta.env.DEV;
initTransports({ logLevel: isDev ? "debug" : "info", isDev });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
