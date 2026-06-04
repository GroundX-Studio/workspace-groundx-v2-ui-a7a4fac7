import { describe, expect, it } from "vitest";

import { APP_LOGOS, APP_NAME, createAppConfig, DEFAULT_APP_CONFIG, getPageTitle } from "@/appConfig";

describe("appConfig", () => {
  it("uses the default GroundX identity when no config overrides are supplied", () => {
    expect(createAppConfig()).toEqual(DEFAULT_APP_CONFIG);
    expect(APP_NAME).toBe(DEFAULT_APP_CONFIG.appName);
    expect(APP_LOGOS).toEqual(DEFAULT_APP_CONFIG.logos);
    expect(DEFAULT_APP_CONFIG.appName).toBe("GroundX Studio");
    expect(DEFAULT_APP_CONFIG.logos.auth).toEqual({
      src: "/assets/logos/groundx-studio-color.png",
      alt: "GroundX Studio",
    });
    expect(DEFAULT_APP_CONFIG.logos.dark).toEqual({
      src: "/assets/logos/groundx-studio-white.png",
      alt: "GroundX Studio",
    });
    expect(DEFAULT_APP_CONFIG.logos.passwordReset).toEqual(DEFAULT_APP_CONFIG.logos.auth);
    expect(DEFAULT_APP_CONFIG.api).toEqual({
      basePath: "/api",
      defaultPageSize: 20,
    });
    expect(DEFAULT_APP_CONFIG.legal).toEqual({
      termsUrl: "https://www.eyelevel.ai/product/terms-conditions",
    });
    expect(DEFAULT_APP_CONFIG.onboarding.enabled).toBe(true);
    expect(DEFAULT_APP_CONFIG.onboarding.steps.map((step) => step.id)).toEqual([
      "ingest",
      "understand",
      "extract",
      "interact-report",
      "integrate",
    ]);
    expect(DEFAULT_APP_CONFIG.onboarding.steps[0]).toMatchObject({
      title: "Start from a source",
      sourceFrame: "F1 Ingest",
      launchHref: "/onboarding",
      launchLabel: "Open onboarding sandbox",
    });
    expect(DEFAULT_APP_CONFIG.design).toEqual({});
  });

  it("falls back to the default app name when an override is blank", () => {
    expect(createAppConfig({ appName: "   " }).appName).toBe(DEFAULT_APP_CONFIG.appName);
  });

  it("uses the configured app name in browser page titles", () => {
    const config = createAppConfig({ appName: "Acme Console" });

    expect(getPageTitle("Login", config.appName)).toBe("Login | Acme Console");
  });

  it("uses the default app name in browser page titles when no app name is passed", () => {
    expect(getPageTitle("Login")).toBe(`Login | ${DEFAULT_APP_CONFIG.appName}`);
  });

  it("allows changing one logo while preserving the other default logos", () => {
    const config = createAppConfig({
      logos: {
        auth: {
          src: "/assets/acme-mark.svg",
          alt: "Acme",
        },
      },
    });

    expect(config.logos.auth).toEqual({
      src: "/assets/acme-mark.svg",
      alt: "Acme",
    });
    expect(config.logos.dark).toEqual(DEFAULT_APP_CONFIG.logos.dark);
    expect(config.logos.passwordReset).toEqual(DEFAULT_APP_CONFIG.logos.passwordReset);
  });

  it("allows changing only a logo path while preserving that logo's default alt text", () => {
    const config = createAppConfig({
      logos: {
        dark: {
          src: "/assets/acme-wordmark-white.svg",
        },
      },
    });

    expect(config.logos.dark).toEqual({
      ...DEFAULT_APP_CONFIG.logos.dark,
      src: "/assets/acme-wordmark-white.svg",
    });
  });

  it("allows changing every logo used by the auth flow", () => {
    const config = createAppConfig({
      logos: {
        auth: {
          src: "/assets/acme-mark.svg",
          alt: "Acme",
        },
        dark: {
          src: "/assets/acme-wordmark-white.svg",
          alt: "Acme Console",
        },
        passwordReset: {
          src: "/assets/acme-reset.svg",
          alt: "Acme Password Reset",
        },
      },
    });

    expect(config.logos.auth.src).toBe("/assets/acme-mark.svg");
    expect(config.logos.dark.src).toBe("/assets/acme-wordmark-white.svg");
    expect(config.logos.passwordReset.src).toBe("/assets/acme-reset.svg");
  });

  it("uses one appConfig surface for app identity, same-origin API path, legal links, and design overrides", () => {
    const config = createAppConfig({
      api: {
        basePath: "/internal-api/",
        defaultPageSize: 50,
      },
      legal: {
        termsUrl: "https://example.com/legal/terms",
      },
      design: {
        colors: {
          green: "#12aa77",
        },
      },
    });

    expect(config.api).toEqual({
      basePath: "/internal-api",
      defaultPageSize: 50,
    });
    expect(config.legal).toEqual({
      termsUrl: "https://example.com/legal/terms",
    });
    expect(config.design).toEqual({
      colors: {
        green: "#12aa77",
      },
    });
  });

  it("does not expose GroundX, Partner, or LLM secrets in browser config", () => {
    expect("groundxApiKey" in DEFAULT_APP_CONFIG.api).toBe(false);
    expect("llm" in DEFAULT_APP_CONFIG).toBe(false);
  });

  it("allows overriding onboarding enablement and steps from browser-safe config", () => {
    const config = createAppConfig({
      onboarding: {
        enabled: false,
        steps: [
          {
            id: "welcome",
            title: "Welcome",
            body: "Learn the custom app.",
            primaryActionLabel: "Start",
          },
        ],
      },
    });

    expect(config.onboarding.enabled).toBe(false);
    expect(config.onboarding.steps).toEqual([
      {
        id: "welcome",
        title: "Welcome",
        body: "Learn the custom app.",
        primaryActionLabel: "Start",
      },
    ]);
  });
});
