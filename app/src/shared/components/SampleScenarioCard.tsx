/**
 * SampleScenarioCard — the F1 sample-tile chrome.
 *
 * Renders a clickable card with:
 *   • DocThumb + doc-count badge in the top-left
 *   • Hero title + short description in the top-right
 *   • Coral "demonstrates" line + capability chips (E / I / R) at the bottom
 *   • Optional "★ start here" pill in the top-right corner
 *
 * Distinct from GxCard because the sample card uses the wireframe-style
 * thicker navy border, the rough SVG filter, and a tighter BORDER_RADIUS
 * (6px) rather than GxCard's 20px card radius. GxCard isn't the right
 * primitive here.
 *
 * Pure presentational. The parent passes hero data + an onClick.
 */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import type { FC, ReactNode } from "react";

import {
  BORDER_RADIUS,
  BORDER_RADIUS_PILL,
  CORAL,
  CYAN,
  FONT_FAMILY_MARKETING,
  FONT_SIZE_H5,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_HEADLINE,
  GREEN,
  NAVY,
  ONBOARDING_SMALL_TEXT_FONT_SIZE,
  SAMPLE_CARD_MIN_HEIGHT,
  WHITE,
} from "@/constants";
import type { ScenarioHero } from "@/types/scenarios";

import { CapabilityBadge } from "./CapabilityBadge";
import { DocThumb } from "./DocThumb";

const ROUGH_FILTER = "url(#wf-rough-lite)";

const CAPABILITIES: ReadonlyArray<{ letter: "E" | "I" | "R"; name: string; key: "extract" | "interact" | "report" }> = [
  { letter: "E", name: "Extract", key: "extract" },
  { letter: "I", name: "Interact", key: "interact" },
  { letter: "R", name: "Report", key: "report" },
];

export interface SampleScenarioCardProps {
  /** Stable identifier; used in data-testid + aria. */
  id: string;
  hero: ScenarioHero;
  /** When true, decorates with the "★ start here" pill and a thicker border. */
  startHere?: boolean;
  onClick: () => void;
  /** Optional override; defaults to a sensible aria-label from hero.title. */
  ariaLabel?: string;
  children?: ReactNode;
}

export const SampleScenarioCard: FC<SampleScenarioCardProps> = ({
  id,
  hero,
  startHere = false,
  onClick,
  ariaLabel,
}) => {
  return (
    <Box
      role="listitem"
      tabIndex={0}
      data-testid={`sample-${id}`}
      aria-label={ariaLabel ?? `Open sample: ${hero.title}`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      sx={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        minHeight: SAMPLE_CARD_MIN_HEIGHT,
        p: 1.75,
        borderRadius: BORDER_RADIUS,
        border: startHere ? `2px solid ${NAVY}` : `1.5px solid ${alpha(NAVY, 0.55)}`,
        backgroundColor: WHITE,
        filter: ROUGH_FILTER,
        cursor: "pointer",
        transition: "transform 120ms ease, border-color 120ms ease, box-shadow 120ms ease",
        "&:hover": { borderColor: NAVY, transform: "translateY(-1px)" },
        "&:focus-visible": { outline: `2px solid ${GREEN}`, outlineOffset: 2 },
      }}
    >
      {startHere ? (
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            top: -12,
            right: 14,
            px: 1.25,
            py: 0.25,
            borderRadius: BORDER_RADIUS_PILL,
            backgroundColor: GREEN,
            border: `1.5px solid ${NAVY}`,
            fontFamily: FONT_FAMILY_MARKETING,
            fontSize: ONBOARDING_SMALL_TEXT_FONT_SIZE,
            fontWeight: 700,
            color: NAVY,
            letterSpacing: "0.02em",
          }}
        >
          ★ start here
        </Box>
      ) : null}
      <Stack direction="row" spacing={2.5} sx={{ flex: 1, alignItems: "flex-start" }}>
        <Box sx={{ position: "relative", flexShrink: 0, mr: 0.5 }}>
          <DocThumb w={36} h={46} />
          <Box
            aria-hidden
            sx={{
              position: "absolute",
              bottom: -6,
              right: -10,
              px: 0.75,
              py: 0.1,
              borderRadius: BORDER_RADIUS_PILL,
              backgroundColor: CYAN,
              border: `1.5px solid ${NAVY}`,
              fontFamily: FONT_FAMILY_MARKETING,
              fontSize: 10,
              fontWeight: 700,
              color: NAVY,
              whiteSpace: "nowrap",
              lineHeight: 1.4,
            }}
          >
            {hero.docCount}
          </Box>
        </Box>
        <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            sx={{
              fontFamily: FONT_FAMILY_MARKETING,
              fontSize: FONT_SIZE_H5,
              fontWeight: FONT_WEIGHT_HEADLINE,
              lineHeight: 1.05,
              color: NAVY,
            }}
          >
            {hero.title}
          </Typography>
          <Typography sx={{ color: alpha(NAVY, 0.65), fontSize: FONT_SIZE_LABEL, lineHeight: 1.35 }}>
            {hero.shortDesc}
          </Typography>
        </Stack>
      </Stack>
      <Stack direction="row" alignItems="flex-end" spacing={1} sx={{ mt: 1 }}>
        <Typography
          sx={{
            flex: 1,
            color: CORAL,
            fontWeight: 700,
            fontSize: ONBOARDING_SMALL_TEXT_FONT_SIZE,
            lineHeight: 1.3,
            letterSpacing: "0.01em",
          }}
        >
          {hero.demonstrates}
        </Typography>
        <Stack direction="row" spacing={0.5}>
          {CAPABILITIES.map((cap) => (
            <CapabilityBadge
              key={cap.key}
              letter={cap.letter}
              live={hero.chapters[cap.key] === "live"}
              name={cap.name}
            />
          ))}
        </Stack>
      </Stack>
    </Box>
  );
};
