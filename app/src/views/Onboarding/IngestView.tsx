import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useCallback, type FC } from "react";

import {
  BORDER,
  BORDER_RADIUS,
  BORDER_RADIUS_SM,
  CORAL,
  FONT_FAMILY_MARKETING,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_HEADLINE,
  FONT_WEIGHT_LABEL,
  GATE_MAX_WIDTH,
  GREEN,
  LETTER_SPACING_LABEL,
  NAVY,
  ONBOARDING_HERO_FONT_SIZE,
  ONBOARDING_SMALL_TEXT_FONT_SIZE,
  PICKER_MAX_WIDTH,
  PICKER_MAX_WIDTH_ULTRAWIDE,
  WHITE,
} from "@/constants";
import { useAppMode } from "@/contexts/AppModeContext";
import { useCanvasOrchestrator } from "@/contexts/CanvasOrchestratorContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";
import { ByoTile } from "@/shared/components/ByoTile";
import { CapabilityBadge } from "@/shared/components/CapabilityBadge";
import {
  CONNECTOR_KINDS,
  CONNECTOR_LABELS,
  ConnectorGlyph,
} from "@/shared/components/ConnectorGlyph";
import { SampleScenarioCard } from "@/shared/components/SampleScenarioCard";
import type { Scenario } from "@/types/onboarding";
import type { ScenarioConfig } from "@/types/scenarios";

import { GateView } from "./GateView";

/**
 * Closed-union safe-list. Downstream views (F2-F5) still type on the
 * `Scenario` literal union; once they migrate to consume the registry too,
 * this gate can go away.
 */
const KNOWN_SCENARIOS = new Set<Scenario>(["utility", "loan", "solar"]);
const asKnownScenario = (id: string): Scenario | null =>
  KNOWN_SCENARIOS.has(id as Scenario) ? (id as Scenario) : null;

const CAPABILITIES: ReadonlyArray<{ letter: "E" | "I" | "R"; name: string; key: "extract" | "interact" | "report" }> = [
  { letter: "E", name: "Extract", key: "extract" },
  { letter: "I", name: "Interact", key: "interact" },
  { letter: "R", name: "Report", key: "report" },
];

/**
 * F1 IngestView — composed against `spec-nav-v2.jsx Canvas_Ingest`.
 *
 * Layout (top → bottom):
 *   1. Hero: marketing-tier headline + brand-voice sub-line
 *   2. "TRY A SAMPLE · NO SIGN-UP" — sample cards (Utility = ★ start here)
 *   3. Capability legend (E / I / R · filled vs hollow)
 *   4. "🔒 BRING YOUR OWN — SIGN UP FREE TO UNLOCK" — 3 BYO tiles
 *   5. Privacy footer
 */
