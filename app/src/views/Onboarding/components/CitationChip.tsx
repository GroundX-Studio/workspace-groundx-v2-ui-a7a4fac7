/**
 * CitationChip — the coral source-citation pill ("[3] p.1"). Shared across the
 * chat answers, the Extract field rows, and the provenance peek so the citation
 * styling lives in one place.
 */

import Box from "@mui/material/Box";
import { alpha } from "@mui/material/styles";

import { BORDER_RADIUS_PILL, CORAL } from "@/constants";

export interface CitationChipProps {
  label: string;
  /** Inline in prose (adds a leading gap); omit for standalone use in a row. */
  inline?: boolean;
}

export function CitationChip({ label, inline = false }: CitationChipProps) {
  return (
    <Box
      component="span"
      sx={{
        ...(inline ? { ml: 0.5 } : {}),
        px: 0.75,
        py: "1px",
        borderRadius: BORDER_RADIUS_PILL,
        fontSize: 11,
        fontWeight: 600,
        color: CORAL,
        backgroundColor: alpha(CORAL, 0.14),
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </Box>
  );
}

export default CitationChip;
