import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { useCallback, type FC } from "react";
import { useNavigate } from "react-router-dom";

import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS,
  BORDER_RADIUS_SM,
  CORAL,
  FONT_FAMILY_MARKETING,
  FONT_SIZE_H5,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_HEADLINE,
  FONT_WEIGHT_LABEL,
  GREEN,
  ICON_SIZE_INLINE,
  LETTER_SPACING_LABEL,
  NAVY,
  ONBOARDING_HERO_FONT_SIZE,
  ONBOARDING_SMALL_TEXT_FONT_SIZE,
  PICKER_MAX_WIDTH,
  PICKER_MAX_WIDTH_ULTRAWIDE,
  TINT,
  WHITE,
} from "@/constants";
import { useAppMode } from "@/contexts/AppModeContext";
import { useCanvasOrchestrator } from "@/contexts/CanvasOrchestratorContext";
import { selectActiveStep, useChatStore } from "@/contexts/ChatStoreContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";
import { ByoTile } from "@/views/Onboarding/IngestView/ByoTile";
import { CapabilityBadge } from "@/components/brand/CapabilityBadge/CapabilityBadge";
import {
  CONNECTOR_KINDS,
  CONNECTOR_LABELS,
  ConnectorGlyph,
} from "@/components/brand/ConnectorGlyph/ConnectorGlyph";
import { SampleScenarioCard } from "@/views/Onboarding/IngestView/SampleScenarioCard";
import type { Scenario } from "@/types/onboarding";
import type { ScenarioConfig } from "@/types/scenarios";

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
  const { pickScenario, openGate } = useOnboardingSession();
  // `master-viewer-session` Phase 5 — the pre-attached schema is now
  // an annotation on the F1 ingest-picker step (pushed by ExtractView
  // after a successful Save → sign-in → persist loop). The legacy
  // `session.preAttachedSchemaId` slot is being retired in favor of
  // this step-annotation source. ChatStore's projected state surfaces
  // the latest viewer step here.
  const { state: chatStoreState } = useChatStore();
  const activeChatSession = chatStoreState.activeSessionId
    ? chatStoreState.sessions.get(chatStoreState.activeSessionId)
    : null;
  const latestStep = selectActiveStep(activeChatSession);
  const preAttachedSchemaId =
    latestStep && latestStep.kind === "ingest-picker" ? latestStep.attachedSchema?.schemaId ?? null : null;
  const navigate = useNavigate();
  const { dispatch } = useCanvasOrchestrator();
  const { state: registry, refresh: refreshRegistry } = useScenarioRegistry();

  const handlePickScenario = useCallback(
    (id: string) => {
      const scenario = asKnownScenario(id);
      if (!scenario) return;
      // Update state directly (preserves resume on existing entities)
      // AND navigate to the canonical URL so deep links + back/forward
      // work. OnboardingShell's URL-sync useEffect will also call
      // pickScenario when it observes the URL change — that call is
      // idempotent on an already-active entity.
      pickScenario(scenario);
      setScenario(scenario);
      dispatch({ kind: "showSample", scenario }, "user");
      if (registry.bucketId != null) {
        navigate(`/onboarding/${registry.bucketId}/${scenario}`);
      }
    },
    [navigate, registry.bucketId, pickScenario, setScenario, dispatch]
  );

  const handleByoClick = useCallback(() => {
    // Open the session gate directly (so tests + state observers
    // see it immediately) AND navigate to the signup URL so the
    // surface is shareable + refresh-safe. Direction A in
    // OnboardingShell will also call openGate when it sees the URL —
    // that call is idempotent (no-op when gate is already open).
    openGate("byo");
    navigate("/onboarding/signup");
  }, [openGate, navigate]);

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

      {/* `f3a-save-signin-gate-handoff`: pre-attached schema banner.
          When the user saved a custom schema on F3a and signed in to
          persist it, the resulting schema id lands on the session and
          this banner surfaces it on F1 so the next ingest pre-attaches
          the schema. Stays visible until the user picks a new sample
          (which clears the handoff on F2 transition) or signs out. */}
      {preAttachedSchemaId && (
        <Box
          data-testid="ingest-pre-attached-schema"
          sx={{
            mb: 2,
            p: 1.5,
            borderRadius: BORDER_RADIUS_SM,
            border: `1px dashed ${GREEN}`,
            backgroundColor: alpha(GREEN, 0.05),
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              color: NAVY,
              fontWeight: FONT_WEIGHT_LABEL,
              letterSpacing: LETTER_SPACING_LABEL,
              fontSize: FONT_SIZE_LABEL,
            }}
          >
            SCHEMA ATTACHED
          </Typography>
          <Typography variant="body2" sx={{ color: BODY_TEXT, fontFamily: "monospace" }}>
            {preAttachedSchemaId}
          </Typography>
        </Box>
      )}

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
          <RegistryStatusPanel
            tone="error"
            heading="Couldn't load samples"
            body={registry.error ?? "The middleware didn't respond."}
            onRetry={refreshRegistry}
          />
        ) : registry.scenarios.length === 0 ? (
          <RegistryStatusPanel
            tone="empty"
            heading="No samples available right now"
            body="Once a partner seeds the samples bucket, the tiles will appear here."
            onRetry={refreshRegistry}
          />
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
        <Typography sx={{ fontWeight: FONT_WEIGHT_HEADLINE, color: alpha(NAVY, 0.75), fontSize: "inherit" }}>
          capabilities demonstrated:
        </Typography>
        {CAPABILITIES.map((cap) => (
          <Stack key={cap.key} direction="row" alignItems="center" spacing={0.5}>
            <CapabilityBadge letter={cap.letter} live name={cap.name} size="sm" />
            <Typography sx={{ fontSize: "inherit" }}>{cap.name}</Typography>
          </Stack>
        ))}
        <Typography sx={{ fontStyle: "italic", color: BODY_TEXT, fontSize: "inherit" }}>
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
          color: BODY_TEXT,
          cursor: "pointer",
          width: "fit-content",
          borderRadius: BORDER_RADIUS_SM,
          px: 0.5,
          mx: -0.5,
          "&:hover": { color: NAVY, backgroundColor: alpha(NAVY, 0.04) },
          "&:focus-visible": { outline: `2px solid ${GREEN}`, outlineOffset: 2 },
        }}
      >
        <LockOutlinedIcon sx={{ fontSize: ICON_SIZE_INLINE }} />
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
                fontSize: FONT_SIZE_H5,
                fontWeight: FONT_WEIGHT_HEADLINE,
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
                  // role="img" makes `aria-label` a permitted attribute on this
                  // icon wrapper (a plain Box is role=generic, where aria-label is
                  // prohibited — axe `aria-prohibited-attr`). The label names the
                  // connector for AT; the SVG glyph itself is decorative.
                  role="img"
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
                fontWeight: FONT_WEIGHT_HEADLINE,
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
        <LockOutlinedIcon sx={{ fontSize: ICON_SIZE_INLINE }} />
        <Typography sx={{ fontSize: ONBOARDING_SMALL_TEXT_FONT_SIZE }}>
          Your docs are yours. GroundX never trains on uploaded content. Air-gapped on-prem available for regulated
          buyers.
        </Typography>
      </Stack>

      {/* Note: the gate is NOT rendered here. Clicking Sign Up advances
          to F2, which mounts the OnboardingShell's chat column; that
          column hosts <GateView /> whenever gate.status === "open" |
          "committed". F1 stays a clean full-bleed picker. */}

      <Box sx={{ visibility: "hidden", borderTop: `1px solid ${BORDER}`, mt: 4 }} aria-hidden />
    </Box>
  );
};

