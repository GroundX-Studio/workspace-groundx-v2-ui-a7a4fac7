/**
 * Loading — the app-wide loading BOUNDARY (unified-loader §1.2b/§1.3).
 *
 * Renders the shared `<BreathingMark>` (centered, with an optional message)
 * IN PLACE OF its children while `loading`, else the children. The two
 * placements are two components, not a mode flag:
 *   - in place of content  → this boundary
 *   - alongside content    → the bare `<BreathingMark>` (e.g. a status band)
 *
 * Anti-flash (§1.3): the mark only appears after `delay` ms (default 150) of
 * continuous loading — a region that resolves inside the window never shows
 * it, so fast loads don't flicker. While loading-but-within-the-delay the
 * boundary renders an empty spacer (children hidden — the state IS loading,
 * we just don't draw the mark yet).
 */
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useEffect, useState, type FC, type ReactNode } from "react";

import { MUTED_ON_LIGHT } from "@/constants";

import { BreathingMark, type BreathingMarkSize } from "./BreathingMark";

export interface LoadingProps {
  /** True while the wrapped region's data is loading. */
  loading: boolean;
  /** Mark scale — `lg` for viewer panes, `sm` for chat-sized regions. */
  size?: BreathingMarkSize;
  /** Optional muted line under the mark ("Reading the extraction…"). */
  message?: string;
  /** Anti-flash appearance delay in ms (§1.3). Default 150. */
  delay?: number;
  /** Accessible label for the mark. Defaults to the message, else "Loading". */
  "aria-label"?: string;
  children?: ReactNode;
}

export const Loading: FC<LoadingProps> = ({
  loading,
  size = "md",
  message,
  delay = 150,
  "aria-label": ariaLabel,
  children,
}) => {
  const [showMark, setShowMark] = useState(delay <= 0);

  useEffect(() => {
    if (!loading) return;
    if (delay <= 0) {
      setShowMark(true);
      return;
    }
    setShowMark(false);
    const id = window.setTimeout(() => setShowMark(true), delay);
    return () => window.clearTimeout(id);
  }, [loading, delay]);

  if (!loading) return <>{children}</>;
  if (!showMark) {
    // Within the anti-flash window: loading, but nothing drawn yet.
    return <Box data-testid="loading-boundary-pending" sx={{ flex: 1, minHeight: 0 }} />;
  }
  return (
    <Box
      data-testid="loading-boundary"
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 1.5,
        p: 4,
      }}
    >
      <BreathingMark size={size} aria-label={ariaLabel ?? message ?? "Loading"} />
      {message ? (
        <Typography variant="body2" sx={{ color: MUTED_ON_LIGHT }}>
          {message}
        </Typography>
      ) : null}
    </Box>
  );
};
