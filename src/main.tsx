import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { initTransports } from "./lib/transports";
import "./styles/theme.css";
import "./styles/glass.css";

// Initialize logging and metrics before rendering
const isDev = import.meta.env.DEV;
initTransports({ logLevel: isDev ? "debug" : "info", isDev });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
