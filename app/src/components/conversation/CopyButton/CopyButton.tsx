/**
 * CopyButton — a compact, greyscale copy-to-clipboard control for the
 * per-message footer (chat-message-actions-timestamps).
 *
 * Copies the message text with trailing inline citation markers (`[N]` bound
 * directly to the preceding token, e.g. `2025.[1]`) removed, so an assistant
 * answer copies clean prose; a bracketed digit that is part of the prose
 * (`option [1]`) is preserved. Shows a transient "Copied" confirmation. The
 * glyph is a recolorable inline SVG (`currentColor`) so it renders muted-grey —
 * NOT a color emoji. No-ops without throwing where the clipboard API is absent.
 *
 * Under `components/conversation/` (not a widget slot), so the widget contract
 * (README / mode prop / `.tools.ts`) does not apply; `no-hardcoded-styles` does,
 * hence brand tokens only.
 */

import Box from "@mui/material/Box";
import { alpha } from "@mui/material/styles";
import { useCallback, useEffect, useRef, useState, type FC } from "react";

import { BORDER_RADIUS_SM, MUTED_ON_LIGHT, NAVY } from "@/constants";

/** Strip `[N]` citation markers bound to the preceding token (no space before). */
function stripCitationMarkers(text: string): string {
  return text.replace(/(?<=\S)\[\d+\]/g, "");
}

export interface CopyButtonProps {
  /** The message text to copy (citation markers are stripped on copy). */
  text: string;
}

export const CopyButton: FC<CopyButtonProps> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const handleCopy = useCallback(() => {
    const clip = navigator.clipboard;
    if (!clip?.writeText) return; // insecure context / unsupported → render + no-op
    void clip.writeText(stripCitationMarkers(text)).then(() => {
      setCopied(true);
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <Box
      component="button"
      type="button"
      data-testid="copy-message-button"
      aria-label={copied ? "Copied" : "Copy message"}
      onClick={handleCopy}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.5,
        border: "none",
        background: "none",
        p: 0.25,
        borderRadius: BORDER_RADIUS_SM,
        color: MUTED_ON_LIGHT,
        cursor: "pointer",
        lineHeight: 0,
        transition: "color 120ms ease",
        "&:hover": { color: NAVY },
        "&:focus-visible": { outline: `2px solid ${alpha(NAVY, 0.5)}`, outlineOffset: 1 },
      }}
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
          <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
          <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </Box>
  );
};

export default CopyButton;
