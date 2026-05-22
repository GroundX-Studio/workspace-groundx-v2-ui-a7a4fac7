import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useCallback, type FC } from "react";

import { BORDER, BODY_TEXT, CYAN, EYEBROW_ON_LIGHT, FONT_WEIGHT_LABEL, NAVY } from "@/constants";
import { useAppMode } from "@/contexts/AppModeContext";
import { useCanvasOrchestrator } from "@/contexts/CanvasOrchestratorContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { scenarioFixtures } from "@/fixtures";
import type { Scenario } from "@/types/onboarding";

import { GateView } from "./GateView";

const CAPABILITY_LABEL: Record<"E" | "I" | "R", string> = {
  E: "Extract",
  I: "Interact",
  R: "Report",
};

/**
 * F1 IngestView — the user's first surface.
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │  Pick a sample to see GroundX in action             │
 *   │                                                     │
 *   │  [Utility]  [Loan]  [Solar]                         │
 *   │                                                     │
 *   │  — or bring your own —                              │
 *   │  [📤 Drop a PDF]  [🔗 Paste URL]  [📁 Folder]       │
 *   └─────────────────────────────────────────────────────┘
 *
 * No nav, no chat. The transition into F2 mounts both via [[AppShell]].
 */
export const IngestView: FC = () => {
  const { setScenario } = useAppMode();
  const { state: session, pickScenario, advanceFrame, openGate } = useOnboardingSession();
  const { dispatch } = useCanvasOrchestrator();
  const gateOpenOrCommitted = session.gate.status === "open" || session.gate.status === "committed";

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
    // BYO upload requires sign-in per decision #10. Open the gate.
    openGate("byo");
  }, [openGate]);

  return (
    <Box
      component="main"
      aria-label="Pick a starting point"
      sx={{
        maxWidth: 920,
        mx: "auto",
        my: { xs: 4, md: 10 },
        px: { xs: 2, md: 4 },
      }}
    >
      <Stack spacing={1.5} sx={{ mb: 5 }}>
        <Typography variant="overline" sx={{ color: EYEBROW_ON_LIGHT, fontWeight: FONT_WEIGHT_LABEL }}>
          INGEST
        </Typography>
        <Typography variant="h2">Pick a sample to see GroundX in action.</Typography>
        <Typography variant="body1" sx={{ color: BODY_TEXT }}>
          Each sample drives a different combination of extract, interact, and report. Or bring your own — pre-sign-in,
          we'll meter your pages so you can try before signing up.
        </Typography>
      </Stack>

      <Stack spacing={2}>
        <Typography variant="overline" sx={{ color: NAVY, fontWeight: FONT_WEIGHT_LABEL }}>
          SAMPLES
        </Typography>

        <Box
          role="list"
          aria-label="Sample scenarios"
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
          }}
        >
          {(Object.entries(scenarioFixtures) as Array<[Scenario, typeof scenarioFixtures[Scenario]]>).map(
            ([scenario, fixture]) => (
              <Card key={scenario} role="listitem">
                <CardActionArea
                  onClick={() => handlePickScenario(scenario)}
                  data-testid={`sample-${scenario}`}
                  sx={{ p: 3, height: "100%", textAlign: "left" }}
                >
                  <Stack spacing={1.5}>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      {fixture.hero.badges.map((badge) => (
                        <Chip
                          key={badge}
                          label={CAPABILITY_LABEL[badge]}
                          size="small"
                          sx={{ backgroundColor: CYAN, color: NAVY, fontSize: 11, height: 22 }}
                        />
                      ))}
                    </Stack>
                    <Typography variant="h5">{fixture.hero.title}</Typography>
                    <Typography variant="body2" sx={{ color: BODY_TEXT }}>
                      {fixture.hero.subtitle}
                    </Typography>
                  </Stack>
                </CardActionArea>
              </Card>
            )
          )}
        </Box>
      </Stack>

      <Stack spacing={2} sx={{ mt: 6 }}>
        <Typography variant="overline" sx={{ color: NAVY, fontWeight: FONT_WEIGHT_LABEL }}>
          OR BRING YOUR OWN
        </Typography>
        <Box
          role="list"
          aria-label="Bring your own"
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
          }}
        >
          {[
            { id: "byo-pdf", icon: <CloudUploadOutlinedIcon />, label: "Drop a PDF" },
            { id: "byo-url", icon: <LinkOutlinedIcon />, label: "Paste a URL" },
            { id: "byo-folder", icon: <DescriptionOutlinedIcon />, label: "Pick a folder" },
          ].map((tile) => (
            <Card key={tile.id} role="listitem">
              <CardActionArea onClick={handleByoClick} data-testid={tile.id} sx={{ p: 3, height: "100%" }}>
                <Stack spacing={1.5} alignItems="flex-start">
                  <Box sx={{ color: NAVY, "& svg": { fontSize: 28 } }}>{tile.icon}</Box>
                  <Typography variant="h6">{tile.label}</Typography>
                  <Typography variant="body2" sx={{ color: BODY_TEXT }}>
                    Sign in required · pre-sign-in samples are free.
                  </Typography>
                </Stack>
              </CardActionArea>
            </Card>
          ))}
        </Box>
        <Typography variant="caption" sx={{ color: BODY_TEXT, mt: 1 }}>
          Pre-sign-in we cap BYO at 100 pages of content. Sign in any time to lift the cap.
        </Typography>
      </Stack>

      {/* F6 gate renders inline on F1 when triggered by BYO (and on
          re-trigger from a future threshold). Per spec the gate is never
          modal — it lives next to the picker so the user can still browse
          samples without losing the offer. */}
      {gateOpenOrCommitted ? (
        <Box sx={{ mt: 5, maxWidth: 460, mx: "auto" }}>
          <GateView collapseOnCommit />
        </Box>
      ) : null}

      <Box sx={{ visibility: "hidden", borderTop: `1px solid ${BORDER}`, mt: 6 }} aria-hidden />
    </Box>
  );
};
