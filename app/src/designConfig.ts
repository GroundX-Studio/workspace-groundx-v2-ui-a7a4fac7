import {
  BODY_TEXT,
  BODY_ON_DARK,
  BODY_ON_LIGHT,
  BORDER,
  BORDER_RADIUS,
  BORDER_RADIUS_2X,
  BORDER_RADIUS_CARD,
  BORDER_RADIUS_PILL,
  BORDER_RADIUS_SM,
  BLUE,
  BREAKPOINT_LG,
  BREAKPOINT_MD,
  BREAKPOINT_SM,
  BREAKPOINT_XL,
  BREAKPOINT_XS,
  CORAL,
  CYAN,
  DARK_GREY,
  ERROR_RED,
  EYEBROW_ON_DARK,
  EYEBROW_ON_LIGHT,
  FONT_FAMILY,
  FONT_FAMILY_MARKETING,
  FONT_FEATURE_SETTINGS,
  FONT_SIZE_BODY,
  FONT_SIZE_BODY_SM,
  FONT_SIZE_CAPTION,
  FONT_SIZE_DISPLAY_LG,
  FONT_SIZE_DISPLAY_MD,
  FONT_SIZE_H1,
  FONT_SIZE_H2,
  FONT_SIZE_H3,
  FONT_SIZE_H4,
  FONT_SIZE_H5,
  FONT_SIZE_H6,
  FONT_SIZE_LABEL,
  FONT_SIZE_LABEL_DENSE,
  FONT_WEIGHT_BODY,
  FONT_WEIGHT_DISPLAY,
  FONT_WEIGHT_HEADLINE,
  FONT_WEIGHT_LABEL,
  FOCUS_RING,
  GREEN,
  GRAY,
  INPUT_BORDER,
  LETTER_SPACING_BUTTON,
  LETTER_SPACING_CHIP,
  LETTER_SPACING_DISPLAY_LABEL,
  LETTER_SPACING_DISPLAY_TIGHT,
  LETTER_SPACING_HEADING_TIGHT,
  LETTER_SPACING_LABEL,
  LETTER_SPACING_PILL,
  LIGHTER_RED,
  LINE_HEIGHT_BODY,
  LINE_HEIGHT_CARD_HEADING,
  LINE_HEIGHT_CARD_SUBHEAD,
  LINE_HEIGHT_DISPLAY,
  LINE_HEIGHT_HEADING,
  LINE_HEIGHT_SECTION,
  LINE_HEIGHT_SUBSECTION,
  LINE_HEIGHT_TIGHT_BODY,
  MAIN_CONTENT_PADDING,
  MAIN_CONTENT_TOP_MARGIN,
  MESSAGE_BAR_DURATION,
  MUTED_ON_DARK,
  MUTED_ON_LIGHT,
  NAVY,
  PADDING,
  PREMIUM_GRADIENT_FROM,
  PREMIUM_GRADIENT_TO,
  TINT,
  WHITE,
} from "./constants";
import { APP_CONFIG, DeepPartial } from "./appConfig";

export interface DesignConfig {
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
    weights: {
      body: number;
      label: number;
      headline: number;
      display: number;
    };
    letterSpacing: {
      label: string;
      button: string;
      chip: string;
      displayTight: string;
      headingTight: string;
      pill: string;
      displayLabel: string;
    };
    lineHeight: {
      display: number;
      heading: number;
      section: number;
      subsection: number;
      cardHeading: number;
      cardSubhead: number;
      tightBody: number;
      body: number;
    };
    fontSize: {
      displayLg: string;
      displayMd: string;
      h1: string;
      h2: string;
      h3: string;
      h4: string;
      h5: string;
      h6: string;
      body: string;
      bodySm: string;
      caption: string;
      label: string;
      labelDense: string;
    };
  };
  radii: {
    sm: string;
    md: string;
    lg: string;
    card: string;
    pill: string;
  };
  spacing: {
    padding: number;
    mainContentPadding: number;
    mainContentTopMargin: number;
  };
  breakpoints: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  durations: {
    messageBar: number;
  };
  chrome: {
    premiumGradientFrom: string;
    premiumGradientTo: string;
  };
}

