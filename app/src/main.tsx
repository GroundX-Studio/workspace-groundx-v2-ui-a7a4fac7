import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { initAnalytics } from "@/lib/analytics";
import { gaSetDefaults, initGa } from "@/lib/ga";
import { initSentry } from "@/lib/sentry";

// CF-13: one-shot Sentry boot. The wrapper makes every captureException
// a no-op when VITE_SENTRY_DSN is unset (dev, CI, local preview).
initSentry(import.meta.env.VITE_SENTRY_DSN);
// OB-02: PostHog boot. No-op when VITE_POSTHOG_API_KEY is unset.
initAnalytics(
  import.meta.env.VITE_POSTHOG_API_KEY,
  import.meta.env.VITE_POSTHOG_HOST,
);
// OB-03: GA4 boot. No-op when VITE_GA_MEASUREMENT_ID is unset.
// `llmProvider` is the only OB-03 dimension known at boot time
// (env-derived); the other three (sessionId, appMode, currentSample)
// get set by their respective contexts at the right boundary.
initGa(import.meta.env.VITE_GA_MEASUREMENT_ID);
gaSetDefaults({
  llmProvider: import.meta.env.VITE_LLM_PROVIDER ?? undefined,
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
