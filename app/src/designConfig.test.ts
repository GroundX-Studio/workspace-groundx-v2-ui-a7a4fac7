import { describe, expect, it } from "vitest";

import {
  BODY_ON_DARK,
  BODY_ON_LIGHT,
  BLUE,
  ERROR_RED,
  EYEBROW_ON_DARK,
  EYEBROW_ON_LIGHT,
  FOCUS_RING,
  FONT_FAMILY_MARKETING,
  FONT_SIZE_DISPLAY_LG,
  FONT_SIZE_DISPLAY_MD,
  FONT_SIZE_LABEL_DENSE,
  GREEN,
  INPUT_BORDER,
  MUTED_ON_DARK,
  MUTED_ON_LIGHT,
  NAVY,
} from "@/constants";
import { createDesignConfig, DEFAULT_DESIGN_CONFIG, DESIGN_CONFIG } from "@/designConfig";

describe("designConfig", () => {
  it("uses generated design tokens as the default source of truth", () => {
    expect(DESIGN_CONFIG).toEqual(DEFAULT_DESIGN_CONFIG);
    expect(DESIGN_CONFIG.colors.green).toBe(GREEN);
    expect(DESIGN_CONFIG.colors.navy).toBe(NAVY);
    expect(DESIGN_CONFIG.colors.errorRed).toBe(ERROR_RED);
    expect(DESIGN_CONFIG.colors.blue).toBe(BLUE);
    expect(DESIGN_CONFIG.colors.eyebrowOnLight).toBe(EYEBROW_ON_LIGHT);
    expect(DESIGN_CONFIG.colors.eyebrowOnDark).toBe(EYEBROW_ON_DARK);
    expect(DESIGN_CONFIG.colors.bodyOnLight).toBe(BODY_ON_LIGHT);
    expect(DESIGN_CONFIG.colors.bodyOnDark).toBe(BODY_ON_DARK);
    expect(DESIGN_CONFIG.colors.mutedOnLight).toBe(MUTED_ON_LIGHT);
    expect(DESIGN_CONFIG.colors.mutedOnDark).toBe(MUTED_ON_DARK);
    expect(DESIGN_CONFIG.colors.inputBorder).toBe(INPUT_BORDER);
    expect(DESIGN_CONFIG.colors.focusRing).toBe(FOCUS_RING);
    expect(DESIGN_CONFIG.typography.marketingFontFamily).toBe(FONT_FAMILY_MARKETING);
    expect(DESIGN_CONFIG.typography.fontSize.displayLg).toBe(FONT_SIZE_DISPLAY_LG);
    expect(DESIGN_CONFIG.typography.fontSize.displayMd).toBe(FONT_SIZE_DISPLAY_MD);
    expect(DESIGN_CONFIG.typography.fontSize.labelDense).toBe(FONT_SIZE_LABEL_DENSE);
  });

  it("allows a local app to override theme-level design values", () => {
    const config = createDesignConfig({
      colors: {
        green: "#12aa77",
      },
      typography: {
        fontFamily: "\"Example Sans\", sans-serif",
      },
      breakpoints: {
        md: 960,
      },
    });

    expect(config.colors.green).toBe("#12aa77");
    expect(config.colors.navy).toBe(DEFAULT_DESIGN_CONFIG.colors.navy);
    expect(config.typography.fontFamily).toBe("\"Example Sans\", sans-serif");
    expect(config.breakpoints.md).toBe(960);
    expect(config.breakpoints.lg).toBe(DEFAULT_DESIGN_CONFIG.breakpoints.lg);
  });

  it("allows nested overrides without replacing sibling typography tokens", () => {
    const config = createDesignConfig({
      typography: {
        fontSize: {
          h1: "3rem",
        },
      },
    });

    expect(config.typography.fontSize.h1).toBe("3rem");
    expect(config.typography.fontSize.body).toBe(DEFAULT_DESIGN_CONFIG.typography.fontSize.body);
    expect(config.typography.weights.headline).toBe(DEFAULT_DESIGN_CONFIG.typography.weights.headline);
  });
});
