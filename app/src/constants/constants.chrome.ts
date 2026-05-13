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
