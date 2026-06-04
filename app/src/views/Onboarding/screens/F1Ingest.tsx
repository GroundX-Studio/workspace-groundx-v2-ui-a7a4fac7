/**
 * F1 · Ingest · pick a source (no chat yet).
 *
 * The full-width entry frame: try a preloaded sample with no sign-up, or bring
 * your own (sign-up required). Picking a sample advances into the split layout.
 * Copy mirrors the spec's F1 frame.
 */

import AlternateEmailOutlinedIcon from "@mui/icons-material/AlternateEmailOutlined";
import CloudSyncOutlinedIcon from "@mui/icons-material/CloudSyncOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { ReactNode } from "react";

import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS,
  CORAL,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_LABEL,
  GRAY,
  GREEN,
  LETTER_SPACING_LABEL,
  MUTED_ON_LIGHT,
  NAVY,
  TINT,
} from "@/constants";
import { CommonSubmitButton } from "@/shared/components/CommonSubmitButton";
import { GxCard } from "@/shared/components/GxCard";
import { GxPill } from "@/shared/components/GxPill";
import { onEnterOrSpace } from "@/shared/utils/onEnterOrSpace";

import { CapabilityPills } from "../components/CapabilityPills";
import { SAMPLES } from "../flow/flowData";
import { SampleProject } from "../flow/flowTypes";
import { useFlow } from "../flow/FlowContext";

const Eyebrow = ({ children, icon }: { children: ReactNode; icon?: ReactNode }) => (
  <Stack direction="row" spacing={0.75} alignItems="center">
    {icon}
    <Typography
      component="span"
      sx={{ fontSize: FONT_SIZE_LABEL, fontWeight: FONT_WEIGHT_LABEL, letterSpacing: LETTER_SPACING_LABEL, color: NAVY }}
    >
      {children}
    </Typography>
  </Stack>
);

const SampleCard = ({ sample, onPick }: { sample: SampleProject; onPick: (sample: SampleProject) => void }) => (
  <GxCard
    interactive
    role="button"
    tabIndex={0}
    aria-label={`Try the ${sample.name} sample`}
    onClick={() => onPick(sample)}
    onKeyDown={onEnterOrSpace(() => onPick(sample))}
    sx={{ position: "relative", display: "flex", flexDirection: "column", gap: 1.5 }}
  >
    {sample.startHere ? (
      <Box
        sx={{
          position: "absolute",
          top: -10,
          right: 16,
          px: 1,
          py: 0.25,
          borderRadius: 999,
          backgroundColor: GREEN,
          color: NAVY,
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        ★ start here
      </Box>
    ) : null}

    <Stack direction="row" spacing={1.5} alignItems="flex-start">
      <Box
        sx={{
          width: 44,
          height: 44,
          flexShrink: 0,
          borderRadius: BORDER_RADIUS,
          backgroundColor: TINT,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: NAVY,
        }}
      >
        <DescriptionOutlinedIcon />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, color: NAVY, fontSize: 16 }}>{sample.name}</Typography>
        <Typography sx={{ fontSize: 13, color: BODY_TEXT, mt: 0.25 }}>{sample.blurb}</Typography>
      </Box>
    </Stack>

    <Box>
      <GxPill>{sample.docLabel}</GxPill>
    </Box>

    <Box sx={{ flex: 1 }} />

    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
      <Typography sx={{ fontSize: 12, fontStyle: "italic", color: CORAL, fontWeight: 600 }}>{sample.outcome}</Typography>
      <CapabilityPills active={sample.capabilities} />
    </Stack>
  </GxCard>
);

interface ByoOption {
  icon: ReactNode;
  title: string;
  detail: string;
  cta: string;
  children?: ReactNode;
}

const ByoCard = ({ option }: { option: ByoOption }) => (
  <GxCard sx={{ display: "flex", flexDirection: "column", gap: 1.5, borderStyle: "dashed" }}>
    <Stack direction="row" spacing={1.25} alignItems="center">
      <Box
        sx={{
          width: 40,
          height: 40,
          flexShrink: 0,
          borderRadius: BORDER_RADIUS,
          border: `1px dashed ${BORDER}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: MUTED_ON_LIGHT,
        }}
      >
        {option.icon}
      </Box>
      <Box>
        <Typography sx={{ fontWeight: 700, color: NAVY, fontSize: 15 }}>{option.title}</Typography>
        <Typography sx={{ fontSize: 12.5, color: MUTED_ON_LIGHT }}>{option.detail}</Typography>
      </Box>
    </Stack>
    {option.children ? <Box sx={{ flex: 1 }}>{option.children}</Box> : <Box sx={{ flex: 1 }} />}
    <CommonSubmitButton fullWidth invert isUppercase={false} sx={{ fontSize: 13 }}>
      {option.cta}
    </CommonSubmitButton>
  </GxCard>
);

const SourceIconRow = () => (
  <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
    {["Drive", "OneDrive", "SharePoint", "Dropbox", "Box", "Slack", "Notion"].map((name) => (
      <Box
        key={name}
        title={name}
        sx={{
          width: 26,
          height: 26,
          borderRadius: 1,
          backgroundColor: GRAY,
          border: `1px solid ${BORDER}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 700,
          color: MUTED_ON_LIGHT,
        }}
      >
        {name.slice(0, 1)}
      </Box>
    ))}
  </Stack>
);

