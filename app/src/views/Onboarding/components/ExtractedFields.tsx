/**
 * ExtractedFields — the right half of the Extract (P3) canvas. Renders one
 * category's fields as name / value rows with source citations; hovering a row
 * lights up its region on the doc (pixel-level provenance). Locked rows and the
 * action menu sit behind the free-tier sign-in gate.
 */

import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";

import {
  BORDER,
  BORDER_RADIUS,
  BORDER_RADIUS_PILL,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_LABEL,
  GREEN,
  LETTER_SPACING_LABEL,
  MUTED_ON_LIGHT,
  NAVY,
  TINT,
  WHITE,
} from "@/constants";
import DropdownMenu, { DropdownMenuItemConfig } from "@/shared/components/DropdownMenu";
import { onEnterOrSpace } from "@/shared/utils/onEnterOrSpace";

import { EXTRACT_MENU_ACTIONS } from "../flow/extractionData";
import { ExtractedField, FieldCategory } from "../flow/flowTypes";
import { CitationChip } from "./CitationChip";

const FieldRow = ({
  field,
  hovered,
  onHover,
  onSelect,
}: {
  field: ExtractedField;
  hovered: boolean;
  onHover: (name: string | null) => void;
  onSelect: () => void;
}) => (
  <Box
    role={field.locked ? undefined : "button"}
    tabIndex={field.locked ? undefined : 0}
    aria-label={field.locked ? undefined : `Open provenance for ${field.name}`}
    onClick={field.locked ? undefined : onSelect}
    onKeyDown={field.locked ? undefined : onEnterOrSpace(onSelect)}
    onMouseEnter={() => onHover(field.locked ? null : field.name)}
    onMouseLeave={() => onHover(null)}
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 1,
      px: 1.25,
      py: 0.75,
      borderRadius: BORDER_RADIUS,
      border: `1px solid ${hovered ? GREEN : BORDER}`,
      backgroundColor: hovered ? alpha(GREEN, 0.16) : WHITE,
      cursor: field.locked ? "default" : "pointer",
      "&:focus-visible": { outline: "none", borderColor: GREEN, backgroundColor: alpha(GREEN, 0.16) },
      ...(field.locked ? { opacity: 0.55, filter: "blur(0.5px)" } : {}),
    }}
  >
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Typography
        sx={{ fontSize: 10, fontWeight: FONT_WEIGHT_LABEL, letterSpacing: LETTER_SPACING_LABEL, color: MUTED_ON_LIGHT }}
      >
        {field.name}
      </Typography>
      <Typography sx={{ fontSize: 14, fontWeight: 700, color: NAVY }} noWrap>
        {field.locked ? "•••••" : field.value}
      </Typography>
    </Box>
    {field.locked ? (
      <LockOutlinedIcon sx={{ fontSize: 14, color: MUTED_ON_LIGHT }} />
    ) : field.citation ? (
      <CitationChip label={field.citation} />
    ) : null}
  </Box>
);

export interface ExtractedFieldsProps {
  category: FieldCategory;
  hoveredField: string | null;
  onHoverField: (name: string | null) => void;
  /** Open a field's provenance peek (P4). */
  onSelectField: (name: string) => void;
}

export function ExtractedFields({ category, hoveredField, onHoverField, onSelectField }: ExtractedFieldsProps) {
  const menuItems: DropdownMenuItemConfig[] = EXTRACT_MENU_ACTIONS.map((action) => ({
    label: action.label,
    // TODO(P3a / P6): wire schema save/edit, exports, filter, and group-by. Gated items need the sign-in gate.
    onClick: () => undefined,
    disabled: action.gated,
    icon: action.gated ? <LockOutlinedIcon sx={{ fontSize: 16 }} /> : undefined,
  }));

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", backgroundColor: WHITE, minWidth: 0 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1.25, borderBottom: `1px solid ${BORDER}` }}>
        <Typography sx={{ flex: 1, fontWeight: 700, color: NAVY, fontSize: 14 }}>Extracted fields</Typography>
        <DropdownMenu
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          items={menuItems}
          trigger={({ onClick, open }) => (
            <IconButton
              aria-label="Extract actions menu"
              aria-haspopup="menu"
              aria-expanded={open ? "true" : undefined}
              onClick={onClick}
              disableRipple
              sx={{ width: 30, height: 30, backgroundColor: TINT, color: NAVY, "&:hover": { backgroundColor: GREEN } }}
            >
              <MenuIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}
        />
      </Stack>

      <Box sx={{ flex: 1, overflowY: "auto", px: 2, py: 1.5 }}>
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            mb: 1,
            px: 1,
            py: 0.25,
            borderRadius: BORDER_RADIUS_PILL,
            backgroundColor: TINT,
          }}
        >
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: NAVY }}>{category.label}</Typography>
          <Typography sx={{ fontSize: 11, color: MUTED_ON_LIGHT }}>· {category.summary}</Typography>
        </Box>

        <Stack spacing={0.75}>
          {category.fields.map((field) => (
            <FieldRow
              key={field.name}
              field={field}
              hovered={hoveredField === field.name}
              onHover={onHoverField}
              onSelect={() => onSelectField(field.name)}
            />
          ))}
        </Stack>

        {category.lockedCount ? (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1.25 }}>
            <LockOutlinedIcon sx={{ fontSize: 13, color: MUTED_ON_LIGHT }} />
            <Typography sx={{ fontSize: FONT_SIZE_LABEL, color: MUTED_ON_LIGHT }}>
              {category.lockedCount} more fields locked · sign in
            </Typography>
          </Stack>
        ) : null}
      </Box>
    </Box>
  );
}

export default ExtractedFields;
