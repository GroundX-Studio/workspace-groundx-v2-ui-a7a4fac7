/**
 * GroundX Studio Harness MUI v5 theme — canonical, drop-in replacement for `src/theme.ts`.
 *
 * Every color, radius, font size, weight, letter-spacing, and line-height in
 * this file comes from a named constant imported from `./constants` (the
 * barrel that re-exports `./constants.generated` — auto-generated from
 * `../../eyelevel-design-standards/tokens.json` — plus `./constants.chrome`).
 * If a brand-level value needs to change, edit `tokens.json` (and the
 * narrative `tokens.md`) first, then re-run
 * `../../eyelevel-design-standards/scripts/generate-mirrors.mjs`; this file
 * picks it up for free.
 *
 * Corrections applied vs. the original:
 *   1. `palette.primary.main` now points at GREEN (was an unused #1976d2).
 *      Primary CTA in the brand is green, per the brand principle "Primary CTA
 *      is Green, not Coral" in `../../eyelevel-design-standards/references/colors.md`.
 *   2. `palette.secondary.main` is set to NAVY so `color="secondary"` gives
 *      you the navy accent without hex literals.
 *   3. Typography's default fontFamily is Inter at the theme root, so raw
 *      <span>/<div> text inherits the brand font (not only <Typography>).
 *   4. CssBaseline applies the font to `body` as a belt-and-suspenders backup.
 *   5. Component defaults for MuiCard, MuiPaper, MuiDivider, MuiTableCell, and
 *      MuiChip push the app's actual design choices (no elevation, 1px BORDER
 *      hairlines, BORDER_RADIUS_CARD rounding) into the theme so call sites
 *      can stop restating them in `sx`.
 *   6. Explicit typography variant ladder (h1…h6, body1, body2, caption, overline,
 *      button) replaces MUI's default scale, which was too loud at the top (h1=96px)
 *      and too tight in the middle (body and h6 only 4px apart). Every variant
 *      pulls its numbers from FONT_SIZE_*, FONT_WEIGHT_*, LINE_HEIGHT_*, and
 *      LETTER_SPACING_* constants — no literals.
 */

import { createTheme } from "@mui/material/styles";

import { DESIGN_CONFIG, DesignConfig } from "./designConfig";

// ──────────────────────────────────────────────────────────────────────────
// Custom MUI Button variant typings
//
// MUI's Button supports variant extension via module augmentation. We register
// our two named variants here so `<Button variant="gx-back-button">` type-checks.
// ──────────────────────────────────────────────────────────────────────────

declare module "@mui/material/Button" {
  interface ButtonPropsVariantOverrides {
    "gx-premium-button": true;
    "gx-back-button": true;
  }
}

