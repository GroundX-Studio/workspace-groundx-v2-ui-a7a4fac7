/** Understand (P2): the doc being live-parsed, with a processing banner. */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";

import { BORDER_RADIUS, FONT_SIZE_LABEL, MUTED_ON_LIGHT, NAVY, WARNING_AMBER } from "@/constants";

import { SampleProject } from "../../flow/flowTypes";
import { DocLine, DocPage, docName } from "./DocParts";

export const UnderstandCanvas = ({ sample }: { sample: SampleProject | null }) => (
  <Box sx={{ flex: 1, overflow: "auto", p: 3, display: "flex", justifyContent: "center" }}>
    <Box sx={{ width: "100%", maxWidth: 560 }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{
          mb: 1.5,
          px: 1.5,
          py: 0.75,
          borderRadius: BORDER_RADIUS,
          backgroundColor: alpha(WARNING_AMBER, 0.18),
          border: `1px solid ${alpha(WARNING_AMBER, 0.5)}`,
        }}
      >
        <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: WARNING_AMBER }} />
        <Typography sx={{ fontSize: 13, color: NAVY, fontWeight: 600 }}>Reading {docName(sample?.name)} — about 6 seconds</Typography>
        <Typography sx={{ fontSize: FONT_SIZE_LABEL, color: MUTED_ON_LIGHT, ml: "auto" }}>parsing layout</Typography>
      </Stack>

      <DocPage title={`${(sample?.name ?? "DOCUMENT").toUpperCase()} · PAGE 1`} scanning>
        <DocLine width="92%" />
        <DocLine width="78%" />
        <DocLine width="100%" />
        <DocLine width="64%" />
        <DocLine width="88%" />
        <DocLine width="50%" />
        <DocLine width="73%" />
      </DocPage>

      <Typography sx={{ mt: 1.5, fontSize: FONT_SIZE_LABEL, color: MUTED_ON_LIGHT, textAlign: "center" }}>
        {sample ? `${sample.docLabel} · ${sample.outcome}` : "Pick a sample to begin"}
      </Typography>
    </Box>
  </Box>
);

export default UnderstandCanvas;
