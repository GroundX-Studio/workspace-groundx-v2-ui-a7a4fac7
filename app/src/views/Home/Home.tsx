import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { EducationalTooltip } from "@/shared/components/EducationalTooltip";
import { GxCard } from "@/shared/components/GxCard";
import { GxSectionHeader } from "@/shared/components/GxSectionHeader";
import { BODY_TEXT, GREEN, NAVY, TINT } from "@/constants";

const summaryCards = [
  {
    label: "Projects",
    value: "3",
    detail: "Active knowledge workspaces",
    icon: <FolderOutlinedIcon aria-hidden="true" />,
  },
  {
    label: "Documents",
    value: "128",
    detail: "Indexed and ready to search",
    icon: <SearchOutlinedIcon aria-hidden="true" />,
  },
  {
    label: "Automations",
    value: "6",
    detail: "Grounded workflows online",
    icon: <HubOutlinedIcon aria-hidden="true" />,
  },
];

const activityItems = [
  "Customer onboarding guide indexed",
  "Support workflow refreshed",
  "Quarterly report draft generated",
];

export const Home = () => {
  return (
    <Stack spacing={3}>
      <Stack spacing={0.75}>
        <Stack direction="row" alignItems="center" spacing={0.75}>
          <Typography component="h1" variant="h4" fontWeight={700} color={NAVY}>
            Studio Workspace
          </Typography>
          <EducationalTooltip
            ariaLabel="About the workspace overview"
            title="This protected starter view is the first place to shape the product workflow, dashboard metrics, and GroundX-powered actions."
          />
        </Stack>
        <Typography variant="body1" color={BODY_TEXT} sx={{ maxWidth: 760 }}>
          A ready starting point for authenticated GroundX products, with local middleware, session-aware API proxying, and
          design-system components already wired.
        </Typography>
      </Stack>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" },
        }}
      >
        {summaryCards.map((card) => (
          <GxCard key={card.label} radius="sm">
            <Stack spacing={1.5}>
              <Box
                sx={{
                  alignItems: "center",
                  backgroundColor: TINT,
                  borderRadius: 1.5,
                  color: NAVY,
                  display: "flex",
                  height: 40,
                  justifyContent: "center",
                  width: 40,
                }}
              >
                {card.icon}
              </Box>
              <Stack spacing={0.25}>
                <Typography variant="h4" fontWeight={700} color={NAVY}>
                  {card.value}
                </Typography>
                <Typography variant="subtitle2" fontWeight={700} color={NAVY}>
                  {card.label}
                </Typography>
                <Typography variant="body2" color={BODY_TEXT}>
                  {card.detail}
                </Typography>
              </Stack>
            </Stack>
          </GxCard>
        ))}
      </Box>

      <GxCard>
        <GxSectionHeader
          label="NEXT WORKFLOW"
          education={
            <EducationalTooltip
              ariaLabel="About the next workflow"
              title="Use this section for the primary job your user needs to complete, then connect it to GroundX data and LLM actions through the middleware."
            />
          }
          action={
            <Chip
              icon={<AutoAwesomeOutlinedIcon />}
              label="Ready for agent work"
              sx={{ backgroundColor: GREEN, color: NAVY, fontWeight: 700 }}
            />
          }
        />
        <Divider sx={{ my: 2 }} />
        <Stack spacing={1.5}>
          <Typography variant="h5" fontWeight={700} color={NAVY}>
            Build the first customer workflow here
          </Typography>
          <Typography variant="body2" color={BODY_TEXT} sx={{ maxWidth: 780 }}>
            Add the product-specific form, search, report, extraction, or chat experience to this page. Keep browser code on
            same-origin `/api` routes and let middleware own all GroundX, Partner, and LLM credentials.
          </Typography>
        </Stack>
      </GxCard>

      <GxCard>
        <GxSectionHeader
          label="RECENT ACTIVITY"
          education={
            <EducationalTooltip
              ariaLabel="About recent activity"
              title="Activity rows are intentionally plain so agents can replace them with project events, document ingestion, or workflow status."
            />
          }
        />
        <Divider sx={{ my: 2 }} />
        <Stack spacing={1.25}>
          {activityItems.map((item) => (
            <Stack key={item} direction="row" alignItems="center" spacing={1.5}>
              <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: GREEN, flexShrink: 0 }} />
              <Typography variant="body2" color={BODY_TEXT}>
                {item}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </GxCard>
    </Stack>
  );
};
