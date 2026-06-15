/**
 * Markdown — full CommonMark + GFM rendering for assistant chat copy.
 *
 * Why a primitive: assistant answers arrive as markdown (`**bold**`,
 * `` `code` ``, lists, tables). Rendering them as raw text showed
 * literal `**$7,613.20**` in the bubble (P3.c). This renders the full
 * markdown surface via `react-markdown` + `remark-gfm`.
 *
 * Security: raw HTML is NOT rendered — we deliberately do NOT add
 * `rehype-raw`, so `react-markdown` ignores embedded HTML (no XSS via
 * `<img onerror>` / `<script>`). Links open in a new tab with
 * `rel="noopener noreferrer"`.
 *
 * Styling: all element styles resolve from design tokens (the
 * `no-hardcoded-styles` drift guard walks this file). Element styling
 * is scoped via descendant selectors on a single wrapper so child
 * nodes (from `react-markdown`) pick up brand styling without a
 * component override per tag.
 */

import Box from "@mui/material/Box";
import { alpha } from "@mui/material/styles";
import { type FC, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import type { Citation } from "@groundx/shared";

import { CiteChip } from "@/components/brand/CiteChip/CiteChip";
import { citationColor } from "./citationFootnotes";
import { remarkCitationMarkers } from "./remarkCitationMarkers";

import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS_SM,
  FONT_SIZE_CAPTION,
  FONT_WEIGHT_HEADLINE,
  MUTED_ON_LIGHT,
  NAVY,
} from "@/constants";

export interface MarkdownProps {
  /** The markdown source string. */
  children: string;
  /**
   * inline-footnote-citations — when present, inline `[N]` tokens in the prose
   * render as footnote `CiteChip`s bound to `citations[N-1]` (see
   * `remarkCitationMarkers`). Absent → the render is byte-identical to before.
   */
  citations?: Citation[];
}

/** Anchor override — every link opens safely in a new tab. */
const SafeLink: FC<{ href?: string; children?: ReactNode }> = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer">
    {children}
  </a>
);

/**
 * The `sup` `components` override used only when `citations` are passed: the
 * remark plugin emits each `[N]` marker as a `sup` carrying `data-cite-pos` /
 * `data-cite-index`, which we render as the footnote `CiteChip`. Markdown never
 * emits a `sup` on its own (raw HTML is disabled), so overriding it is safe; a
 * marker whose data is missing/out-of-range falls back to a plain `<sup>`.
 */
function makeCitationComponents(citations: Citation[]): Components {
  return {
    a: SafeLink,
    sup: ({ node, children }) => {
      const props = (node?.properties ?? {}) as Record<string, unknown>;
      const pos = Number(props["dataCitePos"] ?? props["data-cite-pos"]);
      const idx = Number(props["dataCiteIndex"] ?? props["data-cite-index"]);
      const citation = Number.isInteger(pos) ? citations[pos] : undefined;
      if (!citation || Number.isNaN(idx)) return <sup>{children}</sup>;
      // Same index/confidence-keyed color as the SourceList pill (one shared rule).
      return <CiteChip citation={citation} index={idx} variant="footnote" color={citationColor(idx, citation)} />;
    },
  };
}

export const Markdown: FC<MarkdownProps> = ({ children, citations }) => {
  const hasCitations = Array.isArray(citations) && citations.length > 0;
  const remarkPlugins = hasCitations ? [remarkGfm, remarkCitationMarkers(citations)] : [remarkGfm];
  const components: Components = hasCitations ? makeCitationComponents(citations) : { a: SafeLink };
  return (
  <Box
    data-testid="markdown"
    sx={{
      color: BODY_TEXT,
      fontSize: FONT_SIZE_CAPTION,
      lineHeight: 1.5,
      wordBreak: "break-word",
      // tighten the default block margins so a one-line answer reads as one line
      "& > :first-of-type": { mt: 0 },
      "& > :last-child": { mb: 0 },
      "& p": { my: 0.5 },
      "& strong": { fontWeight: FONT_WEIGHT_HEADLINE, color: NAVY },
      "& em": { fontStyle: "italic" },
      "& code": {
        fontFamily: "monospace",
        backgroundColor: alpha(NAVY, 0.06),
        borderRadius: BORDER_RADIUS_SM,
        px: 0.5,
        py: 0.125,
      },
      "& pre": {
        fontFamily: "monospace",
        backgroundColor: alpha(NAVY, 0.06),
        borderRadius: BORDER_RADIUS_SM,
        p: 1,
        my: 0.5,
        overflowX: "auto",
      },
      "& pre code": { backgroundColor: "transparent", p: 0 },
      "& ul, & ol": { my: 0.5, pl: 2.5 },
      "& li": { mb: 0.25 },
      "& h1, & h2, & h3, & h4, & h5, & h6": {
        fontSize: FONT_SIZE_CAPTION,
        fontWeight: FONT_WEIGHT_HEADLINE,
        color: NAVY,
        m: 0,
        mt: 1,
      },
      "& a": { color: NAVY, textDecoration: "underline" },
      "& blockquote": {
        borderLeft: `2px solid ${alpha(NAVY, 0.2)}`,
        pl: 1,
        my: 0.5,
        color: MUTED_ON_LIGHT,
      },
      "& table": { borderCollapse: "collapse", my: 0.5 },
      "& th, & td": { border: `1px solid ${BORDER}`, px: 1, py: 0.5, textAlign: "left" },
      "& th": { fontWeight: FONT_WEIGHT_HEADLINE, color: NAVY },
      "& img": { maxWidth: "100%" },
    }}
  >
    <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
      {typeof children === "string" ? children : String(children ?? "")}
    </ReactMarkdown>
  </Box>
  );
};

export default Markdown;
