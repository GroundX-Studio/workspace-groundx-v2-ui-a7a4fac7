/**
 * P7 · Integrate — wire GroundX into your stack. Two doors: call the API
 * directly (REST + SDKs, code sample) or drop in an agent plugin (MCP-based
 * downloads). Logged-out: the API key, downloads, and workspace are gated; the
 * unlock banner re-opens the sign-in gate.
 */

import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";

import {
  BORDER,
  BORDER_RADIUS,
  BORDER_RADIUS_PILL,
  CORAL,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_LABEL,
  GRAY,
  GREEN,
  INPUT_BORDER,
  LETTER_SPACING_LABEL,
  MAIN_BACKGROUND,
  MUTED_ON_LIGHT,
  NAVY,
  TINT,
  WHITE,
} from "@/constants";
import { CommonSubmitButton } from "@/shared/components/CommonSubmitButton";

const PLUGINS = [
  { name: "Claude (Code / Cowork)", size: "2.1 MB" },
  { name: "OpenAI ChatGPT", size: "2.0 MB" },
  { name: "Gemini / Antigravity", size: "2.1 MB" },
  { name: "Cursor · Replit · OpenCode", size: "1.9 MB" },
];

const DoorHeading = ({ index, eyebrow, title, subtitle }: { index: string; eyebrow: string; title: string; subtitle: string }) => (
  <Box sx={{ mb: 1.5 }}>
    <Typography sx={{ fontSize: 10, fontWeight: FONT_WEIGHT_LABEL, letterSpacing: LETTER_SPACING_LABEL, color: CORAL }}>
      {index} · {eyebrow}
    </Typography>
    <Typography sx={{ fontSize: 16, fontWeight: 700, color: NAVY }}>{title}</Typography>
    <Typography sx={{ fontSize: 12, color: MUTED_ON_LIGHT }}>{subtitle}</Typography>
  </Box>
);

const CodeChip = ({ label }: { label: string }) => (
  <ButtonBase
    disableRipple
    aria-label={label}
    sx={{ px: 1.25, py: 0.5, borderRadius: BORDER_RADIUS_PILL, border: `1px solid ${INPUT_BORDER}`, fontSize: 12, fontWeight: 600, color: NAVY }}
  >
    {label}
  </ButtonBase>
);

export interface IntegrateCanvasProps {
  /** The sample bucket id used in the code sample. */
  sampleId?: string;
  /** Re-open the sign-in gate from the locked banner. */
  onUnlock?: () => void;
}

export const IntegrateCanvas = ({ sampleId = "your-bucket", onUnlock }: IntegrateCanvasProps) => (
  <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 2.5, backgroundColor: MAIN_BACKGROUND }}>
    {/* Locked banner */}
    <Stack
      direction="row"
      alignItems="center"
      spacing={2}
      sx={{ mb: 2, px: 2, py: 1.25, borderRadius: BORDER_RADIUS, backgroundColor: alpha(GREEN, 0.1), border: `1px solid ${alpha(GREEN, 0.4)}` }}
    >
      <LockOutlinedIcon sx={{ fontSize: 16, color: NAVY }} />
      <Typography sx={{ flex: 1, fontSize: 13, color: NAVY, minWidth: 0 }}>
        Locked behind sign-in: API key · plugin downloads · workspace
      </Typography>
      <CommonSubmitButton isUppercase={false} onClick={onUnlock} sx={{ fontSize: 13, flexShrink: 0 }}>
        unlock everything →
      </CommonSubmitButton>
    </Stack>

    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
      {/* API door */}
      <Box sx={{ flex: 1, minWidth: 260, p: 2, backgroundColor: WHITE, border: `1px solid ${BORDER}`, borderRadius: BORDER_RADIUS }}>
        <DoorHeading index="1" eyebrow="API" title="Call it directly" subtitle="REST + Python / TypeScript SDKs" />
        <Box
          component="pre"
          sx={{ m: 0, p: 1.5, backgroundColor: TINT, borderRadius: BORDER_RADIUS, fontSize: 12, lineHeight: 1.6, color: NAVY, overflowX: "auto", fontFamily: "monospace" }}
        >
          {`# ${sampleId}, your bucket\nfrom groundx import GroundX\ngx = GroundX(api_key=KEY)\ngx.extract(bucket="${sampleId}")`}
        </Box>
        <Stack direction="row" spacing={0.75} sx={{ mt: 1.25 }}>
          <CodeChip label="copy curl" />
          <CodeChip label="Python" />
          <CodeChip label="TS" />
        </Stack>
        <Box sx={{ mt: 2 }}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Typography sx={{ fontSize: 10, fontWeight: FONT_WEIGHT_LABEL, letterSpacing: LETTER_SPACING_LABEL, color: MUTED_ON_LIGHT }}>
              YOUR API KEY
            </Typography>
            <LockOutlinedIcon sx={{ fontSize: 12, color: MUTED_ON_LIGHT }} />
          </Stack>
          <Box sx={{ mt: 0.5, height: 14, borderRadius: 1, backgroundColor: GRAY, opacity: 0.7, filter: "blur(1px)" }} />
          <Typography sx={{ mt: 0.75, fontSize: 12, fontWeight: 600, color: CORAL }}>sign in to reveal →</Typography>
        </Box>
      </Box>

      {/* Agent plugins door */}
      <Box sx={{ flex: 1, minWidth: 260, p: 2, backgroundColor: WHITE, border: `1px solid ${BORDER}`, borderRadius: BORDER_RADIUS }}>
        <DoorHeading index="2" eyebrow="AGENT PLUGINS" title="Drop into your agent" subtitle="MCP-based · zero-config tool calls" />
        <Stack spacing={0.75}>
          {PLUGINS.map((plugin) => (
            <Stack
              key={plugin.name}
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{ px: 1.25, py: 0.75, border: `1px solid ${BORDER}`, borderRadius: BORDER_RADIUS }}
            >
              <Typography sx={{ fontSize: 10, fontWeight: 700, color: MUTED_ON_LIGHT }}>zip</Typography>
              <Typography sx={{ flex: 1, fontSize: 13, fontWeight: 600, color: NAVY, minWidth: 0 }} noWrap>
                {plugin.name}
              </Typography>
              <Typography sx={{ fontSize: FONT_SIZE_LABEL, color: MUTED_ON_LIGHT }}>{plugin.size}</Typography>
              <LockOutlinedIcon sx={{ fontSize: 13, color: MUTED_ON_LIGHT }} />
            </Stack>
          ))}
        </Stack>
        <Typography sx={{ mt: 1.25, fontSize: 12, fontWeight: 600, color: CORAL }}>sign in to download →</Typography>
        <Typography sx={{ mt: 0.5, fontSize: FONT_SIZE_LABEL, color: MUTED_ON_LIGHT }}>
          Each ships with a ready-to-use tool set.
        </Typography>
      </Box>
    </Box>
  </Box>
);

export default IntegrateCanvas;
