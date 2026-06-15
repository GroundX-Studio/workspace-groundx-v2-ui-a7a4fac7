# Design — inline footnote citations

## Rendering model
A citation set on a rendering unit (a chat answer, an extract field row, a report section)
renders in two coordinated pieces, both from the shared production components:

1. **Inline marker** — `CiteChip` with `variant="footnote"`: a small superscript `[N]`
   sitting in the text flow after the cited claim. The marker is THE affordance for that
   cited claim (see "Reconciliation" below): click/hover drives the tier-precision highlight,
   keeping the `highlightCitation` dispatch + `cite.peeked` telemetry. Hover keeps the
   `source · page N — snippet` title. The pre-existing pill variant remains for any caller
   that still wants a standalone chip, but `footnote` is the default in prose.
2. **`SourceList`** — a new shared **`brand/` presentational component** (alongside
   `CiteChip`, NOT a `chat-widgets/`/`viewer-widgets/` widget — so the widget contract's
   `mode` prop / slot rules do NOT apply; it ships a sibling test + obeys the
   `no-hardcoded-styles` guard like any `brand/` component). It renders beneath the unit: a
   collapsed `⌄ N sources` summary expanding to rows grouped by `documentId`, each row
   listing the document's distinct pages as labeled chips (`1 · p.1`, `2 · p.2`, …), deduped
   by region. Single citation → no collapse (one inline marker + a one-line source). The
   existing "Show all sources" action (light every region at once) lives here.

## The never-drop invariant (load-bearing)
`SourceList` is built from the FULL `citations[]` array, independent of inline-marker
success. Markers are an *additional* affordance on top. So a citation whose `[N]` was never
emitted (or failed to anchor) is still present and clickable in the source list. This keeps
the locked "never drop a real grounding" philosophy: the source list is the floor.

## Reconciliation with existing citation requirements (ONE model, not two)
Two durable `ui-views` requirements already describe chat-answer citation behavior; this
change UNIFIES them with the footnote model rather than adding a parallel one:

- **Tiered claim highlighting** ("the chat answer SHALL render claim segments whose highlight
  precision matches the citation tier" — currently dormant; no claim-segment renderer exists
  in the live chat answer today). The inline `[N]` marker BECOMES the affordance for the
  tiered claim: clicking/hovering the marker drives the tier-precision highlight —
  `exact`→word-level, `paraphrase`→chunk-region (translucent), `ambient`→marker only (no
  inline span highlight). So there is ONE interaction model: a marked claim whose marker
  click resolves at the citation's tier. That requirement is MODIFIED to say so.
- **Index-keyed colors / color-matched lit regions.** TWO durable requirements specced
  lit-region colors with CONFLICTING rules — "light citation regions … in chip-keyed colors"
  (index/anomaly: `[1]` green, `[2]–[3]` cyan, anomaly coral) and "paint litRegions … from the
  latest assistant citations" (positional: first green, middle cyan, last coral). BOTH are
  MODIFIED onto the SINGLE index/anomaly rule (the semantic one, matching the `CiteChip`
  `color` prop), removing the conflict. The footnote markers ARE the `[N]` chips, so they carry
  these colors; lit regions stay color-matched to the marker; the `SourceList` page-chips reuse
  the same per-`[N]` color.
- **Frame-scoped headers.** The lit-region and citation-click requirements carry legacy "F5
  InteractView" names. Their behavior is generalized in-body to every surface that shows an
  assistant answer beside a viewer (Interact + steady chat); the headers are retained (a rename
  would churn the durable spec) with an in-body note that "F5" is legacy. Citation rendering
  itself (markers + `SourceList`) is already app-wide via the ADDED requirement.

## Generation contract (chat-routing)
The grounded prompt's single merged citation contract is extended:
- The model continues to emit the fenced `citations` JSON (with `documentId`, `page`/`field`,
  `quote`/`value`, `answerSpan`) exactly as today.
- It is ALSO instructed to place a `[N]` marker inline in the answer prose immediately after
  the claim that citation N's `answerSpan` quotes, where `N` is that citation's 1-based
  position in the `citations` array. Anchoring the marker to its own `answerSpan` lets the
  renderer corroborate the binding (the alignment check below).
- Guidance discourages per-atom marker spam: cite at the claim / group level (e.g. one
  marker per meter group), not once per line item, so dense list answers stay readable.

`answerSpan` is retained and gains a second job: the renderer's **anchoring backup**. If a
citation has no `[N]` in the prose, the renderer attempts to inject a marker right after the
verbatim `answerSpan`; if that also fails, the citation lives only in the `SourceList`.

The grounded-answer parser is unchanged in how it strips the fenced JSON block — the inline
`[N]` markers live in the prose (before the block) and remain in the cleaned `answer`.

## Marker parsing (renderer) + the `Markdown` API
A small pure parser turns the answer markdown + `citations[]` into render segments:
- `[N]` where `1 ≤ N ≤ citations.length` → an inline `CiteChip footnote` bound to
  `citations[N-1]`.
