/**
 * Shared canvas primitives — the document chrome the per-phase canvases compose:
 * the page shell (with optional live-parse sweep), line placeholders, the P4
 * MATCH box, the P5 citation regions, the doc toolbar, breadcrumb buttons, the
 * free-tier unlock bar, and the coming-soon placeholder for unwired samples.
 */

import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ReactNode } from "react";
import { alpha, keyframes } from "@mui/material/styles";

import {
  BLUE,
  BORDER,
  BORDER_RADIUS,
  BORDER_RADIUS_SM,
  CORAL,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_LABEL,
  GRAY,
  GREEN,
  LETTER_SPACING_LABEL,
  MUTED_ON_LIGHT,
  NAVY,
  WHITE,
} from "@/constants";
import { CommonSubmitButton } from "@/shared/components/CommonSubmitButton";

import { AnswerCitation } from "../../flow/flowTypes";

const scanSweep = keyframes`
  0% { top: 8%; opacity: 0.35; }
  50% { top: 60%; opacity: 1; }
  100% { top: 92%; opacity: 0.35; }
`;

export const DocLine = ({ width, highlighted = false }: { width: string; highlighted?: boolean }) => (
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

/** The doc page card. `scanning` overlays the live-parse sweep; children are the rows. */
export const DocPage = ({ title, scanning = false, children }: { title: string; scanning?: boolean; children: ReactNode }) => (
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
    <Stack spacing={1.25}>{children}</Stack>
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

/** P4 source region: a green MATCH box with a label and the matched lines. */
export const MatchBox = ({ label, lines }: { label: string; lines: string[] }) => (
  <Box
    sx={{ position: "relative", my: 0.5, p: 1.25, border: `1.5px solid ${GREEN}`, borderRadius: BORDER_RADIUS, backgroundColor: alpha(GREEN, 0.18) }}
  >
    <Typography
      sx={{ position: "absolute", top: -9, left: 8, px: 0.5, backgroundColor: GREEN, color: NAVY, fontSize: 10, fontWeight: 700, borderRadius: BORDER_RADIUS_SM }}
    >
      {label}
    </Typography>
    <Stack spacing={0.5}>
      {lines.map((line) => (
        <Typography key={line} sx={{ fontSize: 12, fontWeight: 600, color: NAVY }}>
          {line}
        </Typography>
      ))}
    </Stack>
  </Box>
);

const REGION_TONE: Record<AnswerCitation["tone"], string> = { success: GREEN, info: BLUE, warning: CORAL };

/** P5 anchored citation region — a tone-coloured box labelled with the citation. */
export const CitationRegion = ({ citation }: { citation: AnswerCitation }) => {
  const accent = REGION_TONE[citation.tone];
  return (
    <Box sx={{ position: "relative", my: 1, p: 1.25, border: `1.5px solid ${accent}`, borderRadius: BORDER_RADIUS, backgroundColor: alpha(accent, 0.14) }}>
      <Typography
        sx={{ position: "absolute", top: -9, left: 8, px: 0.5, backgroundColor: accent, color: WHITE, fontSize: 10, fontWeight: 700, borderRadius: BORDER_RADIUS_SM }}
      >
        {citation.id} {citation.label}
      </Typography>
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: NAVY, mt: 0.25 }}>{citation.caption}</Typography>
    </Box>
  );
};

export const DocToolbar = ({ docName }: { docName: string }) => (
  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
    <Typography sx={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{docName}</Typography>
    <Typography sx={{ fontSize: FONT_SIZE_LABEL, color: MUTED_ON_LIGHT }}>· page 1 of 3 · 100%</Typography>
  </Stack>
);

export const CrumbButton = ({ label, onClick }: { label: string; onClick?: () => void }) => (
  <ButtonBase
    onClick={onClick}
    disableRipple
    sx={{ fontSize: 12, fontWeight: 600, color: NAVY, px: 0.75, py: 0.25, borderRadius: BORDER_RADIUS_SM, "&:hover": { backgroundColor: GRAY } }}
  >
    {label}
  </ButtonBase>
);

/** Free-tier footer pinned below Extract / peek / compare. */
export const UnlockBar = ({ onUnlock }: { onUnlock?: () => void }) => (
  <Stack direction="row" alignItems="center" spacing={2} sx={{ px: 2.5, py: 1.5, borderTop: `1px solid ${BORDER}`, backgroundColor: WHITE }}>
    <Typography sx={{ flex: 1, fontSize: 13, color: MUTED_ON_LIGHT, minWidth: 0 }}>
      Preview — more meters and statement fields are signed-in only.
    </Typography>
    <CommonSubmitButton isUppercase={false} onClick={onUnlock} sx={{ fontSize: 13, flexShrink: 0 }}>
      unlock everything →
    </CommonSubmitButton>
  </Stack>
);

/** Placeholder for a sample whose analysis isn't wired yet (resolves the dead-end). */
export const ComingSoonCanvas = ({ sampleName }: { sampleName: string }) => (
  <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", p: 4 }}>
    <Box sx={{ maxWidth: 360, textAlign: "center" }}>
      <Typography variant="h6" sx={{ color: NAVY }}>
        {sampleName} analysis is coming soon
      </Typography>
      <Typography sx={{ mt: 1, fontSize: 14, color: MUTED_ON_LIGHT }}>
        This sample isn&apos;t wired up yet. Try the Utility Bill for the full walkthrough.
      </Typography>
    </Box>
  </Box>
);

/** Standard rows for a page-1 doc; reused by Extract / Understand. */
export const docName = (sampleName: string | undefined) =>
  sampleName ? `${sampleName.toLowerCase().replace(/\s+/g, "-")}.pdf` : "document.pdf";
