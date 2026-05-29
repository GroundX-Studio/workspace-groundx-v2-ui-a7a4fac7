import Box from "@mui/material/Box";
import { alpha } from "@mui/material/styles";
import { useEffect, useRef, useState, type FC } from "react";

import {
  BORDER_RADIUS_PILL,
  CYAN,
  FONT_SIZE_CAPTION,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_HEADLINE,
  FONT_WEIGHT_LABEL,
  FONT_WEIGHT_MEDIUM,
  GREEN,
  NAVY,
  ONBOARDING_BADGE_FONT_SIZE,
  ONBOARDING_MICRO_FONT_SIZE,
  STEP_ANALYZE_BRACKET_RADIUS,
  STEP_BADGE_SIZE,
  TINT,
  WHITE,
} from "@/constants";

import type { AnalyzeSubstep, StepDescriptor, StepPillState, StepStripProps } from "./types";

/**
 * Step strip — implements the wireframe shape from
 * `spec-nav-v2.jsx Canvas_Ingest` (lines 100-174):
 *
 *   [1 Ingest]──[2 Understand]──┌─ ANALYZE ─────────────────┐──[4 Integrate]
 *                               │ Extract · Interact · …    │
 *                               └───────────────────────────┘
 *
 *   • Each primary step pill = circular number/check badge + label.
 *   • Active = green fill, navy border, navy badge with white number.
 *   • Done = tint fill, navy border, navy badge with ✓.
 *   • Todo = white fill, dim border + dim badge ring.
 *   • Analyze = dashed bracket with `ANALYZE` label notched in the top
 *     border; inside, three sub-pills (Extract / Interact / Report) with
 *     dashed borders.
 *
 * The bracket is the visual spine of the F-series journey; we render it on
 * every frame because the spec shows it from F1 onwards.
 */
const stepChipSx = (state: StepPillState) => {
  switch (state) {
    case "active":
      return {
        backgroundColor: GREEN,
        borderColor: NAVY,
        color: NAVY,
        fontWeight: FONT_WEIGHT_HEADLINE,
      };
    case "done-traversed":
      return {
        backgroundColor: TINT,
        borderColor: NAVY,
        color: NAVY,
        fontWeight: FONT_WEIGHT_LABEL,
      };
    case "disabled":
      return {
        backgroundColor: WHITE,
        borderColor: alpha(NAVY, 0.25),
        color: alpha(NAVY, 0.5),
        fontWeight: FONT_WEIGHT_MEDIUM,
        cursor: "not-allowed",
      };
    case "reachable-todo":
    default:
      return {
        backgroundColor: WHITE,
        borderColor: alpha(NAVY, 0.5),
        color: NAVY,
        fontWeight: FONT_WEIGHT_MEDIUM,
        "&:hover": { backgroundColor: alpha(NAVY, 0.04) },
      };
  }
};

const badgeSx = (state: StepPillState, _n: number | "check") => {
  const filled = state === "active" || state === "done-traversed";
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: STEP_BADGE_SIZE,
    height: STEP_BADGE_SIZE,
    borderRadius: BORDER_RADIUS_PILL,
    fontSize: ONBOARDING_BADGE_FONT_SIZE,
    fontWeight: FONT_WEIGHT_HEADLINE,
    backgroundColor: filled ? NAVY : "transparent",
    color: filled ? WHITE : alpha(NAVY, 0.4),
    border: filled ? "none" : `1px solid ${alpha(NAVY, 0.4)}`,
    marginRight: 2,
    flexShrink: 0,
  } as const;
};

const Pill: FC<{
  step: StepDescriptor;
  index: number;
  onClick?: (id: StepDescriptor["id"]) => void;
}> = ({ step, index, onClick }) => {
  const disabled = step.state === "disabled";
  const showCheck = step.state === "done-traversed";
  const interactive = !disabled && Boolean(onClick);
  return (
    <Box
      role="button"
      aria-current={step.state === "active" ? "step" : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      title={disabled ? "Available after sign-in" : undefined}
      onClick={interactive ? () => onClick!(step.id) : undefined}
      onKeyDown={(event) => {
        if (!interactive) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick!(step.id);
        }
      }}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0,
        // Trimmed 14 → 13 horizontal (~5% off, 2026-05-26) to drop the
        // strip's natural width just below the auto-compact threshold
        // at viewport 947 (header 767 px - container padding 32 px =
        // 735 px usable). Vertical 6 unchanged so the strip's row
        // height stays the same.
        padding: "6px 13px",
        borderRadius: BORDER_RADIUS_PILL,
        border: "1.5px solid",
        fontSize: FONT_SIZE_CAPTION,
        lineHeight: 1,
        outline: "none",
        userSelect: "none",
        cursor: interactive ? "pointer" : disabled ? "not-allowed" : "default",
        "&:focus-visible": { outline: `2px solid ${GREEN}`, outlineOffset: 2 },
        ...stepChipSx(step.state),
      }}
    >
      <Box component="span" sx={badgeSx(step.state, showCheck ? "check" : index)}>
        {showCheck ? "✓" : index}
      </Box>
      {step.label.replace(/^\d+\s*/, "") /* number is in the badge; show label only */}
    </Box>
  );
};

