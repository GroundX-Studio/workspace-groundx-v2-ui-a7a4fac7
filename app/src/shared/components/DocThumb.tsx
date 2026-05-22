import Box from "@mui/material/Box";
import { alpha } from "@mui/material/styles";
import type { FC } from "react";

import { BORDER_RADIUS_SM, NAVY, WHITE } from "@/constants";

export interface DocThumbProps {
  /** Width in px. Defaults to 36 (F1 sample card spec). */
  w?: number;
  /** Height in px. Defaults to 46. */
  h?: number;
}

/**
 * Doc thumbnail primitive — matches the wireframe's `.wf-doc` element:
 * a flat white box with a 1px navy border, a folded-corner triangle in the
 * top-right, and a few short horizontal placeholder lines inside.
 *
 * Source: `wireframe-primitives.jsx` `function Doc({ w, h })`.
 */
export const DocThumb: FC<DocThumbProps> = ({ w = 36, h = 46 }) => {
  const lineColor = alpha(NAVY, 0.18);
  const lineDim = alpha(NAVY, 0.1);
  return (
    <Box
      aria-hidden
      sx={{
        width: w,
        height: h,
        backgroundColor: WHITE,
        border: `1px solid ${NAVY}`,
        borderRadius: BORDER_RADIUS_SM,
        position: "relative",
        padding: "8px 6px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        boxSizing: "border-box",
        // Folded corner — a small navy triangle in the top-right corner.
        "&::after": {
          content: '""',
          position: "absolute",
          right: 0,
          top: 0,
          width: 0,
          height: 0,
          borderLeft: "8px solid transparent",
          borderTop: `8px solid ${NAVY}`,
        },
        // Horizontal placeholder line strokes mimicking text on the page.
        "& > i": {
          display: "block",
          height: 4,
          borderRadius: 999,
          backgroundColor: lineColor,
        },
        "& > i:nth-of-type(2)": { width: "70%", backgroundColor: lineDim },
        "& > i:nth-of-type(3)": { width: "85%" },
        "& > i:nth-of-type(4)": { width: "60%", backgroundColor: lineDim },
      }}
    >
      <i />
      <i />
      <i />
      <i />
    </Box>
  );
};
