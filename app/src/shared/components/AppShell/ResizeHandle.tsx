import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";
import { useCallback, type KeyboardEvent, type PointerEvent } from "react";

import { BORDER, NAVY } from "@/constants";

export interface ResizeHandleProps {
  /** Current width in px of the pane being resized. Used as aria-valuenow. */
  value: number;
  min?: number;
  max?: number;
  /** Called on pointer-down with the pointer's clientX. */
  onPointerDown: (pointerX: number) => void;
  /** Arrow-key arrow-step adjustment (returns the new value). */
  onBump: (deltaPx: number) => number;
  /** Visible label for screen readers. */
  ariaLabel?: string;
}

/**
 * Drag-to-resize separator between the chat pane and the canvas pane. Carries
 * `role="separator"` + `aria-orientation="vertical"` so screen readers expose
 * it. Arrow-key resize bumps in 16px steps (8 with Shift held). The visual
 * affordance is a 6px-wide hover-thickening rail with a navy tinted handle
 * when focused — matches spec W5 ("subtle, brand-quiet").
 */
export function ResizeHandle({ value, min = 0, max = 1200, onPointerDown, onBump, ariaLabel = "Resize chat pane" }: ResizeHandleProps) {
  const theme = useTheme();

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      onPointerDown(event.clientX);
    },
    [onPointerDown]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 8 : 16;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onBump(-step);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onBump(step);
      } else if (event.key === "Home") {
        event.preventDefault();
        onBump(-Number.MAX_SAFE_INTEGER);
      } else if (event.key === "End") {
        event.preventDefault();
        onBump(Number.MAX_SAFE_INTEGER);
      }
    },
    [onBump]
  );

  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      sx={{
        width: 6,
        cursor: "col-resize",
        position: "relative",
        backgroundColor: "transparent",
        "&:hover, &:focus-visible": { backgroundColor: BORDER },
        "&:focus-visible": {
          outline: `2px solid ${theme.palette.primary.main}`,
          outlineOffset: -1,
        },
        "&::after": {
          content: '""',
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 2,
          height: 32,
          borderRadius: 1,
          backgroundColor: NAVY,
          opacity: 0.2,
        },
      }}
    />
  );
}
