/**
 * CapabilityPills — the E · I · R row on a sample card.
 *
 * A filled green pill means the sample demonstrates that capability; a hollow
 * outlined pill means "not in this sample" (the spec's legend). Extract /
 * Interact / Report.
 */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";

import { BORDER_RADIUS_SM, GREEN, INPUT_BORDER, MUTED_ON_LIGHT, NAVY } from "@/constants";

import { Capability } from "../flow/flowTypes";

const ALL_CAPABILITIES: Capability[] = ["E", "I", "R"];

export interface CapabilityPillsProps {
  /** Capabilities this sample demonstrates; the rest render hollow. */
  active: Capability[];
  /** Render the legend labels (Extract / Interact / Report) after each glyph. */
  legend?: boolean;
}

const LABELS: Record<Capability, string> = { E: "Extract", I: "Interact", R: "Report" };

export function CapabilityPills({ active, legend = false }: CapabilityPillsProps) {
  return (
    <Stack direction="row" spacing={legend ? 1.5 : 0.5} alignItems="center">
      {ALL_CAPABILITIES.map((cap) => {
        const on = active.includes(cap);
        return (
          <Stack key={cap} direction="row" spacing={0.5} alignItems="center">
            <Box
              aria-label={`${LABELS[cap]} ${on ? "supported" : "not in this sample"}`}
              sx={{
                width: 20,
                height: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: BORDER_RADIUS_SM,
                fontSize: 11,
                fontWeight: 700,
                backgroundColor: on ? GREEN : "transparent",
                color: on ? NAVY : MUTED_ON_LIGHT,
                border: on ? "1px solid transparent" : `1px solid ${INPUT_BORDER}`,
              }}
            >
              {cap}
            </Box>
            {legend ? (
              <Box component="span" sx={{ fontSize: 12, color: MUTED_ON_LIGHT }}>
                {LABELS[cap]}
              </Box>
            ) : null}
          </Stack>
        );
      })}
    </Stack>
  );
}

export default CapabilityPills;