const SubPill: FC<{
  id: AnalyzeSubstep;
  label: string;
  state: StepPillState;
  onClick?: (id: AnalyzeSubstep) => void;
}> = ({ id, label, state, onClick }) => {
  const active = state === "active";
  const disabled = state === "disabled";
  // WF-01 C3 (2026-05-28). Sub-pills are role=button + keyboard-reachable
  // when their state allows navigation. Active is technically the current
  // surface but we still let the user click it (idempotent dispatch is
  // fine and keeps focus stable). Disabled = aria-disabled + tabindex=-1
  // + no handler so keyboard Tab + click both no-op.
  const interactive = !disabled && Boolean(onClick);
  return (
    <Box
      role={interactive || disabled ? "button" : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={interactive ? 0 : disabled ? -1 : undefined}
      title={disabled ? "Available after sign-in" : undefined}
      onClick={interactive ? () => onClick!(id) : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick!(id);
              }
            }
          : undefined
      }
      sx={{
        padding: "3px 12px",
        borderRadius: BORDER_RADIUS_PILL,
        border: `1.5px ${active ? "solid" : "dashed"} ${active ? NAVY : alpha(NAVY, 0.25)}`,
        backgroundColor: active ? GREEN : alpha(WHITE, 0.7),
        color: active ? NAVY : alpha(NAVY, 0.45),
        fontSize: FONT_SIZE_LABEL,
        fontWeight: active ? FONT_WEIGHT_HEADLINE : FONT_WEIGHT_MEDIUM,
        opacity: disabled ? 0.75 : 1,
        cursor: disabled ? "not-allowed" : interactive ? "pointer" : "default",
        outline: "none",
        "&:focus-visible": interactive
          ? { boxShadow: `0 0 0 2px ${alpha(NAVY, 0.4)}` }
          : undefined,
      }}
    >
      {label}
    </Box>
  );
};

/** Find the current step + its 1-based index for the compact progress bar. */
function findCurrent(steps: StepDescriptor[]): { current: StepDescriptor; n: number } | null {
  for (let i = 0; i < steps.length; i += 1) {
    if (steps[i].state === "active") return { current: steps[i], n: i + 1 };
  }
  return null;
}

const CompactStrip: FC<{ steps: StepDescriptor[] }> = ({ steps }) => {
  const found = findCurrent(steps);
  // Progress as a percentage; we count done + active vs total.
  const completed = steps.filter((s) => s.state === "done-traversed").length;
  const total = steps.length;
  const fillPct = ((completed + (found ? 0.5 : 0)) / total) * 100;
  return (
    // role/aria-label live on the outer StepStrip wrapper; this Box is
    // just the inner layout container for the compact progress bar.
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, py: 1.5 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: FONT_SIZE_LABEL,
          color: NAVY,
          fontWeight: FONT_WEIGHT_LABEL,
        }}
      >
        <Box component="span">
          Step {found?.n ?? 1} of {total}{" "}
          <Box component="span" sx={{ color: alpha(NAVY, 0.55), fontWeight: FONT_WEIGHT_MEDIUM, ml: 0.5 }}>
            · {found?.current.label.replace(/^\d+\s*/, "") ?? steps[0].label.replace(/^\d+\s*/, "")}
          </Box>
        </Box>
        <Box component="span" sx={{ fontSize: ONBOARDING_BADGE_FONT_SIZE, color: alpha(NAVY, 0.55), fontWeight: FONT_WEIGHT_MEDIUM }}>
          {completed}/{total} done
        </Box>
      </Box>
      <Box
        aria-hidden
        sx={{
          height: 4,
          width: "100%",
          borderRadius: BORDER_RADIUS_PILL,
          backgroundColor: alpha(NAVY, 0.1),
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            height: "100%",
            width: `${fillPct}%`,
            backgroundColor: GREEN,
            transition: "width 200ms ease",
          }}
        />
      </Box>
    </Box>
  );
};

/**
 * Container-width threshold below which the strip falls back to the
 * compact progress bar.
 *
 * Set to 660 (2026-05-26 pass-2) — the strip lives in a header slot
 * spanning chat + canvas, and after the ~5% chrome trim its natural
 * width is ~675px. 660 gives a small buffer so the strip stays full
 * down to canvas+chat widths around 660px. Below that we fall back
 * to the compact progress bar; below md (900 px viewport) the
 * AppShell compact mode also forces compact via the `compact` prop.
 */
export const STEP_STRIP_CONTAINER_COMPACT_THRESHOLD = 660;

