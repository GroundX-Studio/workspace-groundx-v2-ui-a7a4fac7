import { describe, expect, it } from "vitest";

import theme, { createGxTheme } from "@/theme";
import { createDesignConfig, DEFAULT_DESIGN_CONFIG } from "@/designConfig";

const getVariantStyle = (createdTheme: typeof theme, variantName: string) => {
  const variant = createdTheme.components?.MuiButton?.variants?.find(({ props }) => {
    if (typeof props === "function") return false;
    return props?.variant === variantName;
  });
  return variant?.style as Record<string, unknown>;
};

const getCssBaselineBodyStyle = (createdTheme: typeof theme) =>
  (createdTheme.components?.MuiCssBaseline?.styleOverrides as { body?: Record<string, unknown> })?.body;

describe("theme", () => {
  it("uses designConfig defaults for palette, typography, breakpoints, and surfaces", () => {
    expect(theme.palette.primary.main).toBe(DEFAULT_DESIGN_CONFIG.colors.green);
    expect(theme.palette.secondary.main).toBe(DEFAULT_DESIGN_CONFIG.colors.navy);
    expect(theme.palette.background.default).toBe(DEFAULT_DESIGN_CONFIG.colors.tint);
    expect(theme.palette.divider).toBe(DEFAULT_DESIGN_CONFIG.colors.border);
    expect(theme.breakpoints.values.md).toBe(DEFAULT_DESIGN_CONFIG.breakpoints.md);
    expect(theme.typography.fontFamily).toBe(DEFAULT_DESIGN_CONFIG.typography.fontFamily);
    expect(getCssBaselineBodyStyle(theme)).toMatchObject({
      fontFamily: DEFAULT_DESIGN_CONFIG.typography.fontFamily,
      fontFeatureSettings: DEFAULT_DESIGN_CONFIG.typography.fontFeatureSettings,
      backgroundColor: DEFAULT_DESIGN_CONFIG.colors.tint,
    });
    expect(theme.typography.h1).toMatchObject({
      fontSize: DEFAULT_DESIGN_CONFIG.typography.fontSize.h1,
      fontWeight: DEFAULT_DESIGN_CONFIG.typography.weights.headline,
      lineHeight: DEFAULT_DESIGN_CONFIG.typography.lineHeight.display,
      color: DEFAULT_DESIGN_CONFIG.colors.navy,
    });

    expect(theme.components?.MuiCard?.styleOverrides?.root).toMatchObject({
      border: `1px solid ${DEFAULT_DESIGN_CONFIG.colors.border}`,
      borderRadius: DEFAULT_DESIGN_CONFIG.radii.card,
      backgroundColor: DEFAULT_DESIGN_CONFIG.colors.white,
      boxShadow: "none",
    });
    expect(theme.components?.MuiOutlinedInput?.styleOverrides?.root).toMatchObject({
      borderRadius: DEFAULT_DESIGN_CONFIG.radii.md,
      backgroundColor: DEFAULT_DESIGN_CONFIG.colors.white,
      "& .MuiOutlinedInput-notchedOutline": {
        borderColor: DEFAULT_DESIGN_CONFIG.colors.inputBorder,
      },
      "&.Mui-focused": {
        outline: `3px solid ${DEFAULT_DESIGN_CONFIG.colors.focusRing}`,
      },
    });
  });

  it("applies local designConfig overrides through the theme factory", () => {
    const customConfig = createDesignConfig({
      colors: {
        green: "#12aa77",
        navy: "#112244",
        tint: "#f8fbff",
        white: "#fefefe",
        border: "rgba(17, 34, 68, 0.2)",
        coral: "#ff5500",
        inputBorder: "rgba(17, 34, 68, 0.4)",
        focusRing: "rgba(18, 170, 119, 0.3)",
      },
      typography: {
        fontFamily: "\"Example Sans\", sans-serif",
        fontSize: {
          h1: "3rem",
        },
        weights: {
          headline: 800,
          label: 700,
        },
        letterSpacing: {
          button: "0.2em",
        },
        lineHeight: {
          display: 1.05,
        },
      },
      radii: {
        card: "10px",
        md: "8px",
      },
      breakpoints: {
        md: 980,
      },
      chrome: {
        premiumGradientFrom: "#111111",
        premiumGradientTo: "#222222",
      },
    });

    const customTheme = createGxTheme(customConfig);
    const premiumButtonStyle = getVariantStyle(customTheme, "gx-premium-button");
    const backButtonStyle = getVariantStyle(customTheme, "gx-back-button");

    expect(customTheme.palette.primary.main).toBe("#12aa77");
    expect(customTheme.palette.secondary.main).toBe("#112244");
    expect(customTheme.palette.background.default).toBe("#f8fbff");
    expect(customTheme.palette.divider).toBe("rgba(17, 34, 68, 0.2)");
    expect(customTheme.breakpoints.values.md).toBe(980);
    expect(customTheme.typography.fontFamily).toBe("\"Example Sans\", sans-serif");
    expect(customTheme.typography.h1).toMatchObject({
      fontSize: "3rem",
      fontWeight: 800,
      lineHeight: 1.05,
      color: "#112244",
    });
    expect(customTheme.typography.button).toMatchObject({
      fontWeight: 700,
      letterSpacing: "0.2em",
    });
    expect(customTheme.components?.MuiCard?.styleOverrides?.root).toMatchObject({
      border: "1px solid rgba(17, 34, 68, 0.2)",
      borderRadius: "10px",
      backgroundColor: "#fefefe",
    });
    expect(customTheme.components?.MuiOutlinedInput?.styleOverrides?.root).toMatchObject({
      borderRadius: "8px",
      "& .MuiOutlinedInput-notchedOutline": {
        borderColor: "rgba(17, 34, 68, 0.4)",
      },
      "&.Mui-focused": {
        outline: "3px solid rgba(18, 170, 119, 0.3)",
      },
    });
    expect(premiumButtonStyle["&:before"]).toMatchObject({
      background: "linear-gradient(45deg, #111111 30%, #222222 90%)",
    });
    expect(backButtonStyle).toMatchObject({
      color: "#ff5500",
      fontWeight: 700,
    });
  });
});
