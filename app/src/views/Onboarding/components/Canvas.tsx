/**
 * Canvas — the right pane of the split. Renders docs, extractions, and the
 * citation peek.
 *
 * Understand (F2): a live-parse of the doc. Extract (F3): a two-pane doc viewer
 * + ExtractedFields panel; hovering a field lights up its region. Opening a
 * field (F4) flips to a breadcrumbed peek — the doc shows a MATCH box and the
 * right pane shows full FieldProvenance. The free-tier unlock bar is pinned
 * along the bottom of both Extract and peek.
 */

import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha, keyframes } from "@mui/material/styles";

import {
  BORDER,
  BORDER_RADIUS,
  BORDER_RADIUS_PILL,
  BORDER_RADIUS_SM,
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
import { CommonSubmitButton } from "@/shared/components/CommonSubmitButton";
import { onEnterOrSpace } from "@/shared/utils/onEnterOrSpace";

import { FieldCategory, FlowPhase, SampleProject } from "../flow/flowTypes";
import { ExtractedFields } from "./ExtractedFields";
import { FieldProvenance } from "./FieldProvenance";

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

interface MatchBox {
  label: string;
  lines: string[];
}

/** The rendered doc page. `scanning` shows the live-parse sweep; `provenanceLabel` calls out a
 *  hovered field's row; `matchBox` renders the opened field's source region. */
const DocPage = ({
  title,
  scanning = false,
  provenanceLabel = null,
  matchBox = null,
}: {
  title: string;
  scanning?: boolean;
  provenanceLabel?: string | null;
  matchBox?: MatchBox | null;
}) => (
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
      sx={{ fontSize: 10, fontWeight: FONT_WEIGHT_LABEL, letterSpacing: LETTER_SPACING_LABEL, color: MUTED_ON_LIGHT, mb: 2 }}
    >
      {title}
    </Typography>
    <Stack spacing={1.25}>
      <DocLine width="92%" />
      <DocLine width="78%" />
      {matchBox ? (
        <Box
          sx={{
            position: "relative",
            my: 0.5,
            p: 1.25,
            border: `1.5px solid ${GREEN}`,
            borderRadius: BORDER_RADIUS,
            backgroundColor: alpha(GREEN, 0.18),
          }}
        >
          <Typography
            sx={{
              position: "absolute",
              top: -9,
              left: 8,
              px: 0.5,
              backgroundColor: GREEN,
              color: NAVY,
              fontSize: 10,
              fontWeight: 700,
              borderRadius: BORDER_RADIUS_SM,
            }}
          >
            {matchBox.label}
          </Typography>
          <Stack spacing={0.5}>
            {matchBox.lines.map((line) => (
              <Typography key={line} sx={{ fontSize: 12, fontWeight: 600, color: NAVY }}>
                {line}
              </Typography>
            ))}
          </Stack>
        </Box>
      ) : (
        <Box sx={{ position: "relative" }}>
          <DocLine width="100%" highlighted={Boolean(provenanceLabel)} />
          {provenanceLabel ? (
            <Typography
              sx={{
                position: "absolute",
                right: 0,
                top: -16,
                fontSize: 10,
                fontWeight: 700,
                color: NAVY,
                backgroundColor: alpha(GREEN, 0.9),
                px: 0.5,
                borderRadius: BORDER_RADIUS,
                whiteSpace: "nowrap",
              }}
            >
              {provenanceLabel} →
            </Typography>
          ) : null}
        </Box>
      )}
      <DocLine width="64%" />
      <DocLine width="88%" />
      <DocLine width="50%" />
      <DocLine width="73%" />
    </Stack>

    {scanning ? (
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
);

const DocToolbar = ({ docName }: { docName: string }) => (
  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
    <Typography sx={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{docName}</Typography>
    <Typography sx={{ fontSize: FONT_SIZE_LABEL, color: MUTED_ON_LIGHT }}>· page 1 of 3 · 100%</Typography>
  </Stack>
);

const CrumbButton = ({ label, onClick }: { label: string; onClick?: () => void }) => (
  <ButtonBase
    onClick={onClick}
    disableRipple
    sx={{ fontSize: 12, fontWeight: 600, color: NAVY, px: 0.75, py: 0.25, borderRadius: BORDER_RADIUS_SM, "&:hover": { backgroundColor: GRAY } }}
  >
    {label}
  </ButtonBase>
);

export interface CanvasProps {
  sample: SampleProject | null;
  phase: FlowPhase;
  /** The category shown in the Extract (F3) panel / peek. */
  category?: FieldCategory | null;
  /** Field hovered in the Extract panel, surfaced as a provenance highlight on the doc. */
  hoveredField?: string | null;
  onHoverField?: (name: string | null) => void;
  /** Field opened into the provenance peek (F4). */
  selectedField?: string | null;
  onSelectField?: (name: string) => void;
  onClearField?: () => void;
  onSwitchSample?: () => void;
}

export function Canvas({
  sample,
  phase,
  category,
  hoveredField,
  onHoverField,
  selectedField,
  onSelectField,
  onClearField,
  onSwitchSample,
}: CanvasProps) {
  const understanding = phase === "understand";
  const docName = sample ? `${sample.name.toLowerCase().replace(/\s+/g, "-")}.pdf` : "document.pdf";
  const selected = category && selectedField ? (category.fields.find((f) => f.name === selectedField) ?? null) : null;
  const peeking = phase === "interact" && Boolean(selected) && Boolean(category);
  const extracting = phase === "extract" && Boolean(category);

  const unlockBar = (
    <Stack
      direction="row"
      alignItems="center"
      spacing={2}
      sx={{ px: 2.5, py: 1.5, borderTop: `1px solid ${BORDER}`, backgroundColor: WHITE }}
    >
      <Typography sx={{ flex: 1, fontSize: 13, color: MUTED_ON_LIGHT, minWidth: 0 }}>
        Preview — more meters and statement fields are signed-in only.
      </Typography>
      {/* TODO(F6): open the sign-in gate. */}
      <CommonSubmitButton isUppercase={false} sx={{ fontSize: 13, flexShrink: 0 }}>
        unlock everything →
      </CommonSubmitButton>
    </Stack>
  );

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
          // TODO(F3a+): open a sample picker. In this slice "switch" returns to F1 ingest.
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

      {peeking && selected && category ? (
        /* F4: field provenance peek — breadcrumb + doc MATCH box + provenance panel. */
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.5}
            sx={{ px: 2.5, py: 1, borderBottom: `1px solid ${BORDER}`, backgroundColor: WHITE }}
          >
            <CrumbButton label="← all fields" onClick={onClearField} />
            <Typography sx={{ fontSize: 12, color: MUTED_ON_LIGHT }}>›</Typography>
            <Typography sx={{ fontSize: 12, color: MUTED_ON_LIGHT }}>{category.label}</Typography>
            <Typography sx={{ fontSize: 12, color: MUTED_ON_LIGHT }}>›</Typography>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{selected.name.toLowerCase()}</Typography>
            <Box sx={{ flex: 1 }} />
            <CrumbButton label="▴ collapse" onClick={onClearField} />
          </Stack>
          <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
            <Box sx={{ flex: 1, minWidth: 0, overflow: "auto", p: 2.5, borderRight: `1px solid ${BORDER}` }}>
              <DocToolbar docName={docName} />
              <DocPage
                title={`${(sample?.name ?? "DOCUMENT").toUpperCase()} · PAGE 1`}
                matchBox={{
                  label: `MATCH · ${selected.provenance?.confidence ?? 96}%`,
                  lines: selected.provenance?.matchBox ?? [selected.name.replace(/_/g, " "), selected.value],
                }}
              />
            </Box>
            <Box sx={{ width: { xs: 280, lg: 340 }, flexShrink: 0, minWidth: 0 }}>
              <FieldProvenance field={selected} category={category} />
            </Box>
          </Box>
          {unlockBar}
        </Box>
      ) : extracting && category ? (
        /* F3: doc viewer + fields, with the unlock bar pinned below. */
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
            <Box sx={{ flex: 1, minWidth: 0, overflow: "auto", p: 2.5, borderRight: `1px solid ${BORDER}` }}>
              <DocToolbar docName={docName} />
              <DocPage title={`${(sample?.name ?? "DOCUMENT").toUpperCase()} · PAGE 1`} provenanceLabel={hoveredField ?? null} />
            </Box>
            <Box sx={{ width: { xs: 280, lg: 340 }, flexShrink: 0, minWidth: 0 }}>
              <ExtractedFields
                category={category}
                hoveredField={hoveredField ?? null}
                onHoverField={onHoverField ?? (() => {})}
                onSelectField={onSelectField ?? (() => {})}
              />
            </Box>
          </Box>
          {unlockBar}
        </Box>
      ) : (
        /* Understand (F2) and other single-doc states. */
        <Box sx={{ flex: 1, overflow: "auto", p: 3, display: "flex", justifyContent: "center" }}>
          <Box sx={{ width: "100%", maxWidth: 560 }}>
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
                <Typography sx={{ fontSize: 13, color: NAVY, fontWeight: 600 }}>Reading {docName} — about 6 seconds</Typography>
                <Typography sx={{ fontSize: FONT_SIZE_LABEL, color: MUTED_ON_LIGHT, ml: "auto" }}>parsing layout</Typography>
              </Stack>
            ) : null}

            <DocPage title={`${(sample?.name ?? "DOCUMENT").toUpperCase()} · PAGE 1`} scanning={understanding} />

            <Typography sx={{ mt: 1.5, fontSize: FONT_SIZE_LABEL, color: MUTED_ON_LIGHT, textAlign: "center" }}>
              {sample ? `${sample.docLabel} · ${sample.outcome}` : "Pick a sample to begin"}
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default Canvas;
