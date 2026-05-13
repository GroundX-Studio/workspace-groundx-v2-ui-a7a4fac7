/**
 * GroundX web UI constants barrel.
 *
 * Once this folder lives at `src/constants/` in the consuming project, every
 * call site imports from a single namespace: `import { NAVY, PADDING, ... }
 * from "@/constants"` (the alias) or `from "../../constants"` (the relative
 * form components use). This barrel re-exports two concerns from two files:
 *
 *   constants.generated.ts  — brand tokens, auto-generated from
 *                             ../../eyelevel-design-standards/tokens.json.
 *                             NEVER EDIT BY HAND — re-run
 *                             `node scripts/generate-mirrors.mjs` in the
 *                             standards skill and the diff lands here.
 *                             Identical across every project.
 *
 *   constants.chrome.ts     — project-specific chrome tokens that are not
 *                             part of the shared brand palette. The
 *                             app-shell versions often hold drawerWidth,
 *                             NAV_ICON_GREY, the premium-button gradient,
 *                             etc.; another project's version may hold
 *                             different chrome (max content widths, footer
 *                             column counts) — or be empty. Each project
 *                             owns its own. Safe to edit.
 *
 * If you need a NEW brand value (a color, a weight, a radius), add it to
 * tokens.json in the standards skill and regenerate. Do not add it here.
 */

export * from "./constants.generated";
export * from "./constants.chrome";
