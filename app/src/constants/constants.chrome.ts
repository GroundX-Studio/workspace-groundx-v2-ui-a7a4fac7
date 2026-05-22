/**
 * GroundX web UI chrome tokens — hand-written, project-specific.
 *
 * These values are *not* part of the brand palette and don't belong in the
 * shared design-system source of truth (tokens.json). They live here per
 * project because what counts as "chrome" varies between projects.
 *
 * What this file often holds for authenticated product app shells:
 *   • drawerWidth — sidebar width
 *   • NAV_ICON_GREY, DISABLED_GREY, ROW_SELECTED_BG, WARNING_AMBER — chrome states
 *   • PREMIUM_GRADIENT_FROM/TO — premium-tier upsell button gradient
 *   • TRANSPARENT — convenience constant
 *
 * What another project's `constants.chrome.ts` might hold:
 *   • A marketing site: a MAX_CONTENT_WIDTH, a FOOTER_COLUMN_COUNT, or
 *     nothing at all (chrome lives entirely in inline `sx` against brand
 *     tokens).
 *   • An internal tool: its own sidebar/drawer width, its own admin-state
 *     colors, etc.
 *   • A new product UI: whatever its chrome needs.
 *
 * The rule: if a value is only meaningful inside this project, it belongs
 * here. If it crosses projects (or crosses mediums into slides), promote it
 * to the standards skill's tokens.json.
 */

// ──────────────────────────────────────────────────────────────────────────
// Layout measurements
// ──────────────────────────────────────────────────────────────────────────

/** Width of the left sidebar drawer when fully expanded. */
export const drawerWidth = 270;

/** Main content-pane background — the fill behind all cards in the authenticated shell. */
export const MAIN_BACKGROUND = "#eef7f9";

// ──────────────────────────────────────────────────────────────────────────
// Utility colors (not brand palette)
// ──────────────────────────────────────────────────────────────────────────

/** CSS `transparent` keyword, surfaced as a named constant for clarity. */
export const TRANSPARENT = "transparent";

/** Inactive nav icon — sidebar icons for non-current routes. */
export const NAV_ICON_GREY = "#5a5a5b";

/** Disabled surface — inert table chips, disabled-input backgrounds. */
export const DISABLED_GREY = "#e8eaee";

/** Row highlight background for selected table rows. */
export const ROW_SELECTED_BG = "rgba(79, 53, 197, 0.1)";

/** Warning-amber fill — in-progress pill states (e.g., ingest processing). */
export const WARNING_AMBER = "#ffb45c";

/** Translucent white track for progress bars on dark surfaces (used by GxUsageCard). */
export const PROGRESS_TRACK_ON_DARK = "rgba(255, 255, 255, 0.15)";

// ──────────────────────────────────────────────────────────────────────────
// Premium button gradient (used only by the `gx-premium-button` variant)
// ──────────────────────────────────────────────────────────────────────────

export const PREMIUM_GRADIENT_FROM = "#fe6b8b";
export const PREMIUM_GRADIENT_TO = "#ff8e53";

// ──────────────────────────────────────────────────────────────────────────
// Onboarding F-series tokens (project-specific; not in tokens.json because
// the F-series flow is unique to this product UI)
// ──────────────────────────────────────────────────────────────────────────

/** F1 hero headline — Thicccboi, 34px. */
export const ONBOARDING_HERO_FONT_SIZE = "2.125rem";

/** Tile titles in BYO row (Upload files / Connect a source / Email it in). */
export const ONBOARDING_TILE_TITLE_FONT_SIZE = "1.0625rem";

/** F-series small body copy — coral demonstrates line, privacy footer, capability legend, BYO sub. */
export const ONBOARDING_SMALL_TEXT_FONT_SIZE = "0.71875rem";

/** Sample / BYO card chrome dimensions. */
export const SAMPLE_CARD_MIN_HEIGHT = 140;
export const BYO_TILE_HEIGHT = 134;

/** Step strip number badge size. */
export const STEP_BADGE_SIZE = 20;

/** Capability badge (E / I / R) — default size used inside sample cards. */
export const CAPABILITY_BADGE_SIZE = 20;

/** Capability badge — smaller variant used in the legend row. */
export const CAPABILITY_BADGE_SIZE_SM = 16;

/** Picker container — desktop and ultrawide max widths. */
export const PICKER_MAX_WIDTH = 1200;
export const PICKER_MAX_WIDTH_ULTRAWIDE = 1320;

/** F1 sample/BYO max width on bottom-sheet gate drawer body. */
export const GATE_MAX_WIDTH = 460;

/** Bottom-sheet gate drawer — max height as a viewport ratio. */
export const GATE_DRAWER_MAX_HEIGHT = "90vh";

/**
 * Step strip ANALYZE bracket — radius is between BORDER_RADIUS (6px) and
 * BORDER_RADIUS_2X (12px); the spec wants something rounder than the
 * step pills it contains but not as soft as a card.
 */
export const STEP_ANALYZE_BRACKET_RADIUS = 14;

/** F-series micro chrome — for tiny inline labels (Analyze label, doc-count badge). */
export const ONBOARDING_MICRO_FONT_SIZE = 10;

/** F-series badge text — for the step-strip number badge + compact-strip done count. */
export const ONBOARDING_BADGE_FONT_SIZE = 11;

/** Inline icon size — LockOutlinedIcon and similar chrome icons paired with text. */
export const ICON_SIZE_INLINE = 14;

/**
 * MUI's brand tokens cover 400 / 600 / 700 / 800 weights. 500 is a useful
 * "medium" between body and label; the step strip's reachable-todo + disabled
 * states use it for a slightly softer feel than full label weight.
 */
export const FONT_WEIGHT_MEDIUM = 500;
