/**
 * LoadingDots — three pulsing dots, used as an inline "thinking" / "loading"
 * affordance.
 *
 * Defaults to coral on a transparent background — fits inside chips, buttons,
 * inline copy. Pass a `color` to override (e.g., NAVY against a green CTA, or
 * WHITE inside a navy banner).
 *
 * Carries `role="status"` and an `aria-label` so screen readers announce the
 * loading state.
 */

import { Box } from "@mui/material";
import { keyframes } from "@mui/material/styles";

import { CORAL } from "../../constants";

const dotPulse = keyframes`
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.85); }
  40%           { opacity: 1;   transform: scale(1); }
`;

interface LoadingDotsProps {
  /** Dot diameter in px. Defaults to 6. */
  size?: number;
  /** Dot color. Defaults to CORAL. */
  color?: string;
  /** Accessible label for the loading affordance. Defaults to "Loading". */
  "aria-label"?: string;
}

export function LoadingDots({
  size = 6,
  color = CORAL,
  "aria-label": ariaLabel = "Loading",
}: LoadingDotsProps) {
  return (
    <Box
      role="status"
      aria-label={ariaLabel}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: `${Math.round(size * 0.7)}px`,
      }}
    >
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          sx={{
            width: size,
            height: size,
            backgroundColor: color,
            borderRadius: "50%",
            animation: `${dotPulse} 1.4s ease-in-out infinite`,
            animationDelay: `${i * 0.16}s`,
          }}
        />
      ))}
    </Box>
  );
}

export default LoadingDots;
