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

import type { StepDescriptor, StepPillState, StepStripProps } from "./types";

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
        padding: "6px 14px",
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

const SubPill: FC<{ id: string; label: string; state: StepPillState }> = ({ label, state }) => {
  const active = state === "active";
  const disabled = state === "disabled";
  return (
    <Box
      title={disabled ? "Available after sign-in" : undefined}
      sx={{
        padding: "3px 12px",
        borderRadius: BORDER_RADIUS_PILL,
        border: `1.5px ${active ? "solid" : "dashed"} ${active ? NAVY : alpha(NAVY, 0.25)}`,
        backgroundColor: active ? GREEN : alpha(WHITE, 0.7),
        color: active ? NAVY : alpha(NAVY, 0.45),
        fontSize: FONT_SIZE_LABEL,
        fontWeight: active ? FONT_WEIGHT_HEADLINE : FONT_WEIGHT_MEDIUM,
        opacity: disabled ? 0.75 : 1,
        cursor: disabled ? "not-allowed" : "default",
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
 * Container-width threshold below which the full pill strip can't fit
 * its natural ~711px content. Below this, the strip auto-switches to
 * the compact "Step X of Y" progress bar — independent of the
 * viewport-based `compact` prop. This handles the case where the
 * viewport itself is wide (e.g. 1200px) but the strip's container is
 * narrow because the chat pane is eating most of the row's width.
 */
export const STEP_STRIP_CONTAINER_COMPACT_THRESHOLD = 720;

/**
 * Internal full pill strip — the `[1 Ingest]──[2 Understand]──┌ANALYZE…┐──[4 Integrate]`
 * layout. Lives behind StepStrip's container-aware compact switch.
 */
const FullStrip: FC<{ steps: StepDescriptor[]; onStepClick?: StepStripProps["onStepClick"] }> = ({
  steps,
  onStepClick,
}) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 0,
      py: 2,
      // Pinned `nowrap` so the four primary pills + ANALYZE compound
      // always stay on a single horizontal row. The strip's content
      // sums to ~711px at the design width, and a fraction-of-a-pixel
      // narrower used to drop Integrate to a second row mid-render
      // (caught in Chrome at 1305px on a 1306px design). `overflow-x:
      // auto` is the graceful degradation — very narrow viewports
      // get a horizontal scroll rather than a wrap. We hide the
      // scrollbar UI to avoid an inconsistent 15px gutter on Chrome
      // at narrow widths; the strip is still scrollable by touch/wheel.
      flexWrap: "nowrap",
      overflowX: "auto",
      scrollbarWidth: "none",
      "&::-webkit-scrollbar": { display: "none" },
      // No horizontal padding on the strip itself — the parent container
      // controls page padding so the strip always aligns flush with the
      // hero copy and sample-card grid below it.
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
                  padding: "14px 14px 6px",
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
                  <SubPill key={s.id} id={s.id} label={s.label} state={s.state} />
                ))}
              </Box>
            ) : (
              <Pill step={step} index={stepNumber} onClick={onStepClick} />
            )}
            {!isLast ? (
              <Box
                aria-hidden
                sx={{
                  width: 18,
                  height: 1.5,
                  mx: 1,
                  backgroundColor: alpha(NAVY, 0.2),
                }}
              />
            ) : null}
          </Box>
        );
      })}
  </Box>
);

export const StepStrip: FC<StepStripProps> = ({ steps, onStepClick, compact = false }) => {
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
        <FullStrip steps={steps} onStepClick={onStepClick} />
      )}
    </Box>
  );
};
