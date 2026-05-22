import Box from "@mui/material/Box";
import { alpha } from "@mui/material/styles";
import type { FC } from "react";

import {
  BORDER_RADIUS_PILL,
  CYAN,
  GREEN,
  NAVY,
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
        fontWeight: 700,
      };
    case "done-traversed":
      return {
        backgroundColor: TINT,
        borderColor: NAVY,
        color: NAVY,
        fontWeight: 600,
      };
    case "disabled":
      return {
        backgroundColor: WHITE,
        borderColor: alpha(NAVY, 0.25),
        color: alpha(NAVY, 0.5),
        fontWeight: 500,
        cursor: "not-allowed",
      };
    case "reachable-todo":
    default:
      return {
        backgroundColor: WHITE,
        borderColor: alpha(NAVY, 0.5),
        color: NAVY,
        fontWeight: 500,
        "&:hover": { backgroundColor: alpha(NAVY, 0.04) },
      };
  }
};

const badgeSx = (state: StepPillState, n: number | "check") => {
  const filled = state === "active" || state === "done-traversed";
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 20,
    borderRadius: BORDER_RADIUS_PILL,
    fontSize: 11,
    fontWeight: 700,
    backgroundColor: filled ? NAVY : "transparent",
    color: filled ? WHITE : alpha(NAVY, 0.4),
    border: filled ? "none" : `1px solid ${alpha(NAVY, 0.4)}`,
    marginRight: 6,
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
        fontSize: 13,
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
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        opacity: disabled ? 0.75 : 1,
        cursor: disabled ? "not-allowed" : "default",
      }}
    >
      {label}
    </Box>
  );
};

export const StepStrip: FC<StepStripProps> = ({ steps, onStepClick }) => {
  return (
    <Box
      role="group"
      aria-label="Onboarding journey step strip"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        py: 2,
        flexWrap: "wrap",
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
                  borderRadius: 14,
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
                    fontSize: 10,
                    fontWeight: 700,
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
};
