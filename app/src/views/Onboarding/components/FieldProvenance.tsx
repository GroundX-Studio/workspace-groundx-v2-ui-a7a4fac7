/**
 * FieldProvenance — the F4 peek. When a field is opened from the Extract panel,
 * this replaces the field list with the full provenance for that value: where it
 * came from, why it matched, how confident the parse is, and the neighbouring
 * fields. Pairs with the MATCH box highlighted on the doc.
 */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";

import {
  BORDER,
  BORDER_RADIUS,
  CORAL,
  FONT_WEIGHT_LABEL,
  GRAY,
  GREEN,
  LETTER_SPACING_LABEL,
  MUTED_ON_LIGHT,
  NAVY,
  WHITE,
} from "@/constants";

import { ExtractedField, FieldCategory } from "../flow/flowTypes";

const SectionLabel = ({ children }: { children: string }) => (
  <Typography
    sx={{ fontSize: 10, fontWeight: FONT_WEIGHT_LABEL, letterSpacing: LETTER_SPACING_LABEL, color: MUTED_ON_LIGHT, mt: 2 }}
  >
    {children}
  </Typography>
);

export interface FieldProvenanceProps {
  field: ExtractedField;
  category: FieldCategory;
}

export function FieldProvenance({ field, category }: FieldProvenanceProps) {
  const page = field.citation?.match(/p\.\d+/)?.[0] ?? "p.1";
  const prov = field.provenance;
  const type = prov?.type ?? "string";
  const source = prov?.source ?? `utility-bill.pdf · ${page} · detected region`;
  const confidence = prov?.confidence ?? 96;
  const whyMatched = prov?.whyMatched ?? [`"${field.name}" label located on ${page}`, "value normalized · type-checked"];
  const neighbors =
    prov?.neighbors ??
    category.fields
      .filter((f) => f.name !== field.name && !f.locked)
      .slice(0, 3)
      .map((f) => `${f.name.toLowerCase()} · ${f.value}`);

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", backgroundColor: WHITE, minWidth: 0 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1.25, borderBottom: `1px solid ${BORDER}` }}>
        <Typography sx={{ flex: 1, fontWeight: 700, color: NAVY, fontSize: 14 }}>Field provenance</Typography>
        {field.citation ? (
          <Typography sx={{ fontSize: 11, fontWeight: 600, color: CORAL }}>{field.citation}</Typography>
        ) : null}
      </Stack>

      <Box sx={{ flex: 1, overflowY: "auto", px: 2, py: 1.5 }}>
        <SectionLabel>FIELD</SectionLabel>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{field.name.toLowerCase()}</Typography>

        <Typography sx={{ mt: 1, fontSize: 32, fontWeight: 800, color: NAVY, lineHeight: 1.1 }}>{field.value}</Typography>
        <Typography sx={{ fontSize: 12, color: MUTED_ON_LIGHT }}>{type}</Typography>

        <SectionLabel>SOURCE</SectionLabel>
        <Typography sx={{ fontSize: 13, color: NAVY }}>{source}</Typography>

        <SectionLabel>WHY MATCHED</SectionLabel>
        <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2 }}>
          {whyMatched.map((reason) => (
            <Typography key={reason} component="li" sx={{ fontSize: 13, color: NAVY }}>
              {reason}
            </Typography>
          ))}
        </Stack>

        <SectionLabel>CONFIDENCE</SectionLabel>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.5 }}>
          <Box sx={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: GRAY, overflow: "hidden" }}>
            <Box sx={{ width: `${confidence}%`, height: "100%", backgroundColor: GREEN }} />
          </Box>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{confidence}%</Typography>
        </Stack>

        <SectionLabel>NEIGHBORS</SectionLabel>
        <Stack spacing={0.5} sx={{ mt: 0.5 }}>
          {neighbors.map((neighbor) => (
            <Typography
              key={neighbor}
              sx={{ fontSize: 12, color: MUTED_ON_LIGHT, px: 1, py: 0.5, borderRadius: BORDER_RADIUS, backgroundColor: alpha(GREEN, 0.06) }}
            >
              {neighbor}
            </Typography>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}

export default FieldProvenance;