/**
 * Spans the full grid row above the sample tiles. Used for both the empty
 * state (registry ready, zero scenarios — bucket hasn't been seeded yet)
 * and the error state (registry fetch failed). Carries the Retry button
 * so the user can re-trigger the scenarios fetch without reloading the
 * whole page.
 */
function RegistryStatusPanel({
  tone,
  heading,
  body,
  onRetry,
}: {
  tone: "empty" | "error";
  heading: string;
  body: string;
  onRetry: () => void | Promise<void>;
}) {
  const accent = tone === "error" ? CORAL : alpha(NAVY, 0.55);
  return (
    <Box
      role={tone === "error" ? "alert" : undefined}
      sx={{
        gridColumn: "1 / -1",
        p: 2.5,
        borderRadius: BORDER_RADIUS,
        backgroundColor: tone === "error" ? alpha(CORAL, 0.06) : alpha(TINT, 0.6),
        border: `1px solid ${tone === "error" ? alpha(CORAL, 0.3) : alpha(NAVY, 0.12)}`,
      }}
    >
      <Typography
        sx={{
          color: tone === "error" ? CORAL : NAVY,
          fontWeight: FONT_WEIGHT_HEADLINE,
          fontSize: FONT_SIZE_H5,
          fontFamily: FONT_FAMILY_MARKETING,
          mb: 0.5,
        }}
      >
        {heading}
      </Typography>
      <Typography sx={{ color: BODY_TEXT, fontSize: FONT_SIZE_LABEL, mb: 1.5 }}>
        {body}
      </Typography>
      <Box
        component="button"
        type="button"
        onClick={() => void onRetry()}
        sx={{
          appearance: "none",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 0.5,
          px: 1.5,
          py: 0.5,
          borderRadius: BORDER_RADIUS_SM,
          border: `1.5px solid ${accent}`,
          backgroundColor: WHITE,
          color: tone === "error" ? CORAL : NAVY,
          fontFamily: FONT_FAMILY_MARKETING,
          fontSize: FONT_SIZE_LABEL,
          fontWeight: FONT_WEIGHT_LABEL,
          "&:hover": { backgroundColor: alpha(accent, 0.08) },
          "&:focus-visible": { outline: `2px solid ${GREEN}`, outlineOffset: 2 },
        }}
      >
        ↻ Retry
      </Box>
    </Box>
  );
}
