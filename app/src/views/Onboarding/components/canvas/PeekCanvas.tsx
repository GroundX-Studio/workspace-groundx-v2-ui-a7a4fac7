/** P4 peek: breadcrumb + doc MATCH box + the field's full provenance. */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { BORDER, MUTED_ON_LIGHT, NAVY, WHITE } from "@/constants";

import { ExtractedField, FieldCategory } from "../../flow/flowTypes";
import { FieldProvenance } from "../FieldProvenance";
import { CrumbButton, DocLine, DocPage, DocToolbar, MatchBox, UnlockBar, docName } from "./DocParts";

export interface PeekCanvasProps {
  sampleName?: string;
  category: FieldCategory;
  field: ExtractedField;
  onClearField?: () => void;
  onUnlock?: () => void;
}

export const PeekCanvas = ({ sampleName, category, field, onClearField, onUnlock }: PeekCanvasProps) => (
  <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.5}
      sx={{ px: 2.5, py: 1, borderBottom: `1px solid ${BORDER}`, backgroundColor: WHITE }}
    >
      <CrumbButton label="← all fields" onClick={onClearField} />
      <Typography sx={{ fontSize: 12, color: MUTED_ON_LIGHT }}>›</Typography>
      <Typography sx={{ fontSize: 12, color: MUTED_ON_LIGHT }}>{category.label}</Typography>
      <Typography sx={{ fontSize: 12, color: MUTED_ON_LIGHT }}>›</Typography>
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{field.name.toLowerCase()}</Typography>
      <Box sx={{ flex: 1 }} />
      <CrumbButton label="▴ collapse" onClick={onClearField} />
    </Stack>
    <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
      <Box sx={{ flex: 1, minWidth: 0, overflow: "auto", p: 2.5, borderRight: `1px solid ${BORDER}` }}>
        <DocToolbar docName={docName(sampleName)} />
        <DocPage title={`${(sampleName ?? "DOCUMENT").toUpperCase()} · PAGE 1`}>
          <DocLine width="92%" />
          <DocLine width="78%" />
          <MatchBox
            label={`MATCH · ${field.provenance?.confidence ?? 96}%`}
            lines={field.provenance?.matchBox ?? [field.name.replace(/_/g, " "), field.value]}
          />
          <DocLine width="64%" />
          <DocLine width="88%" />
          <DocLine width="50%" />
          <DocLine width="73%" />
        </DocPage>
      </Box>
      <Box sx={{ width: { xs: 280, lg: 340 }, flexShrink: 0, minWidth: 0 }}>
        <FieldProvenance field={field} category={category} />
      </Box>
    </Box>
    <UnlockBar onUnlock={onUnlock} />
  </Box>
);

export default PeekCanvas;
