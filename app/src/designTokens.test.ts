import { describe, expect, it } from "vitest";

import {
  BODY_ON_DARK,
  BODY_ON_LIGHT,
  EYEBROW_ON_DARK,
  EYEBROW_ON_LIGHT,
  FOCUS_RING,
  FONT_FAMILY_MARKETING,
  FONT_SIZE_DISPLAY_LG,
  FONT_SIZE_DISPLAY_MD,
  FONT_SIZE_LABEL_DENSE,
  INPUT_BORDER,
  MUTED_ON_DARK,
  MUTED_ON_LIGHT,
  SPACING_WEBFLOW_SPACE_10,
  SPACING_WEBFLOW_SPACE_12,
  SPACING_WEBFLOW_SPACE_16,
  SPACING_WEBFLOW_SPACE_2,
  SPACING_WEBFLOW_SPACE_3,
  SPACING_WEBFLOW_SPACE_4,
  SPACING_WEBFLOW_SPACE_5,
  SPACING_WEBFLOW_SPACE_6,
  SPACING_WEBFLOW_SPACE_8,
} from "@/constants";
import { DEFAULT_DESIGN_CONFIG } from "@/designConfig";
import theme from "@/theme";

const getCssBaselineBodyStyle = () =>
  (theme.components?.MuiCssBaseline?.styleOverrides as { body?: Record<string, unknown> })?.body;

describe("design token integration", () => {
  it("exposes the generated surface, form, marketing, and Webflow token groups through the scaffold barrel", () => {
    expect({
      EYEBROW_ON_LIGHT,
      EYEBROW_ON_DARK,
      BODY_ON_LIGHT,
      BODY_ON_DARK,
      MUTED_ON_LIGHT,
      MUTED_ON_DARK,
      INPUT_BORDER,
      FOCUS_RING,
      FONT_FAMILY_MARKETING,
      FONT_SIZE_DISPLAY_LG,
      FONT_SIZE_DISPLAY_MD,
      FONT_SIZE_LABEL_DENSE,
      SPACING_WEBFLOW_SPACE_2,
      SPACING_WEBFLOW_SPACE_3,
      SPACING_WEBFLOW_SPACE_4,
      SPACING_WEBFLOW_SPACE_5,
      SPACING_WEBFLOW_SPACE_6,
      SPACING_WEBFLOW_SPACE_8,
      SPACING_WEBFLOW_SPACE_10,
      SPACING_WEBFLOW_SPACE_12,
      SPACING_WEBFLOW_SPACE_16,
    }).toEqual({
      EYEBROW_ON_LIGHT: "#f3663f",
      EYEBROW_ON_DARK: "#a1ec83",
      BODY_ON_LIGHT: "#40496b",
      BODY_ON_DARK: "rgba(255, 255, 255, 0.82)",
      MUTED_ON_LIGHT: "rgba(64, 73, 107, 0.7)",
      MUTED_ON_DARK: "rgba(255, 255, 255, 0.65)",
      INPUT_BORDER: "rgba(41, 51, 92, 0.2)",
      FOCUS_RING: "rgba(161, 236, 131, 0.25)",
      FONT_FAMILY_MARKETING: "'Thicccboi', sans-serif",
      FONT_SIZE_DISPLAY_LG: "4rem",
      FONT_SIZE_DISPLAY_MD: "3.375rem",
      FONT_SIZE_LABEL_DENSE: "0.7rem",
      SPACING_WEBFLOW_SPACE_2: "7px",
      SPACING_WEBFLOW_SPACE_3: "14px",
      SPACING_WEBFLOW_SPACE_4: "20px",
      SPACING_WEBFLOW_SPACE_5: "24px",
      SPACING_WEBFLOW_SPACE_6: "28px",
      SPACING_WEBFLOW_SPACE_8: "36px",
      SPACING_WEBFLOW_SPACE_10: "56px",
      SPACING_WEBFLOW_SPACE_12: "84px",
      SPACING_WEBFLOW_SPACE_16: "112px",
    });
  });

  it("keeps generated form and typography tokens flowing into designConfig and MUI theme defaults", () => {
    expect(DEFAULT_DESIGN_CONFIG.colors.inputBorder).toBe(INPUT_BORDER);
    expect(DEFAULT_DESIGN_CONFIG.colors.focusRing).toBe(FOCUS_RING);
    expect(DEFAULT_DESIGN_CONFIG.colors.eyebrowOnLight).toBe(EYEBROW_ON_LIGHT);
    expect(DEFAULT_DESIGN_CONFIG.typography.marketingFontFamily).toBe(FONT_FAMILY_MARKETING);
    expect(DEFAULT_DESIGN_CONFIG.typography.fontSize.displayLg).toBe(FONT_SIZE_DISPLAY_LG);
    expect(DEFAULT_DESIGN_CONFIG.typography.fontSize.labelDense).toBe(FONT_SIZE_LABEL_DENSE);

    expect(getCssBaselineBodyStyle()).toMatchObject({
      fontFeatureSettings: DEFAULT_DESIGN_CONFIG.typography.fontFeatureSettings,
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
});