/**
 * Internal full pill strip — the `[1 Ingest]──[2 Understand]──┌ANALYZE…┐──[4 Integrate]`
 * layout. Lives behind StepStrip's container-aware compact switch.
 */
const FullStrip: FC<{
  steps: StepDescriptor[];
  onStepClick?: StepStripProps["onStepClick"];
  onSubstepClick?: StepStripProps["onSubstepClick"];
}> = ({ steps, onStepClick, onSubstepClick }) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 0,
      py: 2,
      // Pinned `nowrap` so the four primary pills + ANALYZE compound
      // stay on a single horizontal row. `overflow-x: auto` is the
      // graceful degradation — very narrow viewports get a horizontal
      // scroll rather than a wrap. We hide the scrollbar UI to avoid
      // an inconsistent 15px gutter on Chrome at narrow widths; the
      // strip is still scrollable by touch/wheel. (Now that the strip
      // is hosted in a header slot spanning both chat + canvas — see
      // OnboardingShell — the strip has the full right-of-nav row to
      // work with, so the scroll fallback should rarely fire.)
      flexWrap: "nowrap",
      overflowX: "auto",
      scrollbarWidth: "none",
      "&::-webkit-scrollbar": { display: "none" },
    }}
  >
    {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;
        // Number the step badge based on position in the spec order
        // (Ingest=1, Understand=2, Analyze=no badge / bracket, Integrate=4).
        const stepNumber = step.id === "ingest" ? 1 : step.id === "understand" ? 2 : step.id === "integrate" ? 4 : 0;
        const isAnalyze = step.id === "analyze";

        return (
          <Box key={step.id} sx={{ display: "inline-flex", alignItems: "center" }}>
            {isAnalyze ? (
              <Box
                role="group"
                aria-label="Analyze substeps"
                sx={{
                  position: "relative",
                  // ~5% horizontal trim 2026-05-26 (was "14px 14px 6px").
                  padding: "13px 13px 6px",
                  border: `1.5px dashed ${alpha(NAVY, 0.4)}`,
                  borderRadius: STEP_ANALYZE_BRACKET_RADIUS,
                  backgroundColor: alpha(CYAN, 0.18),
                  display: "inline-flex",
                  gap: 0.5,
                  alignItems: "center",
                }}
              >
                {/* "ANALYZE" label notched on the top edge of the bracket. */}
                <Box
                  sx={{
                    position: "absolute",
                    top: -8,
                    left: 12,
                    px: 1,
                    backgroundColor: WHITE,
                    fontSize: ONBOARDING_MICRO_FONT_SIZE,
                    fontWeight: FONT_WEIGHT_HEADLINE,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: NAVY,
                  }}
                >
                  ANALYZE
                </Box>
                {step.substeps?.map((s) => (
                  <SubPill
                    key={s.id}
                    id={s.id}
                    label={s.label}
                    state={s.state}
                    onClick={onSubstepClick}
                  />
                ))}
              </Box>
            ) : (
              <Pill step={step} index={stepNumber} onClick={onStepClick} />
            )}
            {!isLast ? (
              <Box
                aria-hidden
                sx={{
                  // Connector trimmed 18 → 16, margin mx 1 → 0.75 to
                  // claw back ~10px across the strip's three gaps.
                  width: 16,
                  height: 1.5,
                  mx: 0.75,
                  backgroundColor: alpha(NAVY, 0.2),
                }}
              />
            ) : null}
          </Box>
        );
      })}
  </Box>
);

export const StepStrip: FC<StepStripProps> = ({ steps, onStepClick, onSubstepClick, compact = false }) => {
  // Container-aware fallback to compact mode. We measure the outer
  // wrapper's own bounding box (which always fills the parent's
  // available width) and switch to compact when it dips below the
  // threshold. The full pill strip clips ugly at narrower widths
  // because the ANALYZE compound + connectors + Integrate pill can't
  // fit. The wrapper is rendered unconditionally so the observer's
  // target stays stable across mode switches (otherwise the observer
  // tears down when the inner content changes and never re-attaches).
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [autoCompact, setAutoCompact] = useState(false);
  useEffect(() => {
    if (compact) {
      setAutoCompact(false);
      return;
    }
    const el = wrapperRef.current;
    if (!el) return;
    // SSR / jsdom-less environments: ResizeObserver may be missing.
    // Without an observer we fall through to the full strip (degraded
    // but not broken).
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setAutoCompact(entry.contentRect.width < STEP_STRIP_CONTAINER_COMPACT_THRESHOLD);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [compact]);

  const effectiveCompact = compact || autoCompact;
  return (
    <Box
      ref={wrapperRef}
      role="group"
      aria-label="Onboarding journey step strip"
      data-testid="step-strip-wrapper"
      sx={{ width: "100%" }}
    >
      {effectiveCompact ? (
        <CompactStrip steps={steps} />
      ) : (
        <FullStrip steps={steps} onStepClick={onStepClick} onSubstepClick={onSubstepClick} />
      )}
    </Box>
  );
};
