import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./styles.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.innerHTML =
    '<p style="padding:24px;font-family:sans-serif;color:#f07178">Missing #root element</p>';
} else {
  // Visible immediately so a blank webview is distinguishable from "React hung"
  rootEl.innerHTML =
    '<div style="height:100%;display:flex;align-items:center;justify-content:center;background:#0c0e12;color:#8b95a8;font-family:system-ui,sans-serif">Starting Grok Build…</div>';

  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
