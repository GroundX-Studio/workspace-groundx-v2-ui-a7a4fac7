/**
 * Canvas — the right pane of the split. Renders docs, extractions, reports, and
 * briefs; "the thing that changes when you click a doc, pin a sample, or render
 * a template."
 *
 * Foundation slice: a document-render placeholder with one highlighted (cited)
 * region, plus an Understand-phase processing banner. Real page navigation,
 * field provenance, and Results tabs land in F3+.
 */

import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha, keyframes } from "@mui/material/styles";

import {
  BORDER,
  BORDER_RADIUS,
  BORDER_RADIUS_PILL,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_LABEL,
  GRAY,
  GREEN,
  INPUT_BORDER,
  LETTER_SPACING_LABEL,
  MAIN_BACKGROUND,
  MUTED_ON_LIGHT,
  NAVY,
  WARNING_AMBER,
  WHITE,
} from "@/constants";

import { onEnterOrSpace } from "@/shared/utils/onEnterOrSpace";

import { FlowPhase, SampleProject } from "../flow/flowTypes";

const scanSweep = keyframes`
  0% { top: 8%; opacity: 0.35; }
  50% { top: 60%; opacity: 1; }
  100% { top: 92%; opacity: 0.35; }
`;

const DocLine = ({ width, highlighted = false }: { width: string; highlighted?: boolean }) => (
  <Box
    sx={{
      height: 10,
      width,
      borderRadius: 1,
      backgroundColor: highlighted ? alpha(GREEN, 0.45) : GRAY,
      border: highlighted ? `1px solid ${GREEN}` : "1px solid transparent",
    }}
  />
);

export interface CanvasProps {
  sample: SampleProject | null;
  phase: FlowPhase;
  onSwitchSample?: () => void;
}

export function Canvas({ sample, phase, onSwitchSample }: CanvasProps) {
  const understanding = phase === "understand";
  const docName = sample ? `${sample.name.toLowerCase().replace(/\s+/g, "-")}.pdf` : "document.pdf";

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", backgroundColor: MAIN_BACKGROUND, minWidth: 0 }}>
      {/* Canvas header: title + sample switcher */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{ px: 2.5, py: 1.5, borderBottom: `1px solid ${BORDER}`, backgroundColor: WHITE }}
      >
        <Typography sx={{ flex: 1, fontWeight: 700, color: NAVY, fontSize: 16, minWidth: 0 }} noWrap>
          {sample ? sample.name : "Workspace"}
        </Typography>
        {sample ? (
          // TODO(F3+): this should open a sample picker. In the foundation slice
          // "switch" returns to F1 ingest (onSwitchSample = resetToIngest).
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.75}
            onClick={onSwitchSample}
            onKeyDown={onSwitchSample ? onEnterOrSpace(onSwitchSample) : undefined}
            role="button"
            tabIndex={0}
            aria-label={`Switch sample, currently ${sample.name}`}
            sx={{
              cursor: "pointer",
              px: 1.25,
              py: 0.5,
              borderRadius: BORDER_RADIUS_PILL,
              border: `1px solid ${INPUT_BORDER}`,
              color: NAVY,
              "&:hover": { backgroundColor: GRAY },
            }}
          >
            <Typography sx={{ fontSize: FONT_SIZE_LABEL, color: MUTED_ON_LIGHT }}>sample:</Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{sample.name}</Typography>
            <KeyboardArrowDownIcon sx={{ fontSize: 16 }} />
          </Stack>
        ) : null}
      </Stack>

      {/* Body: doc render */}
      <Box sx={{ flex: 1, overflow: "auto", p: 3, display: "flex", justifyContent: "center" }}>
        <Box sx={{ width: "100%", maxWidth: 560 }}>
          {/* TODO(F3): the understand phase has no completion in this slice, so this
              parsing banner + scan animation run indefinitely. Drive it to a settled
              state once F3 (Extract) lands and the parse can actually finish. */}
          {understanding ? (
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{
                mb: 1.5,
                px: 1.5,
                py: 0.75,
                borderRadius: BORDER_RADIUS,
                backgroundColor: alpha(WARNING_AMBER, 0.18),
                border: `1px solid ${alpha(WARNING_AMBER, 0.5)}`,
              }}
            >
              <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: WARNING_AMBER }} />
              <Typography sx={{ fontSize: 13, color: NAVY, fontWeight: 600 }}>
                Reading {docName} — about 6 seconds
              </Typography>
              <Typography sx={{ fontSize: FONT_SIZE_LABEL, color: MUTED_ON_LIGHT, ml: "auto" }}>
                vision model · semantic objects
              </Typography>
            </Stack>
          ) : null}

          {/* A document page */}
          <Box
            sx={{
              position: "relative",
              overflow: "hidden",
              backgroundColor: WHITE,
              border: `1px solid ${BORDER}`,
              borderRadius: BORDER_RADIUS,
              p: 3,
              boxShadow: "0 1px 3px rgba(41,51,92,0.06)",
            }}
          >
            <Typography
              sx={{
                fontSize: 10,
                fontWeight: FONT_WEIGHT_LABEL,
                letterSpacing: LETTER_SPACING_LABEL,
                color: MUTED_ON_LIGHT,
                mb: 2,
              }}
            >
              {(sample?.name ?? "DOCUMENT").toUpperCase()} · PAGE 1
            </Typography>
            <Stack spacing={1.25}>
              <DocLine width="92%" />
              <DocLine width="78%" />
              <DocLine width="100%" highlighted />
              <DocLine width="64%" />
              <DocLine width="88%" />
              <DocLine width="50%" />
              <DocLine width="73%" />
            </Stack>

            {understanding ? (
              <Box
                aria-hidden="true"
                sx={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  height: 2,
                  background: `linear-gradient(90deg, transparent, ${GREEN}, transparent)`,
                  animation: `${scanSweep} 2.4s ease-in-out infinite`,
                }}
              />
            ) : null}
          </Box>

          <Typography sx={{ mt: 1.5, fontSize: FONT_SIZE_LABEL, color: MUTED_ON_LIGHT, textAlign: "center" }}>
            {sample ? `${sample.docLabel} · ${sample.outcome}` : "Pick a sample to begin"}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

export default Canvas;
