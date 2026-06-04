export interface AppLogoConfig {
  src: string;
  alt: string;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export interface AppDesignOverrides {
  colors: {
    navy: string;
    green: string;
    cyan: string;
    tint: string;
    coral: string;
    bodyText: string;
    gray: string;
    white: string;
    border: string;
    errorRed: string;
    lighterRed: string;
    blue: string;
    darkGrey: string;
    eyebrowOnLight: string;
    eyebrowOnDark: string;
    bodyOnLight: string;
    bodyOnDark: string;
    mutedOnLight: string;
    mutedOnDark: string;
    inputBorder: string;
    focusRing: string;
  };
  typography: {
    fontFamily: string;
    marketingFontFamily: string;
    fontFeatureSettings: string;
    weights: Record<"body" | "label" | "headline" | "display", number>;
    letterSpacing: Record<"label" | "button" | "chip" | "displayTight" | "headingTight" | "pill" | "displayLabel", string>;
    lineHeight: Record<"display" | "heading" | "section" | "subsection" | "cardHeading" | "cardSubhead" | "tightBody" | "body", number>;
    fontSize: Record<"displayLg" | "displayMd" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "body" | "bodySm" | "caption" | "label" | "labelDense", string>;
  };
  radii: Record<"sm" | "md" | "lg" | "card" | "pill", string>;
  spacing: Record<"padding" | "mainContentPadding" | "mainContentTopMargin", number>;
  breakpoints: Record<"xs" | "sm" | "md" | "lg" | "xl", number>;
  durations: {
    messageBar: number;
  };
  chrome: {
    premiumGradientFrom: string;
    premiumGradientTo: string;
  };
}

export interface AppApiConfig {
  basePath: string;
  defaultPageSize: number;
}

export interface AppLegalConfig {
  termsUrl: string;
}

export interface AppOnboardingStepConfig {
  id: string;
  title: string;
  body: string;
  primaryActionLabel?: string;
  routeHint?: string;
  educationLabel?: string;
  sourceFrame?: string;
  launchHref?: string;
  launchLabel?: string;
}

export interface AppOnboardingConfig {
  enabled: boolean;
  steps: AppOnboardingStepConfig[];
}

export interface AppConfig {
  appName: string;
  logos: {
    auth: AppLogoConfig;
    dark: AppLogoConfig;
    passwordReset: AppLogoConfig;
  };
  legal: AppLegalConfig;
  api: AppApiConfig;
  onboarding: AppOnboardingConfig;
  design: DeepPartial<AppDesignOverrides>;
}

export type AppConfigOverrides = Partial<
  Pick<AppConfig, "appName"> & {
    logos: {
      [K in keyof AppConfig["logos"]]?: Partial<AppConfig["logos"][K]>;
    };
    api: Partial<AppApiConfig>;
    legal: Partial<AppLegalConfig>;
    onboarding: Partial<AppOnboardingConfig>;
    design: DeepPartial<AppDesignOverrides>;
  }
>;

const trimTrailingSlash = (value: string | undefined, fallback = ""): string => {
  const resolved = value?.trim() || fallback;
  return resolved.replace(/\/+$/, "");
};

const numberFromEnv = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const DEFAULT_APP_CONFIG: AppConfig = {
  appName: "GroundX Studio",
  logos: {
    auth: {
      src: "/assets/logos/groundx-studio-color.png",
      alt: "GroundX Studio",
    },
    dark: {
      src: "/assets/logos/groundx-studio-white.png",
      alt: "GroundX Studio",
    },
    passwordReset: {
      src: "/assets/logos/groundx-studio-color.png",
      alt: "GroundX Studio",
    },
  },
  api: {
    basePath: "/api",
    defaultPageSize: numberFromEnv(import.meta.env.VITE_SDK_DEFAULT_PAGE_SIZE, 20),
  },
  legal: {
    termsUrl: "https://www.eyelevel.ai/product/terms-conditions",
  },
  onboarding: {
    enabled: true,
    steps: [
      {
        id: "ingest",
        title: "Start from a source",
        body: "Pick a sample, upload a PDF, or connect a source so GroundX can build a grounded workspace around real content.",
        primaryActionLabel: "Next: Understand",
        routeHint: "The sandbox starts at /onboarding with the F1 Ingest picker.",
        educationLabel: "Source frame",
        sourceFrame: "F1 Ingest",
        launchHref: "/onboarding",
        launchLabel: "Open onboarding sandbox",
      },
      {
        id: "understand",
        title: "Understand what GroundX read",
        body: "Watch the processing view pair the document with chat context, reading progress, citations, and why-matched evidence.",
        primaryActionLabel: "Next: Extract",
        routeHint: "F2 keeps the source document and conversation side by side.",
        educationLabel: "Source frame",
        sourceFrame: "F2 Understand",
      },
      {
        id: "extract",
        title: "Extract structured fields",
        body: "Review schema-backed fields, confidence, and source citations before saving or adjusting the extraction design.",
        primaryActionLabel: "Next: Interact",
        routeHint: "The utility path exposes statement, meter, and charge fields with citation evidence.",
        educationLabel: "Source frames",
        sourceFrame: "F3/F3a Extract",
      },
      {
        id: "interact-report",
        title: "Ask, verify, and report",
        body: "Use grounded chat to explain results, inspect citation evidence, and promote useful answers into reports when the workflow calls for it.",
        primaryActionLabel: "Next: Integrate",
        routeHint: "F5 is the grounded answer path; F6 keeps sign-in as an inline gate when saving or exporting.",
        educationLabel: "Source frames",
        sourceFrame: "F5 Interact / F6 Gate",
      },
      {
        id: "integrate",
        title: "Wire GroundX into your stack",
        body: "Finish the walkthrough, then use Integrate for API snippets, agent plugins, and the next handoff from demo to production.",
        routeHint: "F7 is where signed-in users move from proof to implementation.",
        educationLabel: "Source frame",
        sourceFrame: "F7 Integrate",
      },
    ],
  },
  design: {},
};

export const createAppConfig = (overrides: AppConfigOverrides = {}): AppConfig => ({
  appName: overrides.appName?.trim() || DEFAULT_APP_CONFIG.appName,
  logos: {
    auth: {
      ...DEFAULT_APP_CONFIG.logos.auth,
      ...overrides.logos?.auth,
    },
    dark: {
      ...DEFAULT_APP_CONFIG.logos.dark,
      ...overrides.logos?.dark,
    },
    passwordReset: {
      ...DEFAULT_APP_CONFIG.logos.passwordReset,
      ...overrides.logos?.passwordReset,
    },
  },
  api: {
    ...DEFAULT_APP_CONFIG.api,
    ...overrides.api,
    basePath: trimTrailingSlash(overrides.api?.basePath, DEFAULT_APP_CONFIG.api.basePath),
  },
  legal: {
    ...DEFAULT_APP_CONFIG.legal,
    ...overrides.legal,
  },
  onboarding: {
    ...DEFAULT_APP_CONFIG.onboarding,
    ...overrides.onboarding,
    steps: overrides.onboarding?.steps ?? DEFAULT_APP_CONFIG.onboarding.steps,
  },
  design: {
    ...DEFAULT_APP_CONFIG.design,
    ...overrides.design,
  },
});

export const APP_CONFIG = createAppConfig();

export const APP_NAME = APP_CONFIG.appName;

export const APP_LOGOS = APP_CONFIG.logos;

export const getPageTitle = (pageTitle: string, appName = APP_NAME) => `${pageTitle} | ${appName}`;
