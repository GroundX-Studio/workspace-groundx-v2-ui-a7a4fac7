/**
 * MotionRoot — UR-03.
 *
 * Wraps the application tree in a single `<MotionConfig>` so the
 * `prefers-reduced-motion` OS preference becomes a global concern
 * instead of a per-component `useReducedMotion()` branch.
 *
 *   • `reducedMotion="user"` tells framer-motion to honor the
 *     OS preference for every descendant `motion.X`. When the
 *     user prefers reduced motion, transform / scale / rotate
 *     animations are auto-disabled; opacity continues to animate
 *     (= our crossfade behavior).
 *
 *   • When the OS preference flips, we also drop in an 80 ms
 *     default `transition` so any motion site that doesn't supply
 *     one inherits a tight crossfade rather than the framer-motion
 *     default spring. Existing per-component `transition` props
 *     keep winning — this is just the floor.
 *
 *   • When the OS preference is unset, we leave the global
 *     transition undefined so each motion site continues to drive
 *     its own (the AppShell drag transition, the F1→F2 page swipe,
 *     etc.).
 *
 * Sites that need to do their own thing under reduced-motion
 * (e.g. the F2 scan-line stops looping, the AppShell drag uses a
 * zero-duration transition) keep their per-component
 * `useReducedMotion()` calls. This wrapper is the *floor*, not the
 * ceiling.
 */

import { MotionConfig, useReducedMotion } from "framer-motion";
import type { FC, ReactNode } from "react";

export interface MotionRootProps {
  children: ReactNode;
}

/** Global crossfade duration used as the reduced-motion fallback. */
const REDUCED_MOTION_DURATION_SECONDS = 0.08;

export const MotionRoot: FC<MotionRootProps> = ({ children }) => {
  const reduce = useReducedMotion();
  return (
    <MotionConfig
      reducedMotion="user"
      transition={
        reduce
          ? { duration: REDUCED_MOTION_DURATION_SECONDS, ease: "linear" }
          : undefined
      }
    >
      {children}
    </MotionConfig>
  );
};
