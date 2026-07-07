/**
 * BreathingMark — THE app-wide loading visual (unified-loader §1.2a, concept E).
 *
 * A calm, flat, on-brand GREEN mark that "breathes": a solid core disc easing
 * scale + opacity, wrapped in a soft ring that swells out of phase — reads as
 * alive without spinning or flashing. Green (brand primary) deliberately:
 * loading is a calm/positive state, never the alert coral could imply.
 *
 * `prefers-reduced-motion: reduce` renders the static mark (no animation).
 * Carries `role="status"` + `aria-label` so screen readers announce it.
 *
 * This primitive is the bare mark for ALONGSIDE-content placements (e.g. the
 * viewer-frame status band). For in-place-of-content loading, use the
 * `<Loading>` boundary, which renders this mark centered with an optional
 * message after an anti-flash delay.
 */
import Box from "@mui/material/Box";
import { alpha, keyframes } from "@mui/material/styles";

import { GREEN } from "@/constants";

const breatheCore = keyframes`
  0%, 100% { transform: scale(0.86); opacity: 0.75; }
  50%      { transform: scale(1);    opacity: 1; }
`;

const breatheRing = keyframes`
  0%, 100% { transform: scale(0.9);  opacity: 0.45; }
  50%      { transform: scale(1.35); opacity: 0; }
`;

export type BreathingMarkSize = "sm" | "md" | "lg";

/** Core-disc diameter per size (the ring swells ~35% beyond it). */
const CORE_PX: Record<BreathingMarkSize, number> = { sm: 10, md: 18, lg: 28 };

export interface BreathingMarkProps {
  /** Visual scale: `sm` chat/inline · `md` panels · `lg` viewer panes. */
  size?: BreathingMarkSize;
  /** Accessible label. Defaults to "Loading". */
  "aria-label"?: string;
}

export function BreathingMark({
  size = "md",
  "aria-label": ariaLabel = "Loading",
}: BreathingMarkProps) {
  const core = CORE_PX[size];
  // The box reserves the ring's fullest swell so the animation never shifts
  // neighboring layout.
  const box = Math.ceil(core * 1.5);
  return (
    <Box
      role="status"
      aria-label={ariaLabel}
      data-testid="breathing-mark"
      data-size={size}
      sx={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: box,
        height: box,
        flexShrink: 0,
      }}
    >
      <Box
        data-testid="breathing-mark-ring"
        sx={{
          position: "absolute",
          width: core,
          height: core,
          borderRadius: "50%",
          backgroundColor: alpha(GREEN, 0.35),
          animation: `${breatheRing} 1.8s ease-in-out infinite`,
          "@media (prefers-reduced-motion: reduce)": {
            animation: "none",
            opacity: 0.25,
            transform: "scale(1.2)",
          },
        }}
      />
      <Box
        data-testid="breathing-mark-core"
        sx={{
          width: core,
          height: core,
          borderRadius: "50%",
          backgroundColor: GREEN,
          animation: `${breatheCore} 1.8s ease-in-out infinite`,
          "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        }}
      />
    </Box>
  );
}
