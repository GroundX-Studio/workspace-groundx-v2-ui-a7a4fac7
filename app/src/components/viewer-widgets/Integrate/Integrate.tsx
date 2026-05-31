import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { useState, type FC, type SyntheticEvent } from "react";

import type { ContentScope, WidgetRole } from "@groundx/shared";

import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS,
  BORDER_RADIUS_PILL,
  EYEBROW_ON_LIGHT,
  FONT_SIZE_CAPTION,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_LABEL,
  NAVY,
  WHITE,
} from "@/constants";
import { useAppMode } from "@/contexts/AppModeContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";

import { CODE_FOR, PLUGINS } from "./integrateConnectors";

/**
 * Integrate — the production connectors/plugins ScopedViewerWidget.
 *
 * 2026-05-30-onboarding-shell-shared-view Phase 3b PACKAGED the F7 connectors
 * surface (previously `views/Onboarding/IntegrateView.tsx`) as a
 * `ScopedViewerWidget` (PdfViewer · Extract · SmartReport · Integrate). Per
 * `feedback_no_onboarding_duplicates` onboarding + steady share ONE widget set;
 * `IntegrateView` is now a thin wrapper that mounts this. NOT a
 * reimplementation — the connector/plugin cards + API snippets + next-steps
 * guts are lifted verbatim from `IntegrateView`.
 *
 * The widget-contract requires a `scope: ContentScope` for every
 * ScopedViewerWidget; the connectors list is scope-independent today (the same
 * four cards render for any scope), but the widget ACCEPTS it for contract
 * conformance + so the canvas-dispatch `show_integrate` tool can thread the
 * transition-surface scope through. Per `widget-role-access`,
 * `role: WidgetRole` is the authorization axis (surfaced via `data-role`).
 *
 * The connector DOWNLOAD buttons are intentionally aria-disabled no-ops
 * deferred to UI-02 (the agent-integration download pipeline). They stay
 * honestly disabled-future with an aria-disabled + title; the SURFACE (the
 * cards) is the real content this widget makes reachable.
 */
export interface IntegrateProps {
  /**
   * REQUIRED content scope (ScopedViewerWidget contract). The connectors list
   * is scope-independent today (the cards render the same for any scope), but
   * the contract requires it + the `show_integrate` tool threads the
   * transition-surface scope through.
   */
  scope: ContentScope;
  /**
   * Authorization role (`anonymous` | `member`). Surfaced via `data-role` on
   * the root. The connectors surface is available to both roles; the only
   * deferred affordance is the UI-02 download (disabled for everyone).
   */
  role: WidgetRole;
}

export const Integrate: FC<IntegrateProps> = ({ scope, role }) => {
  void scope; // scope-independent today; accepted for contract conformance.
  const { state: appMode } = useAppMode();
  const { state: session } = useOnboardingSession();
  const scenario = appMode.scenario ?? session.scenario ?? "utility";
  const [tab, setTab] = useState<"curl" | "python" | "typescript">("curl");

  const handleTab = (_event: SyntheticEvent, value: "curl" | "python" | "typescript") => setTab(value);

  return (
    <Box
      data-testid="integrate"
      data-role={role}
      sx={{ p: { xs: 2, md: 4 }, height: "100%", overflow: "auto" }}
      aria-label="Integrate"
    >
      <Stack spacing={0.5} sx={{ mb: 3 }}>
        <Typography variant="overline" sx={{ color: EYEBROW_ON_LIGHT, fontWeight: FONT_WEIGHT_LABEL }}>
          INTEGRATE
        </Typography>
        <Typography variant="h4">Ship the same answer into your stack.</Typography>
        <Typography variant="body2" sx={{ color: BODY_TEXT }}>
          The {scenario === "utility" ? "Utility" : scenario === "loan" ? "Loan" : "Solar"} sample becomes a live
          GroundX project the moment you sign in.
        </Typography>
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "2fr 1fr" }, gap: 2 }}>
        <Card sx={{ p: 0, overflow: "hidden" }}>
          <Tabs value={tab} onChange={handleTab} aria-label="API snippet language">
            <Tab value="curl" label="cURL" />
            <Tab value="python" label="Python" />
            <Tab value="typescript" label="TypeScript" />
          </Tabs>
          <Box
            component="pre"
            data-testid="integrate-snippet"
            sx={{
              fontFamily: "monospace",
              fontSize: FONT_SIZE_CAPTION,
              p: 2,
              m: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: NAVY,
              backgroundColor: WHITE,
              borderTop: `1px solid ${BORDER}`,
            }}
          >
            {CODE_FOR[tab]}
          </Box>
        </Card>

        <Stack spacing={2}>
          <Card sx={{ p: 2 }}>
            <Typography variant="overline" sx={{ color: NAVY, fontWeight: FONT_WEIGHT_LABEL }}>
              AGENT INTEGRATIONS
            </Typography>
            <Stack spacing={1} sx={{ mt: 1 }}>
              {PLUGINS.map((plugin) => (
                <Box
                  key={plugin.id}
                  data-testid={`plugin-${plugin.id}`}
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    p: 1.25,
                    border: `1px solid ${BORDER}`,
                    borderRadius: BORDER_RADIUS,
                  }}
                >
                  <Stack spacing={0}>
                    <Typography variant="body2" sx={{ fontWeight: FONT_WEIGHT_LABEL, color: NAVY }}>
                      {plugin.label}
                    </Typography>
                    <Typography variant="caption" sx={{ color: BODY_TEXT }}>
                      {plugin.desc}
                    </Typography>
                  </Stack>
                  {/* UI-02: the plugin Download button is non-functional
                      pending the agent-plugin artifact pipeline. Surface
                      the not-yet state so a clicker doesn't get a silent
                      no-op. Aria-disabled + cursor + visual treatment
                      all read as "labeled, not interactive." */}
                  <Box
                    role="button"
                    aria-disabled="true"
                    tabIndex={-1}
                    title="Plugin downloads ship with the agent integration pipeline (UI-02)."
                    data-testid={`plugin-${plugin.id}-download`}
                    sx={{
                      px: 1.5,
                      py: 0.5,
                      borderRadius: BORDER_RADIUS_PILL,
                      backgroundColor: BORDER,
                      color: BODY_TEXT,
                      fontWeight: FONT_WEIGHT_LABEL,
                      fontSize: FONT_SIZE_LABEL,
                      cursor: "not-allowed",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Coming soon
                  </Box>
                </Box>
              ))}
            </Stack>
          </Card>

          <Card sx={{ p: 2 }}>
            <Typography variant="overline" sx={{ color: NAVY, fontWeight: FONT_WEIGHT_LABEL }}>
              NEXT STEPS
            </Typography>
            <Stack spacing={0.5} sx={{ mt: 1 }}>
              <Typography variant="body2">→ Manage API keys</Typography>
              <Typography variant="body2">→ Read the docs</Typography>
              <Typography variant="body2">→ Connect this sample to your workflow</Typography>
            </Stack>
          </Card>
        </Stack>
      </Box>
    </Box>
  );
};
