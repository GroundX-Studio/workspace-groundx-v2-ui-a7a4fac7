export const CALENDLY_WIDGET_SCRIPT_URL =
  "https://assets.calendly.com/assets/external/widget.js";
export const CALENDLY_WIDGET_STYLESHEET_URL =
  "https://assets.calendly.com/assets/external/widget.css";

export interface CalendlyInlineWidgetOptions {
  url: string;
  parentElement: HTMLElement;
}

declare global {
  interface Window {
    Calendly?: {
      initInlineWidget(options: CalendlyInlineWidgetOptions): void;
    };
  }
}

const SCRIPT_ID = "groundx-calendly-widget-script";
const STYLESHEET_ID = "groundx-calendly-widget-stylesheet";
const TRUSTED_CALENDLY_ORIGINS = /^https:\/\/([a-z0-9-]+\.)?calendly\.com$/i;

let scriptPromise: Promise<void> | null = null;

export function isTrustedCalendlyOrigin(origin: string): boolean {
  return TRUSTED_CALENDLY_ORIGINS.test(origin);
}

export function isCalendlyScheduledEvent(event: MessageEvent): boolean {
  if (!isTrustedCalendlyOrigin(event.origin)) return false;
  const data = event.data as { event?: string } | null;
  return data?.event === "calendly.event_scheduled";
}

function ensureCalendlyStylesheet(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLESHEET_ID)) return;

  const link = document.createElement("link");
  link.id = STYLESHEET_ID;
  link.rel = "stylesheet";
  link.href = CALENDLY_WIDGET_STYLESHEET_URL;
  link.dataset.calendlyEmbedAsset = "true";
  document.head.appendChild(link);
}

export function loadCalendlyEmbedAssets(): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("Calendly embed requires a browser"));
  }

  ensureCalendlyStylesheet();

  if (window.Calendly?.initInlineWidget) {
    return Promise.resolve();
  }

  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");

    const onLoad = () => {
      script.dataset.loaded = "true";
      if (window.Calendly?.initInlineWidget) {
        resolve();
        return;
      }
      reject(new Error("Calendly widget script loaded without initInlineWidget"));
    };
    const onError = () => reject(new Error("Unable to load Calendly widget script"));

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });

    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = CALENDLY_WIDGET_SCRIPT_URL;
      script.async = true;
      script.dataset.calendlyEmbedAsset = "true";
      document.head.appendChild(script);
    }
  }).catch((error) => {
    scriptPromise = null;
    throw error;
  });

  return scriptPromise;
}