const byoOptions: ByoOption[] = [
  {
    icon: <UploadFileOutlinedIcon />,
    title: "Upload files",
    detail: "drag & drop · PDF · DOCX · XLSX",
    cta: "Sign up · upload your docs",
  },
  {
    icon: <CloudSyncOutlinedIcon />,
    title: "Connect a source",
    detail: "sync from where your docs live",
    cta: "Sign up · connect your sources",
    children: <SourceIconRow />,
  },
  {
    icon: <AlternateEmailOutlinedIcon />,
    title: "Email it in",
    detail: "forward any doc · ingests itself",
    cta: "Sign up · email your docs",
    children: (
      <Box
        sx={{
          px: 1.25,
          py: 0.75,
          borderRadius: BORDER_RADIUS,
          backgroundColor: TINT,
          fontSize: 13,
          fontWeight: 600,
          color: NAVY,
        }}
      >
        ✉ ingest@groundx.ai
      </Box>
    ),
  },
];

export function F1Ingest() {
  const { selectSample } = useFlow();

  return (
    <Box sx={{ maxWidth: 1080, mx: "auto", px: { xs: 2, md: 4 }, py: { xs: 3, md: 4 } }}>
      <Typography variant="h2" sx={{ color: NAVY }}>
        Connect your data to GroundX.
      </Typography>
      <Typography sx={{ mt: 1, fontSize: 15, color: BODY_TEXT, maxWidth: 760 }}>
        GroundX works on the docs that break general-purpose AI — contracts, claims, policies, forms, technical diagrams. Try a
        sample, or bring your own (sign-up required).
      </Typography>

      {/* Try a sample */}
      <Box sx={{ mt: 4 }}>
        <Eyebrow>TRY A SAMPLE · NO SIGN-UP</Eyebrow>
        <Box
          sx={{
            mt: 1.5,
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" },
          }}
        >
          {SAMPLES.map((sample) => (
            <SampleCard key={sample.id} sample={sample} onPick={selectSample} />
          ))}
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1.5, flexWrap: "wrap", rowGap: 1 }}>
          <Typography sx={{ fontSize: FONT_SIZE_LABEL, fontWeight: FONT_WEIGHT_LABEL, color: MUTED_ON_LIGHT }}>
            capabilities demonstrated:
          </Typography>
          <CapabilityPills active={["E", "I", "R"]} legend />
          <Typography sx={{ fontSize: 12, fontStyle: "italic", color: MUTED_ON_LIGHT }}>
            hollow = not in this sample
          </Typography>
        </Stack>
      </Box>

      {/* Bring your own */}
      <Box sx={{ mt: 4 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 1 }}>
          <Eyebrow icon={<LockOutlinedIcon sx={{ fontSize: 14, color: MUTED_ON_LIGHT }} />}>
            BRING YOUR OWN — SIGN UP FREE TO UNLOCK
          </Eyebrow>
          <Box
            sx={{
              px: 1,
              py: 0.25,
              borderRadius: 999,
              backgroundColor: alpha(GREEN, 0.25),
              border: `1px solid ${GREEN}`,
              fontSize: 11,
              fontWeight: 600,
              color: NAVY,
            }}
          >
            ↪ Sign up loads the gate inline in chat
          </Box>
        </Stack>
        <Box
          sx={{
            mt: 1.5,
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" },
          }}
        >
          {byoOptions.map((option) => (
            <ByoCard key={option.title} option={option} />
          ))}
        </Box>
      </Box>

      {/* Trust footer */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 4 }}>
        <LockOutlinedIcon sx={{ fontSize: 14, color: MUTED_ON_LIGHT }} />
        <Typography sx={{ fontSize: 12.5, color: MUTED_ON_LIGHT }}>
          Your docs are yours. GroundX never trains on uploaded content. Air-gapped on-prem available for regulated buyers.
        </Typography>
      </Stack>
    </Box>
  );
}

export default F1Ingest;
