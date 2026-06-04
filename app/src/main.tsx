import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { initSentry } from "@/lib/sentry";

// CF-13: one-shot Sentry boot. The wrapper makes every captureException
// a no-op when VITE_SENTRY_DSN is unset (dev, CI, local preview).
initSentry(import.meta.env.VITE_SENTRY_DSN);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