export const DEFAULT_DESIGN_CONFIG: DesignConfig = {
  colors: {
    navy: NAVY,
    green: GREEN,
    cyan: CYAN,
    tint: TINT,
    coral: CORAL,
    bodyText: BODY_TEXT,
    gray: GRAY,
    white: WHITE,
    border: BORDER,
    errorRed: ERROR_RED,
    lighterRed: LIGHTER_RED,
    blue: BLUE,
    darkGrey: DARK_GREY,
    eyebrowOnLight: EYEBROW_ON_LIGHT,
    eyebrowOnDark: EYEBROW_ON_DARK,
    bodyOnLight: BODY_ON_LIGHT,
    bodyOnDark: BODY_ON_DARK,
    mutedOnLight: MUTED_ON_LIGHT,
    mutedOnDark: MUTED_ON_DARK,
    inputBorder: INPUT_BORDER,
    focusRing: FOCUS_RING,
  },
  typography: {
    fontFamily: FONT_FAMILY,
    marketingFontFamily: FONT_FAMILY_MARKETING,
    fontFeatureSettings: FONT_FEATURE_SETTINGS,
    weights: {
      body: FONT_WEIGHT_BODY,
      label: FONT_WEIGHT_LABEL,
      headline: FONT_WEIGHT_HEADLINE,
      display: FONT_WEIGHT_DISPLAY,
    },
    letterSpacing: {
      label: LETTER_SPACING_LABEL,
      button: LETTER_SPACING_BUTTON,
      chip: LETTER_SPACING_CHIP,
      displayTight: LETTER_SPACING_DISPLAY_TIGHT,
      headingTight: LETTER_SPACING_HEADING_TIGHT,
      pill: LETTER_SPACING_PILL,
      displayLabel: LETTER_SPACING_DISPLAY_LABEL,
    },
    lineHeight: {
      display: LINE_HEIGHT_DISPLAY,
      heading: LINE_HEIGHT_HEADING,
      section: LINE_HEIGHT_SECTION,
      subsection: LINE_HEIGHT_SUBSECTION,
      cardHeading: LINE_HEIGHT_CARD_HEADING,
      cardSubhead: LINE_HEIGHT_CARD_SUBHEAD,
      tightBody: LINE_HEIGHT_TIGHT_BODY,
      body: LINE_HEIGHT_BODY,
    },
    fontSize: {
      displayLg: FONT_SIZE_DISPLAY_LG,
      displayMd: FONT_SIZE_DISPLAY_MD,
      h1: FONT_SIZE_H1,
      h2: FONT_SIZE_H2,
      h3: FONT_SIZE_H3,
      h4: FONT_SIZE_H4,
      h5: FONT_SIZE_H5,
      h6: FONT_SIZE_H6,
      body: FONT_SIZE_BODY,
      bodySm: FONT_SIZE_BODY_SM,
      caption: FONT_SIZE_CAPTION,
      label: FONT_SIZE_LABEL,
      labelDense: FONT_SIZE_LABEL_DENSE,
    },
  },
  radii: {
    sm: BORDER_RADIUS_SM,
    md: BORDER_RADIUS,
    lg: BORDER_RADIUS_2X,
    card: BORDER_RADIUS_CARD,
    pill: BORDER_RADIUS_PILL,
  },
  spacing: {
    padding: PADDING,
    mainContentPadding: MAIN_CONTENT_PADDING,
    mainContentTopMargin: MAIN_CONTENT_TOP_MARGIN,
  },
  breakpoints: {
    xs: BREAKPOINT_XS,
    sm: BREAKPOINT_SM,
    md: BREAKPOINT_MD,
    lg: BREAKPOINT_LG,
    xl: BREAKPOINT_XL,
  },
  durations: {
    messageBar: MESSAGE_BAR_DURATION,
  },
  chrome: {
    premiumGradientFrom: PREMIUM_GRADIENT_FROM,
    premiumGradientTo: PREMIUM_GRADIENT_TO,
  },
};

export const createDesignConfig = (overrides: DeepPartial<DesignConfig> = {}): DesignConfig => ({
  colors: {
    ...DEFAULT_DESIGN_CONFIG.colors,
    ...overrides.colors,
  },
  typography: {
    ...DEFAULT_DESIGN_CONFIG.typography,
    ...overrides.typography,
    weights: {
      ...DEFAULT_DESIGN_CONFIG.typography.weights,
      ...overrides.typography?.weights,
    },
    letterSpacing: {
      ...DEFAULT_DESIGN_CONFIG.typography.letterSpacing,
      ...overrides.typography?.letterSpacing,
    },
    lineHeight: {
      ...DEFAULT_DESIGN_CONFIG.typography.lineHeight,
      ...overrides.typography?.lineHeight,
    },
    fontSize: {
      ...DEFAULT_DESIGN_CONFIG.typography.fontSize,
      ...overrides.typography?.fontSize,
    },
  },
  radii: {
    ...DEFAULT_DESIGN_CONFIG.radii,
    ...overrides.radii,
  },
  spacing: {
    ...DEFAULT_DESIGN_CONFIG.spacing,
    ...overrides.spacing,
  },
  breakpoints: {
    ...DEFAULT_DESIGN_CONFIG.breakpoints,
    ...overrides.breakpoints,
  },
  durations: {
    ...DEFAULT_DESIGN_CONFIG.durations,
    ...overrides.durations,
  },
  chrome: {
    ...DEFAULT_DESIGN_CONFIG.chrome,
    ...overrides.chrome,
  },
});

export const DESIGN_CONFIG = createDesignConfig(APP_CONFIG.design as DeepPartial<DesignConfig>);