export const IngestView: FC = () => {
  const { setScenario } = useAppMode();
  const { state: session, pickScenario, advanceFrame, openGate, dismissGate } = useOnboardingSession();
  const { dispatch } = useCanvasOrchestrator();
  const { state: registry } = useScenarioRegistry();
  const gateOpenOrCommitted = session.gate.status === "open" || session.gate.status === "committed";
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down("md"));

  const handlePickScenario = useCallback(
    (id: string) => {
      const scenario = asKnownScenario(id);
      if (!scenario) return;
      pickScenario(scenario);
      setScenario(scenario);
      dispatch({ kind: "showSample", scenario }, "user");
      advanceFrame("f2");
    },
    [pickScenario, setScenario, advanceFrame, dispatch]
  );

  const handleByoClick = useCallback(() => {
    openGate("byo");
  }, [openGate]);

  return (
    <Box
      component="main"
      aria-label="Pick a starting point"
      sx={{
        maxWidth: { xs: "100%", md: PICKER_MAX_WIDTH, xl: PICKER_MAX_WIDTH_ULTRAWIDE },
        mx: "auto",
        py: { xs: 3, md: 5 },
        px: { xs: 2, md: 4 },
      }}
    >
      {/* Hero */}
      <Stack spacing={0.75} sx={{ mb: { xs: 3, md: 4 } }}>
        <Typography
          component="h1"
          sx={{
            fontFamily: FONT_FAMILY_MARKETING,
            fontSize: ONBOARDING_HERO_FONT_SIZE,
            fontWeight: FONT_WEIGHT_HEADLINE,
            lineHeight: 1.05,
            color: NAVY,
            letterSpacing: "-0.01em",
          }}
        >
          Connect your data to GroundX.
        </Typography>
        <Typography variant="body1" sx={{ color: alpha(NAVY, 0.72) }}>
          GroundX works on the docs that break general-purpose AI — contracts, claims, policies, forms, technical
          diagrams. Try a sample, or bring your own.
        </Typography>
      </Stack>

      {/* Samples */}
      <Typography
        variant="overline"
        sx={{
          color: NAVY,
          fontWeight: FONT_WEIGHT_LABEL,
          letterSpacing: LETTER_SPACING_LABEL,
          fontSize: FONT_SIZE_LABEL,
          display: "block",
          mb: 1,
        }}
      >
        TRY A SAMPLE · NO SIGN-UP
      </Typography>
      {/* Cards: 1 column below md, 3 columns above. */}
      <Box
        role="list"
        aria-label="Sample scenarios"
        sx={{
          display: "grid",
          gap: { xs: 1, md: 1.5 },
          gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
        }}
      >
        {registry.status === "loading" ? (
          <Typography sx={{ color: alpha(NAVY, 0.55), fontStyle: "italic", py: 2 }}>Loading samples…</Typography>
        ) : registry.status === "error" ? (
          <Typography sx={{ color: CORAL, py: 2 }} role="alert">
            Couldn't load samples: {registry.error}
          </Typography>
        ) : null}
        {registry.scenarios.map((scenario: ScenarioConfig, index) => (
          <SampleScenarioCard
            key={scenario.id}
            id={scenario.id}
            hero={scenario.manifest.hero}
            startHere={index === 0}
            onClick={() => handlePickScenario(scenario.id)}
          />
        ))}
      </Box>

      {/* Capability legend */}
      <Stack
        direction="row"
        alignItems="center"
        flexWrap="wrap"
        spacing={1.25}
        sx={{ mt: 1.25, color: alpha(NAVY, 0.6), fontSize: ONBOARDING_SMALL_TEXT_FONT_SIZE }}
      >
        <Typography sx={{ fontWeight: 700, color: alpha(NAVY, 0.75), fontSize: "inherit" }}>
          capabilities demonstrated:
        </Typography>
        {CAPABILITIES.map((cap) => (
          <Stack key={cap.key} direction="row" alignItems="center" spacing={0.5}>
            <CapabilityBadge letter={cap.letter} live name={cap.name} size="sm" />
            <Typography sx={{ fontSize: "inherit" }}>{cap.name}</Typography>
          </Stack>
        ))}
        <Typography sx={{ fontStyle: "italic", color: alpha(NAVY, 0.5), fontSize: "inherit" }}>
          hollow = not in this sample
        </Typography>
      </Stack>

      {/* BYO header — clickable; opens the same gate as the three Sign Up
          buttons inside the tiles. */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.5}
        role="button"
        tabIndex={0}
        onClick={handleByoClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleByoClick();
          }
        }}
        sx={{
          mt: 4,
          mb: 1,
          color: alpha(NAVY, 0.5),
          cursor: "pointer",
          width: "fit-content",
          borderRadius: BORDER_RADIUS_SM,
          px: 0.5,
          mx: -0.5,
          "&:hover": { color: NAVY, backgroundColor: alpha(NAVY, 0.04) },
          "&:focus-visible": { outline: `2px solid ${GREEN}`, outlineOffset: 2 },
        }}
      >
        <LockOutlinedIcon sx={{ fontSize: 14 }} />
        <Typography
          variant="overline"
          sx={{
            color: "inherit",
            fontWeight: FONT_WEIGHT_LABEL,
            letterSpacing: LETTER_SPACING_LABEL,
            fontSize: FONT_SIZE_LABEL,
            lineHeight: 1,
          }}
        >
          BRING YOUR OWN — SIGN UP FREE TO UNLOCK
        </Typography>
      </Stack>

      <Box sx={{ position: "relative" }}>
        {/* Diagonal stripe overlay — reads as "disabled section" */}
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            inset: -4,
            pointerEvents: "none",
            backgroundImage: `repeating-linear-gradient(45deg, transparent 0, transparent 12px, ${alpha(
              NAVY,
              0.04
            )} 12px, ${alpha(NAVY, 0.04)} 14px)`,
            borderRadius: BORDER_RADIUS,
            zIndex: 0,
          }}
        />
        <Box
          role="list"
          aria-label="Bring your own"
          sx={{
            position: "relative",
            zIndex: 1,
            display: "grid",
            gap: 1.5,
            gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
          }}
        >
          <ByoTile
            testId="byo-pdf"
            title="Upload files"
            sub="drag & drop · PDF · DOCX · XLSX"
            cta="Sign up · upload your docs"
            ctaIcon="↑"
            onClick={handleByoClick}
            accent="dashed"
          >
            <Box
              aria-hidden
              sx={{
                width: 34,
                height: 42,
                borderRadius: BORDER_RADIUS_SM,
                border: `1.5px dashed ${alpha(NAVY, 0.3)}`,
                backgroundColor: WHITE,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                fontWeight: 700,
                color: alpha(NAVY, 0.45),
                fontFamily: FONT_FAMILY_MARKETING,
              }}
            >
              ↑
            </Box>
          </ByoTile>

          <ByoTile
            testId="byo-url"
            title="Connect a source"
            sub="sync from where your docs live"
            cta="Sign up · connect your sources"
            ctaIcon="⚡"
            onClick={handleByoClick}
          >
            <Stack direction="row" flexWrap="wrap" sx={{ gap: 0.5, opacity: 0.7 }}>
              {CONNECTOR_KINDS.map((kind) => (
                <Box
                  key={kind}
                  sx={{
                    width: 22,
                    height: 22,
                    borderRadius: BORDER_RADIUS_SM,
                    backgroundColor: WHITE,
                    border: `1px solid ${alpha(NAVY, 0.18)}`,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title={CONNECTOR_LABELS[kind]}
                  aria-label={CONNECTOR_LABELS[kind]}
                >
                  <ConnectorGlyph kind={kind} size={16} />
                </Box>
              ))}
            </Stack>
          </ByoTile>

          <ByoTile
            testId="byo-folder"
            title="Email it in"
            sub="forward any doc · ingests itself"
            cta="Sign up · email your docs"
            ctaIcon="✉"
            onClick={handleByoClick}
          >
            <Box
              aria-hidden
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                px: 1,
                py: 0.5,
                backgroundColor: alpha(WHITE, 0.7),
                border: `1px dashed ${alpha(NAVY, 0.3)}`,
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: ONBOARDING_SMALL_TEXT_FONT_SIZE,
                fontWeight: 700,
                color: alpha(NAVY, 0.6),
                borderRadius: BORDER_RADIUS_SM,
              }}
            >
              <span>✉</span> ingest@groundx.ai
            </Box>
          </ByoTile>
        </Box>
      </Box>

      {/* Privacy footer */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 2, color: alpha(NAVY, 0.6) }}>
        <LockOutlinedIcon sx={{ fontSize: 14 }} />
        <Typography sx={{ fontSize: ONBOARDING_SMALL_TEXT_FONT_SIZE }}>
          Your docs are yours. GroundX never trains on uploaded content. Air-gapped on-prem available for regulated
          buyers.
        </Typography>
      </Stack>

      {/* F6 gate — inline next to the picker on desktop (md+), or a bottom
          sheet Drawer on tablet/mobile so the picker stays visible behind. */}
      {gateOpenOrCommitted && !compact ? (
        <Box sx={{ mt: 4, maxWidth: GATE_MAX_WIDTH, mx: "auto" }}>
          <GateView />
        </Box>
      ) : null}

      <Drawer
        anchor="bottom"
        open={gateOpenOrCommitted && compact}
        onClose={dismissGate}
        PaperProps={{
          sx: {
            borderTopLeftRadius: BORDER_RADIUS,
            borderTopRightRadius: BORDER_RADIUS,
            maxHeight: "90vh",
            backgroundColor: WHITE,
            p: { xs: 1.5, sm: 2 },
          },
        }}
      >
        <Box sx={{ width: "100%", display: "flex", justifyContent: "center" }}>
          <GateView />
        </Box>
      </Drawer>

      <Box sx={{ visibility: "hidden", borderTop: `1px solid ${BORDER}`, mt: 4 }} aria-hidden />
    </Box>
  );
};