- `[N]` with no matching citation → rendered as literal text (defensive; never throws).
- Duplicate `[N]` for the same N → fine, both bind to the same citation.
- **Alignment check (handles MIS-binding, not just out-of-range):** when `citations[N-1]`
  has an `answerSpan`, the parser trusts the `[N]→citation` binding only if that `answerSpan`
  text appears at/just-before the marker's position in the prose. On mismatch the binding is
  NOT trusted: the parser re-anchors that citation by its `answerSpan` instead (inject a
  marker after the span), and if the span can't be located either, the citation is left to
  the `SourceList` only. This stops a model that mis-numbers `[2]` from pointing the marker
  at the wrong source. Citations with no `answerSpan` keep the positional binding (best effort).
  Matching is NORMALIZED before comparison — collapse whitespace and strip surrounding
  markdown emphasis (`**`/`*`/`` ` ``) — so a span like `$7,613.20` still matches prose that
  renders it as `**$7,613.20**`. A normalized match that still fails is safe (re-anchor →
  SourceList floor); the cost of a false-negative is at most a demoted-to-list citation, never
  a wrong binding.
- Markdown-safe: the parser runs at the text-node level so it does not corrupt links,
  code spans, or formatting, and `[N]` must NOT be treated as a marker when it is the label
  of a real markdown link (`[N](url)`).

**`Markdown` component boundary:** the existing `Markdown` primitive takes only
`children: string` (react-markdown + remark-gfm, no `rehype-raw`). It gains an OPTIONAL
`citations?: Citation[]` prop; when present, a custom `remark` plugin tokenizes `[N]` into a
node type that a `components` override renders as `<CiteChip variant="footnote">` (wired to
the orchestrator dispatch). When `citations` is absent the render is byte-identical to today
(no behavior change for non-citation markdown). The alignment + anchoring logic lives in the
plugin / a pure helper it calls, not inline in the component.

## Streaming
The answer streams token-by-token; `citations[]` arrives only in the final envelope. During
streaming, `[N]` markers render as INERT superscripts (no citation data yet → `Markdown`
gets no `citations` prop) and the `SourceList` is absent. On envelope arrival, markers
upgrade to clickable and the `SourceList` appears. No change to the verified streaming
transport. (Note: the brief flash of the raw fenced `citations` JSON at the end of the
streaming text — before the envelope's fence-stripped `answer` replaces it — is PRE-EXISTING
behavior, not introduced here.)

## Components & scope (app-wide)
- `CiteChip` — add `variant: "pill" | "footnote"` (default `footnote` in prose contexts).
  No new component.
- `SourceList` — one shared component (`grouped by doc → page`, dedupe, collapse, "show all").
- Both are consumed identically by: chat answer footer (`chatPrimitives` / `LiveTurnList`),
  extract field rows (the Extract widget, wherever it mounts — onboarding AND authenticated),
  and report sections. Numbering is local to each rendering unit.

## Edge cases
- Regionless citation (validated value, no page) → marker opens the document (no highlight);
  listed under "location unknown" in `SourceList`.
- Single citation → inline marker + one-line source; no collapse chrome.
- Color: the `[N]` markers carry the canonical index-keyed colors (`[1]` green, `[2]–[3]`
  cyan, anomaly/low-confidence coral) so lit regions stay color-matched; `SourceList`
  page-chips reuse the same per-`[N]` color.
- Mis-numbered marker → caught by the alignment check (re-anchored or SourceList-only).
- Mobile / narrow → `SourceList` rows wrap; markers stay inline.

## Testing
- Parser unit tests: `[N]`→chip, out-of-range `[N]`→literal, duplicate `[N]`, `answerSpan`
  anchoring backup, markdown-safety (no corruption of links/code), and `[N](url)` real-link
  NOT treated as a marker.
- Alignment-check test: a mis-numbered `[2]` whose neighboring text doesn't match
  `citations[1].answerSpan` is NOT bound positionally — it re-anchors by span (or falls to
  SourceList), never points the marker at the wrong source.
- Tier-precision test: `exact`/`paraphrase`/`ambient` claims drive word-level / chunk /
  marker-only highlights respectively when their marker is activated (unifies req 569).
- Index-keyed color test: markers + lit regions + SourceList chips share the `[1]` green /
  `[2]–[3]` cyan / coral mapping (req 335).
- Never-drop invariant test: a citation with no inline marker still appears in `SourceList`.
- Grouping/dedupe test: 27 same-doc citations → one doc group, distinct pages, deduped.
- Render tests on all three surfaces (chat answer, extract field row, report section) that
  the shared components mount with no per-surface fork.
- Streaming test: markers inert during stream → clickable + `SourceList` present on envelope.
- Generation contract test: the grounded prompt instructs inline `[N]` markers (prompts-module
  guard) and the parser leaves them in the cleaned `answer`.
