/**
 * StepStrip (W2) — the bracketed four-step journey pinned above the workspace.
 *
 * Ingest · Understand · [ ANALYZE: Extract / Interact / Report ] · Integrate.
 * Done stages show a check, the active stage is a filled green pill, pending
 * stages are muted outlines. The three ANALYZE doors share a dashed bracket.
 */

import CheckIcon from "@mui/icons-material/Check";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import {
  BORDER,
  BORDER_RADIUS_PILL,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_LABEL,
  GREEN,
  INPUT_BORDER,
  LETTER_SPACING_LABEL,
  MUTED_ON_LIGHT,
  NAVY,
  WHITE,
} from "@/constants";

import { PHASE_ORDER, STEP_STRIP, StepStripStage } from "../flow/flowData";
import { FlowPhase } from "../flow/flowTypes";

type StageStatus = "done" | "active" | "pending";

const statusFor = (phase: FlowPhase, activePhase: FlowPhase): StageStatus => {
  const a = PHASE_ORDER.indexOf(activePhase);
  const p = PHASE_ORDER.indexOf(phase);
  if (p < a) return "done";
  if (p === a) return "active";
  return "pending";
};

const StatusDot = ({ status, badge }: { status: StageStatus; badge?: string }) => {
  const filled = status !== "pending";
  return (
    <Box
      sx={{
        width: 22,
        height: 22,
        flexShrink: 0,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 700,
        backgroundColor: filled ? GREEN : WHITE,
        color: filled ? NAVY : MUTED_ON_LIGHT,
        border: filled ? "1px solid transparent" : `1px solid ${INPUT_BORDER}`,
      }}
    >
      {status === "done" ? <CheckIcon sx={{ fontSize: 14 }} /> : badge ?? ""}
    </Box>
  );
};

const Stage = ({ stage, status }: { stage: StepStripStage; status: StageStatus }) => {
  const active = status === "active";
  return (
    <Stack
      direction="row"
      spacing={0.75}
      alignItems="center"
      sx={{
        px: 1,
        py: 0.5,
        borderRadius: BORDER_RADIUS_PILL,
        backgroundColor: active ? GREEN : "transparent",
        border: active ? "1px solid transparent" : `1px solid ${BORDER}`,
      }}
    >
      <StatusDot status={status} badge={stage.badge} />
      <Typography
        sx={{
          fontSize: FONT_SIZE_LABEL,
          fontWeight: FONT_WEIGHT_LABEL,
          color: status === "pending" ? MUTED_ON_LIGHT : NAVY,
          whiteSpace: "nowrap",
        }}
      >
        {stage.label}
      </Typography>
    </Stack>
  );
};

const Connector = () => <Box sx={{ width: 18, height: 1, backgroundColor: INPUT_BORDER, flexShrink: 0 }} />;

export interface StepStripProps {
  activePhase: FlowPhase;
}

export function StepStrip({ activePhase }: StepStripProps) {
  const analyze = STEP_STRIP.filter((s) => s.group === "analyze");
  const analyzeActive = analyze.some((s) => s.phase === activePhase);

  // Look stages up by phase so the layout doesn't silently break if STEP_STRIP is reordered.
  const stageFor = (phase: FlowPhase) => STEP_STRIP.find((s) => s.phase === phase)!;
  const ingest = stageFor("ingest");
  const understand = stageFor("understand");
  const integrate = stageFor("integrate");

  return (
    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 1 }}>
      <Stage stage={ingest} status={statusFor(ingest.phase, activePhase)} />
      <Connector />
      <Stage stage={understand} status={statusFor(understand.phase, activePhase)} />
      <Connector />

      {/* ANALYZE bracket */}
      <Box
        sx={{
          position: "relative",
          px: 1,
          pt: 1.25,
          pb: 0.5,
          borderRadius: 2,
          border: `1px dashed ${analyzeActive ? GREEN : INPUT_BORDER}`,
        }}
      >
        <Typography
          sx={{
            position: "absolute",
            top: -9,
            left: 12,
            px: 0.5,
            backgroundColor: WHITE,
            fontSize: 10,
            fontWeight: FONT_WEIGHT_LABEL,
            letterSpacing: LETTER_SPACING_LABEL,
            color: MUTED_ON_LIGHT,
          }}
        >
          ANALYZE
        </Typography>
        <Stack direction="row" spacing={0.5} alignItems="center">
          {analyze.map((stage, idx) => (
            <Stack key={stage.phase} direction="row" spacing={0.5} alignItems="center">
              {idx > 0 ? <Connector /> : null}
              <Stage stage={stage} status={statusFor(stage.phase, activePhase)} />
            </Stack>
          ))}
        </Stack>
      </Box>

      <Connector />
      <Stage stage={integrate} status={statusFor(integrate.phase, activePhase)} />
    </Stack>
  );
}

export default StepStrip;
