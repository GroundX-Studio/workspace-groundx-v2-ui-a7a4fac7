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

export interface AppCalendlyConfig {
  url: string;
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
  calendly: AppCalendlyConfig;
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
    calendly: Partial<AppCalendlyConfig>;
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

const stringFromEnv = (value: string | undefined, fallback = ""): string =>
  value?.trim() || fallback;

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
  calendly: {
    url: stringFromEnv(import.meta.env.VITE_CALENDLY_URL),
  },
  onboarding: {
    enabled: true,
    steps: [
      {
        id: "sessions",
        title: "Pick up where the proof left off",
        body: "Signed-in Studio keeps your current conversations and saved chat sessions available, so refreshes and follow-up work bring you back to the same grounded context.",
        primaryActionLabel: "Next: Workspaces",
        routeHint: "Home opens your last chat session when one exists; otherwise it starts from the onboarding sandbox.",
        educationLabel: "Authenticated surface",
        sourceFrame: "Saved sessions",
      },
      {
        id: "scopes",
        title: "Work in Workspaces and Projects",
        body: "Use Workspaces for bucket-wide conversations and Projects for focused document sets with the current project filter already applied.",
        primaryActionLabel: "Next: Sandbox",
        routeHint: "The left rail opens /workspaces and /projects as scoped conversations.",
        educationLabel: "Authenticated surfaces",
        sourceFrame: "Workspaces / Projects",
        launchHref: "/workspaces",
        launchLabel: "Open Workspaces",
      },
      {
        id: "sandbox",
        title: "Use the sandbox for the guided walkthrough",
        body: "The onboarding sandbox remains the canonical F-series journey for trying a sample, reading citations, extracting fields, asking grounded questions, and reaching Integrate.",
        primaryActionLabel: "Next: Outputs",
        routeHint: "Open /onboarding when you want the guided product proof again.",
        educationLabel: "Canonical walkthrough",
        sourceFrame: "F1-F7 Sandbox",
        launchHref: "/onboarding",
        launchLabel: "Open onboarding sandbox",
      },
      {
        id: "outputs",
        title: "Turn grounded work into outputs",
        body: "Ask grounded questions, inspect citations, extract structured fields, and build reports from the active workspace or project scope.",
        primaryActionLabel: "Next: Integrate",
        routeHint: "Extract, Interact, and Report all work from the selected content scope.",
        educationLabel: "Authenticated capabilities",
        sourceFrame: "Extract / Interact / Report",
      },
      {
        id: "integrate",
        title: "Wire GroundX into your stack",
        body: "Use Integrate for API snippets, SDK handoff, and agent plugin paths once the proof is ready to become production work.",
        routeHint: "Integrate keeps developer handoff visible for technical users.",
        educationLabel: "Authenticated handoff",
        sourceFrame: "F7 Integrate / API / Plugins",
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
  calendly: {
    ...DEFAULT_APP_CONFIG.calendly,
    ...overrides.calendly,
    url: stringFromEnv(overrides.calendly?.url, DEFAULT_APP_CONFIG.calendly.url),
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
