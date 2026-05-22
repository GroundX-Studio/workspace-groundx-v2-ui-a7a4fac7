import CheckIcon from "@mui/icons-material/Check";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import { alpha, useTheme } from "@mui/material/styles";
import type { FC } from "react";

import { BORDER, CYAN, DARK_GREY, GREEN, NAVY } from "@/constants";

import type { StepDescriptor, StepPillState, StepStripProps } from "./types";

const stateChipSx = (state: StepPillState, theme: ReturnType<typeof useTheme>) => {
  switch (state) {
    case "active":
      return {
        backgroundColor: GREEN,
        color: NAVY,
        fontWeight: 600,
        "&:hover": { backgroundColor: GREEN },
      };
    case "done-traversed":
      return {
        backgroundColor: alpha(GREEN, 0.18),
        color: NAVY,
        fontWeight: 600,
        "& .MuiChip-icon": { color: NAVY },
      };
    case "disabled":
      return {
        backgroundColor: "transparent",
        color: DARK_GREY,
        border: `1px dashed ${BORDER}`,
        cursor: "not-allowed",
      };
    case "reachable-todo":
    default:
      return {
        backgroundColor: "transparent",
        color: NAVY,
        border: `1px solid ${NAVY}`,
        "&:hover": { backgroundColor: alpha(NAVY, 0.04) },
      };
  }
};

const Pill: FC<{
  step: StepDescriptor;
  onClick?: (id: StepDescriptor["id"]) => void;
}> = ({ step, onClick }) => {
  const theme = useTheme();
  const disabled = step.state === "disabled";
  return (
    <Chip
      label={step.label}
      icon={step.state === "done-traversed" ? <CheckIcon fontSize="small" /> : undefined}
      onClick={disabled ? undefined : onClick ? () => onClick(step.id) : undefined}
      clickable={!disabled}
      aria-current={step.state === "active" ? "step" : undefined}
      aria-disabled={disabled || undefined}
      title={disabled ? "Available after sign-in" : undefined}
      sx={{
        height: 32,
        borderRadius: 100,
        px: 0.5,
        ...stateChipSx(step.state, theme),
      }}
    />
  );
};

export const StepStrip: FC<StepStripProps> = ({ steps, onStepClick }) => {
  const analyze = steps.find((s) => s.id === "analyze");
  return (
    <Box
      role="group"
      aria-label="Onboarding journey step strip"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        py: 1.5,
        px: 2,
        flexWrap: "wrap",
      }}
    >
      {steps.map((step, index) => (
        <Box key={step.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Pill step={step} onClick={onStepClick} />
          {step.id === "analyze" && step.state === "active" && step.substeps?.length ? (
            <Box
              role="list"
              aria-label="Analyze substeps"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                px: 1,
                py: 0.5,
                borderRadius: 100,
                border: `1px dashed ${CYAN}`,
              }}
            >
              {step.substeps.map((substep) => (
                <Chip
                  key={substep.id}
                  role="listitem"
                  label={substep.label}
                  size="small"
                  sx={{
                    height: 24,
                    fontSize: 12,
                    backgroundColor: substep.state === "active" ? GREEN : "transparent",
                    color: substep.state === "disabled" ? DARK_GREY : NAVY,
                    border: substep.state === "reachable-todo" ? `1px solid ${NAVY}` : "none",
                  }}
                />
              ))}
            </Box>
          ) : null}
          {index < steps.length - 1 ? (
            <Box aria-hidden sx={{ width: 18, height: 1, backgroundColor: BORDER }} />
          ) : null}
        </Box>
      ))}
      {/* analyze fallback to suppress unused warning */}
      {analyze ? null : null}
    </Box>
  );
};
