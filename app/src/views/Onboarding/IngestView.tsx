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
  BORDER_RADIUS_PILL,
  BORDER_RADIUS_SM,
  CORAL,
  CYAN,
  FONT_FAMILY_MARKETING,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_HEADLINE,
  FONT_WEIGHT_LABEL,
  GREEN,
  LETTER_SPACING_LABEL,
  NAVY,
  TINT,
  WHITE,
} from "@/constants";
import { useAppMode } from "@/contexts/AppModeContext";
import { useCanvasOrchestrator } from "@/contexts/CanvasOrchestratorContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { scenarioFixtures } from "@/fixtures";
import {
  CONNECTOR_KINDS,
  CONNECTOR_LABELS,
  ConnectorGlyph,
} from "@/shared/components/ConnectorGlyph";
import { DocThumb } from "@/shared/components/DocThumb";
import type { Scenario } from "@/types/onboarding";

import { GateView } from "./GateView";

const ROUGH_FILTER = "url(#wf-rough-lite)";

/**
 * F1 IngestView — composed against `spec-nav-v2.jsx Canvas_Ingest`.
 *
 * Layout (top → bottom):
 *   1. Hero: marketing-tier headline + brand-voice sub-line
 *   2. "TRY A SAMPLE · NO SIGN-UP" — 3 sample cards (Utility = ★ start here)
 *   3. Capability legend (E / I / R · filled vs hollow)
 *   4. "🔒 BRING YOUR OWN — SIGN UP FREE TO UNLOCK" — 3 BYO tiles
 *      (Upload files · Connect a source · Email it in) with diagonal stripe
 *      overlay so they read as one disabled section
 *   5. Privacy footer
 *
 * The step strip lives on the OnboardingShell side; this view fills the canvas
 * column. F1 hides nav + chat (handled by OnboardingShell).
 */
