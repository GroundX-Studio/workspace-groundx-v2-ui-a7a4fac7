import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { useState, type FC, type SyntheticEvent } from "react";

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

const codeFor: Record<string, string> = {
  curl: `curl -X POST https://api.groundx.ai/api/v1/search/<projectId> \\
  -H "X-API-Key: $YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "query": "What was the largest charge category?" }'`,
  python: `from groundx import GroundX
g = GroundX(api_key="$YOUR_KEY")
r = g.search.content(project_id=PROJECT, query="What was the largest charge category?")
print(r.results[0].text)`,
  typescript: `import { GroundX } from "groundx";
const g = new GroundX({ apiKey: process.env.GROUNDX_API_KEY });
const r = await g.search.content({ projectId: PROJECT, query: "..." });`,
};

const PLUGINS = [
  { id: "claude", label: "Claude", desc: "Add GroundX as a Claude tool" },
  { id: "openai", label: "OpenAI", desc: "Function-calling integration for GPT" },
  { id: "gemini", label: "Gemini", desc: "Tool-use integration for Gemini" },
  { id: "cursor", label: "Cursor", desc: "Cursor IDE MCP server" },
];

/**
 * F7 IntegrateView — post-gate "ship it" surface.
 *
 * Three columns:
 *   • API snippets (curl / Python / TypeScript) — switchable
 *   • Agent plugins (Claude / OpenAI / Gemini / Cursor) — download buttons
 *   • Next-steps card (linking to API keys + Docs)
 *
 * For v1 there is NO Saved Artifacts pane — that lives in steady-mode.
 */
export const IntegrateView: FC = () => {
  const { state: appMode } = useAppMode();
  const { state: session } = useOnboardingSession();
  const scenario = appMode.scenario ?? session.scenario ?? "utility";
  const [tab, setTab] = useState<"curl" | "python" | "typescript">("curl");

  const handleTab = (_event: SyntheticEvent, value: "curl" | "python" | "typescript") => setTab(value);

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, height: "100%", overflow: "auto" }} aria-label="Integrate">
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
            {codeFor[tab]}
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
