/** Extract (P3): doc viewer (hover highlights a field's region) + ExtractedFields. */

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";

import { BORDER, BORDER_RADIUS, GREEN, NAVY } from "@/constants";

import { FieldCategory } from "../../flow/flowTypes";
import { ExtractedFields } from "../ExtractedFields";
import { DocLine, DocPage, DocToolbar, UnlockBar, docName } from "./DocParts";

export interface ExtractCanvasProps {
  sampleName?: string;
  category: FieldCategory;
  hoveredField: string | null;
  /** Compact: stack the doc above the fields instead of side-by-side. */
  stacked?: boolean;
  onHoverField: (name: string | null) => void;
  onSelectField: (name: string) => void;
  onUnlock?: () => void;
}

export const ExtractCanvas = ({ sampleName, category, hoveredField, stacked, onHoverField, onSelectField, onUnlock }: ExtractCanvasProps) => (
  <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: stacked ? "column" : "row", overflow: stacked ? "auto" : "visible" }}>
      <Box
        sx={{
          flex: stacked ? "0 0 auto" : 1,
          minWidth: 0,
          overflow: stacked ? "visible" : "auto",
          p: 2.5,
          borderRight: stacked ? "none" : `1px solid ${BORDER}`,
          borderBottom: stacked ? `1px solid ${BORDER}` : "none",
        }}
      >
        <DocToolbar docName={docName(sampleName)} />
        <DocPage title={`${(sampleName ?? "DOCUMENT").toUpperCase()} · PAGE 1`}>
          <DocLine width="92%" />
          <DocLine width="78%" />
          <Box sx={{ position: "relative" }}>
            <DocLine width="100%" highlighted={Boolean(hoveredField)} />
            {hoveredField ? (
              <Typography
                sx={{
                  position: "absolute",
                  right: 0,
                  top: -16,
                  fontSize: 10,
                  fontWeight: 700,
                  color: NAVY,
                  backgroundColor: alpha(GREEN, 0.9),
                  px: 0.5,
                  borderRadius: BORDER_RADIUS,
                  whiteSpace: "nowrap",
                }}
              >
                {hoveredField} →
              </Typography>
            ) : null}
          </Box>
          <DocLine width="64%" />
          <DocLine width="88%" />
          <DocLine width="50%" />
          <DocLine width="73%" />
        </DocPage>
      </Box>
      <Box sx={{ width: stacked ? "100%" : { xs: 280, lg: 340 }, flexShrink: 0, minWidth: 0 }}>
        <ExtractedFields category={category} hoveredField={hoveredField} onHoverField={onHoverField} onSelectField={onSelectField} />
      </Box>
    </Box>
    <UnlockBar onUnlock={onUnlock} />
  </Box>
);

export default ExtractCanvas;