export const IngestView: FC = () => {
  const { setScenario } = useAppMode();
  const { state: session, pickScenario, advanceFrame, openGate, dismissGate } = useOnboardingSession();
  const { dispatch } = useCanvasOrchestrator();
  const gateOpenOrCommitted = session.gate.status === "open" || session.gate.status === "committed";
  const theme = useTheme();
  // Below md (1100): tablet + mobile. Drives the bottom-sheet gate so the
  // picker stays usable in a sliver-width window. Mobile-only finer
  // adjustments use the sx breakpoint object (xs/sm) inline.
  const compact = useMediaQuery(theme.breakpoints.down("md"));

  const handlePickScenario = useCallback(
    (scenario: Scenario) => {
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

  const capabilities = [
    { letter: "E" as const, name: "Extract", key: "extract" as const },
    { letter: "I" as const, name: "Interact", key: "interact" as const },
    { letter: "R" as const, name: "Report", key: "report" as const },
  ];

  return (
    <Box
      component="main"
      aria-label="Pick a starting point"
      sx={{
        // Desktop default = 1200 (matches MUI lg). Ultrawide (≥1600) bumps
        // to 1320 so the picker doesn't feel orphaned in the centre of a
        // 27" monitor — but stops short of "stretch to viewport", which
        // would make the BYO tiles read as too wide / too sparse.
        maxWidth: { xs: "100%", md: 1200, xl: 1320 },
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
            fontSize: { xs: 24, sm: 28, md: 34 },
            fontWeight: FONT_WEIGHT_HEADLINE,
            lineHeight: 1.05,
            color: NAVY,
            letterSpacing: "-0.01em",
          }}
        >
          Connect your data to GroundX.
        </Typography>
        {/* On mobile (xs only) we shrink the sub-line to one short clause —
            "one job per screen". Tablet + desktop get the full brand-voice
            sentence. */}
        <Typography
          variant="body1"
          sx={{ color: alpha(NAVY, 0.72), display: { xs: "none", sm: "block" } }}
        >
          GroundX works on the docs that break general-purpose AI — contracts, claims, policies, forms, technical
          diagrams. Try a sample, or bring your own.
        </Typography>
        <Typography
          variant="body2"
          sx={{ color: alpha(NAVY, 0.72), display: { xs: "block", sm: "none" } }}
        >
          Try a sample, or bring your own.
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
      {/* Cards: 1 column on xs/sm (mobile + tablet — easier to scan, ≥44px
          tap target), 3 columns on md+ (desktop). */}
      <Box
        role="list"
        aria-label="Sample scenarios"
        sx={{
          display: "grid",
          gap: { xs: 1, md: 1.5 },
          gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
        }}
      >
        {(Object.entries(scenarioFixtures) as Array<[Scenario, typeof scenarioFixtures[Scenario]]>).map(
          ([scenario, fixture], index) => {
            const isStartHere = index === 0;
            return (
              <Box
                key={scenario}
                role="listitem"
                tabIndex={0}
                data-testid={`sample-${scenario}`}
                aria-label={`Open sample: ${fixture.hero.title}`}
                onClick={() => handlePickScenario(scenario)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handlePickScenario(scenario);
                  }
                }}
                sx={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 140,
                  p: 1.75,
                  borderRadius: BORDER_RADIUS,
                  border: isStartHere ? `2px solid ${NAVY}` : `1.5px solid ${alpha(NAVY, 0.55)}`,
                  backgroundColor: WHITE,
                  // Wireframe `.wf-rough-lite` filter — gives the card a
                  // slightly-irregular hand-sketched edge while staying flat
                  // and brand-token-driven everywhere else.
                  filter: ROUGH_FILTER,
                  cursor: "pointer",
                  transition: "transform 120ms ease, border-color 120ms ease, box-shadow 120ms ease",
                  "&:hover": {
                    borderColor: NAVY,
                    transform: "translateY(-1px)",
                  },
                  "&:focus-visible": {
                    outline: `2px solid ${GREEN}`,
                    outlineOffset: 2,
                  },
                }}
              >
                {isStartHere ? (
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
                      fontSize: 11,
                      fontWeight: 700,
                      color: NAVY,
                      letterSpacing: "0.02em",
                    }}
                  >
                    ★ start here
                  </Box>
                ) : null}
                <Stack direction="row" spacing={1.5} sx={{ flex: 1, alignItems: "flex-start" }}>
                  <Box sx={{ position: "relative", flexShrink: 0 }}>
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
                      {fixture.hero.docCount}
                    </Box>
                  </Box>
                  <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
                    <Typography
                      sx={{
                        fontFamily: FONT_FAMILY_MARKETING,
                        fontSize: 18,
                        fontWeight: FONT_WEIGHT_HEADLINE,
                        lineHeight: 1.05,
                        color: NAVY,
                      }}
                    >
                      {fixture.hero.title}
                    </Typography>
                    <Typography sx={{ color: alpha(NAVY, 0.65), fontSize: 12, lineHeight: 1.35 }}>
                      {fixture.hero.shortDesc}
                    </Typography>
                  </Stack>
                </Stack>
                <Stack direction="row" alignItems="flex-end" spacing={1} sx={{ mt: 1 }}>
                  {/* "demonstrates" coral line — hides on mobile (xs) so the
                      tile keeps a calm two-line shape and the capability
                      badges still anchor the right edge. */}
                  <Typography
                    sx={{
                      flex: 1,
                      color: CORAL,
                      fontWeight: 700,
                      fontSize: 11.5,
                      lineHeight: 1.3,
                      letterSpacing: "0.01em",
                      display: { xs: "none", sm: "block" },
                    }}
                  >
                    {fixture.hero.demonstrates}
                  </Typography>
                  <Stack direction="row" spacing={0.5}>
                    {capabilities.map((cap) => {
                      const live = fixture.hero.chapters[cap.key] === "live";
                      return (
                        <Box
                          key={cap.key}
                          title={`${cap.name}${live ? " · live in this sample" : " · not in this sample"}`}
                          aria-hidden
                          sx={{
                            width: 20,
                            height: 20,
                            borderRadius: BORDER_RADIUS_SM,
                            backgroundColor: live ? GREEN : WHITE,
                            border: `1.5px solid ${live ? NAVY : alpha(NAVY, 0.25)}`,
                            color: live ? NAVY : alpha(NAVY, 0.4),
                            fontSize: 11,
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontFamily: FONT_FAMILY_MARKETING,
                          }}
                        >
                          {cap.letter}
                        </Box>
                      );
                    })}
                  </Stack>
                </Stack>
              </Box>
            );
          }
        )}
      </Box>

      {/* Capability legend — desktop-only. On tablet/mobile the per-tile
          badges (active E/I/R chips) already carry the meaning; the legend
          would only steal scroll real-estate. */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.25}
        sx={{
          mt: 1.25,
          color: alpha(NAVY, 0.6),
          fontSize: 11.5,
          display: { xs: "none", md: "flex" },
        }}
      >
        <Typography sx={{ fontWeight: 700, color: alpha(NAVY, 0.75), fontSize: "inherit" }}>
          capabilities demonstrated:
        </Typography>
        {capabilities.map((cap) => (
          <Stack key={cap.key} direction="row" alignItems="center" spacing={0.5}>
            <Box
              aria-hidden
              sx={{
                width: 16,
                height: 16,
                borderRadius: BORDER_RADIUS_SM,
                backgroundColor: GREEN,
                border: `1.2px solid ${NAVY}`,
                fontSize: 9,
                fontWeight: 700,
                color: NAVY,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: FONT_FAMILY_MARKETING,
              }}
            >
              {cap.letter}
            </Box>
            <Typography sx={{ fontSize: "inherit" }}>{cap.name}</Typography>
          </Stack>
        ))}
        <Typography sx={{ fontStyle: "italic", color: alpha(NAVY, 0.5), fontSize: "inherit" }}>
          hollow = not in this sample
        </Typography>
      </Stack>

      {/* BYO — header row stacks on mobile so the label keeps its full
          width and the annotation note flows underneath instead of getting
          crammed against the right edge or wrapping awkwardly. */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ xs: "flex-start", sm: "center" }}
        spacing={{ xs: 0.75, sm: 1.25 }}
        sx={{ mt: 4, mb: 1 }}
      >
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: alpha(NAVY, 0.5) }}>
          <LockOutlinedIcon sx={{ fontSize: 14 }} />
          <Typography
            variant="overline"
            sx={{
              color: alpha(NAVY, 0.5),
              fontWeight: FONT_WEIGHT_LABEL,
              letterSpacing: LETTER_SPACING_LABEL,
              fontSize: FONT_SIZE_LABEL,
              lineHeight: 1,
            }}
          >
            BRING YOUR OWN — SIGN UP FREE TO UNLOCK
          </Typography>
        </Stack>
        {/* Annotation — not interactive. Reads as a margin note explaining
            the BYO sign-up behavior. Wireframe used a green pill (`wf-anno`)
            but in production that visual idiom reads as a CTA, so we tone it
            down: subtle tinted background, italic, no border, no hover.
            Hidden below sm — on a phone the message reads as engineering
            jargon and clutters the picker. */}
        <Box
          aria-hidden
          sx={{
            display: { xs: "none", sm: "inline-flex" },
            alignItems: "center",
            gap: 0.5,
            px: 1,
            py: 0.25,
            borderRadius: BORDER_RADIUS_SM,
            backgroundColor: alpha(NAVY, 0.05),
            fontStyle: "italic",
            fontSize: 11,
            color: alpha(NAVY, 0.65),
            cursor: "default",
            userSelect: "none",
          }}
        >
          <Box component="span" aria-hidden sx={{ color: alpha(NAVY, 0.45), fontStyle: "normal" }}>↳</Box>
          Sign up triggers F1→F2 + loads the gate inline
        </Box>
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
            {/* Full 8-logo grid on sm+; a compact "8 sources" chip on xs
                so the tile stays one-line scannable. */}
            <Stack
              direction="row"
              flexWrap="wrap"
              sx={{ gap: 0.5, opacity: 0.7, display: { xs: "none", sm: "flex" } }}
            >
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
            <Box
              aria-label="8 sources"
              sx={{
                display: { xs: "inline-flex", sm: "none" },
                alignItems: "center",
                gap: 0.5,
                px: 1,
                py: 0.25,
                borderRadius: BORDER_RADIUS_PILL,
                border: `1px solid ${alpha(NAVY, 0.2)}`,
                backgroundColor: WHITE,
                fontSize: 11,
                fontWeight: 600,
                color: alpha(NAVY, 0.6),
              }}
            >
              8 sources
            </Box>
          </ByoTile>

          <ByoTile
            testId="byo-folder"
            title="Email it in"
            sub="forward any doc · ingests itself"
            cta="Sign up · email your docs"
            ctaIcon="✉"
            onClick={handleByoClick}
          >
            {/* Mono address box hides on xs — it's redundant with the title
                + sub, doesn't fit a 320-wide tile, and the full address is
                revealed post-signup anyway. */}
            <Box
              aria-hidden
              sx={{
                display: { xs: "none", sm: "inline-flex" },
                alignItems: "center",
                gap: 0.5,
                px: 1,
                py: 0.5,
                backgroundColor: alpha(WHITE, 0.7),
                border: `1px dashed ${alpha(NAVY, 0.3)}`,
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 10.5,
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

      {/* Privacy footer — desktop shows the full brand-voice line, mobile
          shows the short "we don't train on your docs" assurance only. */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 2, color: alpha(NAVY, 0.6) }}>
        <LockOutlinedIcon sx={{ fontSize: 14 }} />
        <Typography sx={{ fontSize: 11.5, display: { xs: "none", sm: "block" } }}>
          Your docs are yours. GroundX never trains on uploaded content. Air-gapped on-prem available for regulated
          buyers.
        </Typography>
        <Typography sx={{ fontSize: 11.5, display: { xs: "block", sm: "none" } }}>
          Your docs are yours. We never train on them.
        </Typography>
      </Stack>

      {/* F6 gate — inline next to the picker on desktop (md+), or a bottom
          sheet Drawer on tablet/mobile so the picker stays visible behind
          and the form claims comfortable space on a narrow viewport. Per
          spec the gate is never modal in the dimmed-overlay sense; the
          Drawer here uses a translucent backdrop only so the user retains
          the "browse samples" affordance by tapping outside the sheet. */}
      {gateOpenOrCommitted && !compact ? (
        <Box sx={{ mt: 4, maxWidth: 460, mx: "auto" }}>
          <GateView />
        </Box>
      ) : null}

      {/* GateView already provides its own close X + "Keep exploring
          samples" link, so we render it bare inside the Drawer — no extra
          IconButton, no extra Card chrome. The Drawer Paper supplies the
          bottom-sheet surface; the GateView Card sits inside it.
          Content-sized rather than fullscreen: the user's instinct on a
          bottom sheet is "this didn't take over my screen, I can still see
          my samples behind it," which matches the spec's "never modal"
          framing. Tap outside or the sheet's close X to dismiss. */}
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

/** Small document icon with a count badge, matches the spec card hero. */
function DocIcon({ count }: { count: string }) {
  return (
    <Box sx={{ position: "relative", flexShrink: 0 }}>
      <Box
        aria-hidden
        sx={{
          width: 38,
          height: 48,
          borderRadius: BORDER_RADIUS_SM,
          backgroundColor: WHITE,
          border: `1.5px solid ${alpha(NAVY, 0.35)}`,
          position: "relative",
          "&::before": {
            content: '""',
            position: "absolute",
            top: 5,
            left: 6,
            right: 18,
            height: 1.5,
            backgroundColor: alpha(NAVY, 0.2),
          },
          "&::after": {
            content: '""',
            position: "absolute",
            top: 11,
            left: 6,
            right: 12,
            height: 1.5,
            backgroundColor: alpha(NAVY, 0.18),
            boxShadow: `0 5px 0 ${alpha(NAVY, 0.16)}, 0 10px 0 ${alpha(NAVY, 0.14)}, 0 15px 0 ${alpha(NAVY, 0.12)}`,
          },
        }}
      />
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          bottom: -6,
          right: -8,
          minWidth: 20,
          height: 18,
          px: 0.75,
          borderRadius: BORDER_RADIUS_PILL,
          backgroundColor: CYAN,
          border: `1.5px solid ${NAVY}`,
          fontFamily: FONT_FAMILY_MARKETING,
          fontSize: 10,
          fontWeight: 700,
          color: NAVY,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {count}
      </Box>
    </Box>
  );
}

/** Locked BYO tile — accepts a child for the inline affordance (icon, chips, email box). */
function ByoTile({
  testId,
  title,
  sub,
  cta,
  ctaIcon,
  onClick,
  accent,
  children,
}: {
  testId: string;
  title: string;
  sub: string;
  cta: string;
  ctaIcon: string;
  onClick: () => void;
  accent?: "dashed";
  children: React.ReactNode;
}) {
  return (
    <Box
      role="listitem"
      tabIndex={0}
      data-testid={testId}
      aria-label={`${title} (sign-in required)`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      sx={{
        height: 134,
        p: 1.5,
        boxSizing: "border-box",
        borderRadius: BORDER_RADIUS,
        border: accent === "dashed" ? `2px dashed ${alpha(NAVY, 0.25)}` : `1.5px solid ${alpha(NAVY, 0.25)}`,
        backgroundColor: alpha(TINT, 0.6),
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        cursor: "pointer",
        filter: "grayscale(0.35)",
        "&:hover": { filter: "grayscale(0.15)" },
        "&:focus-visible": { outline: `2px solid ${GREEN}`, outlineOffset: 2 },
      }}
    >
      <Box sx={{ display: "flex", gap: 1.25 }}>
        <Box sx={{ flexShrink: 0 }}>{children && accent === "dashed" ? children : null}</Box>
        <Stack spacing={0.25} sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontFamily: FONT_FAMILY_MARKETING,
              fontSize: 17,
              fontWeight: FONT_WEIGHT_HEADLINE,
              lineHeight: 1.1,
              color: alpha(NAVY, 0.7),
            }}
          >
            {title}
          </Typography>
          <Typography sx={{ fontSize: 11.5, color: alpha(NAVY, 0.55) }}>{sub}</Typography>
          {!(children && accent === "dashed") ? <Box sx={{ mt: 0.75 }}>{children}</Box> : null}
        </Stack>
      </Box>
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.75,
          alignSelf: "stretch",
          justifyContent: "center",
          px: 1.25,
          py: 0.5,
          borderRadius: BORDER_RADIUS_PILL,
          border: `1.5px solid ${GREEN}`,
          color: NAVY,
          backgroundColor: WHITE,
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        <Box component="span" sx={{ color: GREEN, fontWeight: 700 }}>
          {ctaIcon}
        </Box>
        {cta}
      </Box>
    </Box>
  );
}