export const createGxTheme = (designConfig: DesignConfig = DESIGN_CONFIG) => {
  const {
  colors: {
    bodyText: BODY_TEXT,
    border: BORDER,
    coral: CORAL,
    cyan: CYAN,
    darkGrey: DARK_GREY,
    focusRing: FOCUS_RING,
    green: GREEN,
    inputBorder: INPUT_BORDER,
    navy: NAVY,
    tint: TINT,
    white: WHITE,
  },
  typography: {
    fontFamily: FONT_FAMILY,
    fontFeatureSettings: FONT_FEATURE_SETTINGS,
    fontSize: {
      body: FONT_SIZE_BODY,
      bodySm: FONT_SIZE_BODY_SM,
      caption: FONT_SIZE_CAPTION,
      h1: FONT_SIZE_H1,
      h2: FONT_SIZE_H2,
      h3: FONT_SIZE_H3,
      h4: FONT_SIZE_H4,
      h5: FONT_SIZE_H5,
      h6: FONT_SIZE_H6,
      label: FONT_SIZE_LABEL,
    },
    weights: {
      body: FONT_WEIGHT_BODY,
      headline: FONT_WEIGHT_HEADLINE,
      label: FONT_WEIGHT_LABEL,
    },
    letterSpacing: {
      button: LETTER_SPACING_BUTTON,
      chip: LETTER_SPACING_CHIP,
      displayTight: LETTER_SPACING_DISPLAY_TIGHT,
      headingTight: LETTER_SPACING_HEADING_TIGHT,
      label: LETTER_SPACING_LABEL,
    },
    lineHeight: {
      body: LINE_HEIGHT_BODY,
      cardHeading: LINE_HEIGHT_CARD_HEADING,
      cardSubhead: LINE_HEIGHT_CARD_SUBHEAD,
      display: LINE_HEIGHT_DISPLAY,
      heading: LINE_HEIGHT_HEADING,
      section: LINE_HEIGHT_SECTION,
      subsection: LINE_HEIGHT_SUBSECTION,
      tightBody: LINE_HEIGHT_TIGHT_BODY,
    },
  },
  radii: {
    card: BORDER_RADIUS_CARD,
    md: BORDER_RADIUS,
  },
  breakpoints: {
    lg: BREAKPOINT_LG,
    md: BREAKPOINT_MD,
    sm: BREAKPOINT_SM,
    xl: BREAKPOINT_XL,
    xs: BREAKPOINT_XS,
  },
  chrome: {
    premiumGradientFrom: PREMIUM_GRADIENT_FROM,
    premiumGradientTo: PREMIUM_GRADIENT_TO,
  },
} = designConfig;

  return createTheme({
  // ────────────────────────────────────────────────────────────────────────
  // Breakpoints — values are pulled from constants.generated.ts. `md` = 900
  // (MUI default) is the iPad-portrait-to-landscape divide; `lg` = 1200
  // picks up small-desktop; `xl` = 1536 picks up large/ultrawide displays.
  // Every GroundX Studio Harness web project uses the same breakpoints so
  // components are mutually portable.
  // ────────────────────────────────────────────────────────────────────────
  breakpoints: {
    values: {
      xs: BREAKPOINT_XS,
      sm: BREAKPOINT_SM,
      md: BREAKPOINT_MD,
      lg: BREAKPOINT_LG,
      xl: BREAKPOINT_XL,
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // Palette
  // ────────────────────────────────────────────────────────────────────────
  palette: {
    mode: "light",
    primary: {
      main: GREEN,
      dark: NAVY,
      contrastText: WHITE,
    },
    secondary: {
      main: NAVY,
      contrastText: WHITE,
    },
    background: {
      default: TINT,
      paper: WHITE,
    },
    text: {
      primary: NAVY,
      secondary: BODY_TEXT,
    },
    divider: BORDER,
  },

  // ────────────────────────────────────────────────────────────────────────
  // Typography — Inter everywhere, and an explicit variant ladder.
  //
  // The web ladder is intentionally compressed relative to the slide ladder
  // (see eyelevel-slides/references/typography-slides.md). Display text on a
  // 1920×1080 canvas wants 64–112px headlines; a web app viewed at 24"
  // reading distance does not. H1 caps at 40px; subhead tiers (h5/h6) sit
  // close to body size so hierarchy comes from weight rather than giant
  // size jumps — consistent with brand principle #6 ("hierarchy through
  // weight, not size jumps").
  //
  // Every value below comes from a named constant that mirrors
  // design-standards/tokens.md § 2 (typography) and § 4 (web size scale).
  // ────────────────────────────────────────────────────────────────────────
  typography: {
    fontFamily: FONT_FAMILY,

    // Display heading — page-level marketing moment (rare in-app).
    h1: {
      fontSize: FONT_SIZE_H1,
      fontWeight: FONT_WEIGHT_HEADLINE,
      lineHeight: LINE_HEIGHT_DISPLAY,
      letterSpacing: LETTER_SPACING_DISPLAY_TIGHT,
      color: NAVY,
    },
    // Page heading — top-level title of a route or page section.
    h2: {
      fontSize: FONT_SIZE_H2,
      fontWeight: FONT_WEIGHT_HEADLINE,
      lineHeight: LINE_HEIGHT_HEADING,
      letterSpacing: LETTER_SPACING_HEADING_TIGHT,
      color: NAVY,
    },
    // Section heading — the top of a major card or region.
    h3: {
      fontSize: FONT_SIZE_H3,
      fontWeight: FONT_WEIGHT_HEADLINE,
      lineHeight: LINE_HEIGHT_SECTION,
      color: NAVY,
    },
    // Subsection — a second-level heading inside a section.
    h4: {
      fontSize: FONT_SIZE_H4,
      fontWeight: FONT_WEIGHT_HEADLINE,
      lineHeight: LINE_HEIGHT_SUBSECTION,
      color: NAVY,
    },
    // Card heading — the title of a GxCard.
    h5: {
      fontSize: FONT_SIZE_H5,
      fontWeight: FONT_WEIGHT_HEADLINE,
      lineHeight: LINE_HEIGHT_CARD_HEADING,
      color: NAVY,
    },
    // Card subhead — a small heading at body size; separated by weight.
    h6: {
      fontSize: FONT_SIZE_H6,
      fontWeight: FONT_WEIGHT_HEADLINE,
      lineHeight: LINE_HEIGHT_CARD_SUBHEAD,
      color: NAVY,
    },
    // Body — the default reading size for the project.
    body1: {
      fontSize: FONT_SIZE_BODY,
      fontWeight: FONT_WEIGHT_BODY,
      lineHeight: LINE_HEIGHT_BODY,
      color: BODY_TEXT,
    },
    // Body-sm — secondary paragraphs, table rows.
    body2: {
      fontSize: FONT_SIZE_BODY_SM,
      fontWeight: FONT_WEIGHT_BODY,
      lineHeight: LINE_HEIGHT_TIGHT_BODY,
      color: BODY_TEXT,
    },
    // Metadata — timestamps, row counts, inline help.
    caption: {
      fontSize: FONT_SIZE_CAPTION,
      fontWeight: FONT_WEIGHT_BODY,
      lineHeight: LINE_HEIGHT_TIGHT_BODY,
      color: DARK_GREY,
    },
    // Eyebrow / section label. Write the string uppercase; do NOT text-transform.
    overline: {
      fontSize: FONT_SIZE_LABEL,
      fontWeight: FONT_WEIGHT_LABEL,
      lineHeight: LINE_HEIGHT_SECTION,
      letterSpacing: LETTER_SPACING_LABEL,
      textTransform: "none", // explicit: content is literal uppercase
    },
    // Button label — inherited by the button component's internal Typography.
    button: {
      fontSize: FONT_SIZE_BODY_SM,
      fontWeight: FONT_WEIGHT_LABEL,
      lineHeight: 1,
      letterSpacing: LETTER_SPACING_BUTTON,
      textTransform: "none", // CommonSubmitButton uppercases its own label
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // Component defaults
  // ────────────────────────────────────────────────────────────────────────
  components: {
    // Apply the brand font globally so non-Typography text inherits it.
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          fontFamily: FONT_FAMILY,
          fontFeatureSettings: FONT_FEATURE_SETTINGS,
          backgroundColor: TINT,
        },
      },
    },

    // Surfaces — codify "flat white card with 1px BORDER hairline,
    // BORDER_RADIUS_CARD (20px) rounding."
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          border: `1px solid ${BORDER}`,
          borderRadius: BORDER_RADIUS_CARD,
          backgroundColor: WHITE,
          boxShadow: "none",
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: "none", // disable MUI's dark-mode overlay paint
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: BORDER,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: BORDER_RADIUS,
          backgroundColor: WHITE,
          fontFamily: FONT_FAMILY,
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: INPUT_BORDER,
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: NAVY,
          },
          "&.Mui-focused": {
            outline: `3px solid ${FOCUS_RING}`,
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: GREEN,
            borderWidth: 1,
          },
        },
        input: {
          fontFamily: FONT_FAMILY,
        },
      },
    },

    // Tables — every row uses the same hairline BORDER (10% navy), so a
    // table inside a GxCard reads as one continuous surface, not a stack of
    // boxed rows.
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${BORDER}`,
          fontFamily: FONT_FAMILY,
        },
        head: {
          fontWeight: FONT_WEIGHT_LABEL,
          color: NAVY,
        },
      },
    },

    // Chips default to the brand feel: compact, 600 weight, pill-shaped.
    // textTransform is intentionally absent — chip labels must be written
    // uppercase in the call site per the ALL-CAPS-as-literal brand rule.
    MuiChip: {
      styleOverrides: {
        root: {
          fontFamily: FONT_FAMILY,
          fontWeight: FONT_WEIGHT_LABEL,
          letterSpacing: LETTER_SPACING_CHIP,
        },
      },
    },

    // Icon buttons — keep the pale-cyan-with-green-hover behaviour the app
    // already relied on.
    MuiIconButton: {
      styleOverrides: {
        root: {
          backgroundColor: CYAN,
          "&:hover": {
            backgroundColor: GREEN,
          },
        },
      },
    },

    MuiLink: {
      styleOverrides: {
        root: {
          color: NAVY,
        },
      },
    },

    // Buttons — named variants only. Base MuiButton styling is deliberately
    // minimal; primary/secondary actions should go through CommonSubmitButton
    // / CommonCancelButton so their hover behaviour stays consistent.
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      variants: [
        {
          props: { variant: "gx-premium-button" },
          style: {
            padding: 8,
            color: WHITE,
            fontWeight: FONT_WEIGHT_LABEL,
            position: "relative",
            borderRadius: BORDER_RADIUS_CARD,
            backgroundColor: "transparent",
            zIndex: 1,
            "&:before": {
              content: '""',
              position: "absolute",
              inset: 0,
              zIndex: -1,
              borderRadius: "inherit",
              background: `linear-gradient(45deg, ${PREMIUM_GRADIENT_FROM} 30%, ${PREMIUM_GRADIENT_TO} 90%)`,
            },
            "&:hover:before": {
              background: `linear-gradient(45deg, ${PREMIUM_GRADIENT_TO} 30%, ${PREMIUM_GRADIENT_FROM} 90%)`,
            },
          },
        },
        {
          props: { variant: "gx-back-button" },
          style: {
            color: CORAL,
            textTransform: "none",
            fontWeight: FONT_WEIGHT_LABEL,
          },
        },
      ],
    },
  },
  });
};

const theme = createGxTheme();

export default theme;
