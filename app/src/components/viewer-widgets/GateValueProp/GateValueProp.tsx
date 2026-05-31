/**
 * GateValueProp — the canvas (viewer-slot) half of the F6 sign-up gate.
 *
 * P1 (2026-05-29): the gate's sign-up DOORS moved into the chat rail
 * (`GateChatRail` — magic-link · SSO · book-a-call). This widget is the
 * viewer-slot counterpart: instead of an account form, the canvas pitches
 * the GroundX value proposition while the user decides. It is the "you've
 * felt the value, here's why it's worth an account" surface.
 *
 * P1 polish (2026-05-29): rebuilt from a flat bullet list into a designed
 * hero — eyebrow chip, display headline, lead, four icon-badged feature
 * rows, and a free-tier footer. Presentational only; no LLM tools
 * (`no-llm.md`). Copy is product-brand-gtm aligned (F1 "documents that
 * break general-purpose AI" + F7 "ship to your stack" + the F6 free-tier
 * note).
 *
 * Migrated to the role+scope widget contract in 2026-05-30-widget-role-access
 * Phase 2b. Matrix row (docs/agents/widget-access-matrix.md): **anonymous-only**
 * availability (gate context) — enforced at the MOUNT SITE, not by a prop;
 * no affordance lock; scope `{ type: "none" }` (not a ScopedViewerWidget).
 * The retired cosmetic `mode` prop was dropped (identical pitch in both
 * modes) and replaced by `role` for contract conformance.
 */

import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import VerifiedOutlinedIcon from "@mui/icons-material/VerifiedOutlined";
import { alpha } from "@mui/material/styles";
import { type FC, type ReactNode } from "react";
import type { WidgetRole, WidgetScope } from "@groundx/shared";

import { BodyText } from "@/components/primitives/BodyText/BodyText";
import { Heading } from "@/components/primitives/Heading/Heading";
import { Label } from "@/components/primitives/Label/Label";
import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS_CARD,
  BORDER_RADIUS_PILL,
  FONT_WEIGHT_HEADLINE,
  FONT_WEIGHT_LABEL,
  GREEN,
  MUTED_ON_LIGHT,
  NAVY,
  WARM_OFFWHITE,
  WHITE,
} from "@/constants";

export interface GateValuePropProps {
  /**
   * Widget access role (widget contract). GateValueProp's matrix row is
   * **anonymous-only** availability (gate context) — but that is enforced
   * at the MOUNT SITE (OnboardingShell, gate-state), NOT by this prop. The
   * widget locks no affordance by role (presentational pitch) and renders
   * identically under any role it is handed. `role` is carried for contract
   * conformance + future roles. Defaults to `"anonymous"`. The retired
   * cosmetic `mode` prop was dropped — the pitch is identical in both
   * modes, so there was nothing for it to switch.
   */
  role: WidgetRole;
  /**
   * Required scope per the widget contract. GateValueProp is not a
   * ScopedViewerWidget — it operates on no document set, so its scope is
   * always the explicit `{ type: "none" }`.
   */
  scope: WidgetScope;
}

interface ValueFeature {
  icon: ReactNode;
  title: string;
  body: string;
}

const FEATURES: readonly ValueFeature[] = [
  {
    icon: <VerifiedOutlinedIcon fontSize="small" />,
    title: "Cited, not guessed",
    body: "Every answer cites its source — down to the page and region.",
  },
  {
    icon: <DescriptionOutlinedIcon fontSize="small" />,
    title: "Built for the hard documents",
    body: "Contracts, claims, policies, forms, technical diagrams — the files that break general-purpose AI.",
  },
  {
    icon: <ShieldOutlinedIcon fontSize="small" />,
    title: "Your data stays yours",
    body: "Never trained on. Air-gapped on-prem available for regulated teams.",
  },
  {
    icon: <BoltOutlinedIcon fontSize="small" />,
    title: "Production-ready",
    body: "Ship the same project into your stack — API, SDK, and agent integrations.",
  },
];

export const GateValueProp: FC<GateValuePropProps> = ({ role }) => (
  <Box
    data-widget="gate-value-prop"
    data-role={role}
    data-testid="gate-value-prop"
    aria-label="Why GroundX"
    sx={{
      height: "100%",
      width: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      // Safe-centering: margin-auto on the card centers it when there's room
      // and lets it scroll (instead of clipping the top) when the card is
      // taller than the canvas. Plain `justifyContent: center` would clip.
      overflowY: "auto",
      p: { xs: 2.5, md: 3.5 },
      // Soft brand-tinted backdrop so the pitch card reads as a deliberate
      // surface, not a bare panel.
      background: `linear-gradient(160deg, ${WHITE} 0%, ${WARM_OFFWHITE} 100%)`,
    }}
  >
    <Paper
      elevation={0}
      sx={{
        position: "relative",
        overflow: "hidden",
        m: "auto",
        p: { xs: 3, md: 6 },
        maxWidth: 860,
        width: "100%",
        borderRadius: BORDER_RADIUS_CARD,
        border: `1px solid ${BORDER}`,
        backgroundColor: WHITE,
      }}
    >
      {/* Top accent rule — a quiet brand cue along the card's leading edge. */}
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: `linear-gradient(90deg, ${GREEN} 0%, ${alpha(GREEN, 0.35)} 100%)`,
        }}
      />

      <Stack spacing={3}>
        <Stack spacing={2}>
          <Box
            sx={{
              alignSelf: "flex-start",
              px: 1.25,
              py: 0.5,
              borderRadius: BORDER_RADIUS_PILL,
              backgroundColor: alpha(GREEN, 0.14),
            }}
          >
            <Label sx={{ color: NAVY }}>WHY GROUNDX</Label>
          </Box>

          <Heading
            level="h2"
            sx={{ color: NAVY, fontWeight: FONT_WEIGHT_HEADLINE, lineHeight: 1.12 }}
          >
            Answers you can trust — from the documents that break other AI.
          </Heading>

          <BodyText sx={{ color: BODY_TEXT, maxWidth: 640 }}>
            GroundX reads the messy, high-stakes files general-purpose models choke on, and grounds
            every answer in the source. Sign up to save this work and bring your own.
          </BodyText>
        </Stack>

        <Stack spacing={2.25}>
          {FEATURES.map((feature) => (
            <Box key={feature.title} sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
              <Box
                aria-hidden
                sx={{
                  flexShrink: 0,
                  width: 40,
                  height: 40,
                  borderRadius: BORDER_RADIUS_PILL,
                  backgroundColor: alpha(GREEN, 0.12),
                  color: GREEN,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {feature.icon}
              </Box>
              <Stack spacing={0.25}>
                <BodyText sx={{ color: NAVY, fontWeight: FONT_WEIGHT_LABEL }}>
                  {feature.title}
                </BodyText>
                <BodyText sx={{ color: BODY_TEXT }}>{feature.body}</BodyText>
              </Stack>
            </Box>
          ))}
        </Stack>

        <Box sx={{ pt: 2, borderTop: `1px solid ${BORDER}` }}>
          <BodyText sx={{ color: MUTED_ON_LIGHT }}>
            Free tier — 100 pages parsed · no credit card.
          </BodyText>
        </Box>
      </Stack>
    </Paper>
  </Box>
);
