/**
 * inline-footnote-citations Phase B — turns inline `[N]` tokens into footnote
 * markers in the mdast, so they render as `<CiteChip variant="footnote">`.
 *
 * standardized-viewer-control T8 — this is now a THIN wrapper over the
 * generalized `remarkClickableSpans` plugin (the link/code-safe walk + the
 * clickable-node wrap), passing ONLY citation rules. There is no second
 * near-duplicate remark module: the citation path and the offered-affordance
 * anchor path share one walker, parameterized by a match-rule axis. Kept as a
 * named export so the citations-only call site (Markdown with no anchors) stays
 * byte-identical and existing tests keep their entry point.
 */
import type { Citation } from "@groundx/shared";

import { remarkClickableSpans } from "./remarkClickableSpans";

export function remarkCitationMarkers(citations: Citation[]) {
  return remarkClickableSpans({ citations });
}
