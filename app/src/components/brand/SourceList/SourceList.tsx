/**
 * inline-footnote-citations Phase C — the shared source list.
 *
 * Replaces the flat wall of numbered chips beneath an answer. A single citation
 * renders inline; many collapse to an `N sources` toggle that expands to rows
 * grouped by document (labeled by GroundX `fileName`, falling back to
 * `documentId`), deduped by page, color-keyed to match the inline `[N]` markers.
 * Built from the FULL citations array (the never-drop floor) — every citation is
 * reachable here even if its inline marker is absent. A `brand/` presentational
 * component (like `CiteChip`): no widget `mode` contract; styles are token-only.
 */
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState, type FC } from "react";

import type { Citation } from "@groundx/shared";

import { CiteChip, type CiteChipColor } from "@/components/brand/CiteChip/CiteChip";
import { FONT_SIZE_LABEL, MUTED_ON_LIGHT, NAVY } from "@/constants";

import { groupSources } from "./sourceGroups";

/** Canonical index-keyed colors: `[1]` green (primary), low-confidence coral, else cyan. */
function colorForIndex(index: number, c: Citation): CiteChipColor {
  if (c.confidence != null && c.confidence < 0.5) return "coral";
  return index === 1 ? "green" : "cyan";
}

export interface SourceListProps {
  citations: Citation[];
  /** Optional "show all sources" affordance (lights every region at once). */
  onShowAll?: () => void;
}

export const SourceList: FC<SourceListProps> = ({ citations, onShowAll }) => {
  const [expanded, setExpanded] = useState(false);
  if (citations.length === 0) return null;
  const groups = groupSources(citations);
  const single = citations.length === 1;
  const showRows = single || expanded;
  const toggle = () => setExpanded((e) => !e);

  return (
    <Box data-testid="source-list" sx={{ mt: 0.5, fontSize: FONT_SIZE_LABEL }}>
      {!single && (
        <Box
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onClick={toggle}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              toggle();
            }
          }}
          sx={{
            cursor: "pointer",
            color: MUTED_ON_LIGHT,
            fontSize: FONT_SIZE_LABEL,
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            "&:focus-visible": { outline: `2px solid ${NAVY}`, outlineOffset: 1 },
          }}
        >
          {`${citations.length} sources`}
        </Box>
      )}
      {showRows && (
        <Stack spacing={0.5} sx={{ mt: single ? 0 : 0.5 }}>
          {groups.map((g) => (
            <Stack
              key={g.documentId}
              direction="row"
              alignItems="center"
              sx={{ columnGap: 0.75, rowGap: 0.25, flexWrap: "wrap" }}
            >
              <Typography component="span" variant="caption" sx={{ color: MUTED_ON_LIGHT }}>
                {g.fileName ?? g.documentId}
              </Typography>
              {g.entries.map((e) => (
                <Box key={e.index} component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}>
                  <CiteChip
                    citation={e.citation}
                    index={e.index}
                    variant="pill"
                    color={colorForIndex(e.index, e.citation)}
                  />
                  <Typography component="span" variant="caption" sx={{ color: NAVY }}>
                    {e.page != null ? `p.${e.page}` : "location unknown"}
                  </Typography>
                </Box>
              ))}
            </Stack>
          ))}
          {onShowAll && (
            <Box
              role="button"
              tabIndex={0}
              onClick={onShowAll}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  onShowAll();
                }
              }}
              sx={{
                cursor: "pointer",
                color: NAVY,
                fontSize: FONT_SIZE_LABEL,
                "&:focus-visible": { outline: `2px solid ${NAVY}`, outlineOffset: 1 },
              }}
            >
              Show all sources
            </Box>
          )}
        </Stack>
      )}
    </Box>
  );
};

export default SourceList;
