# Tasks — inline footnote citations

Each task is TDD (failing test first) and ends with the standing adversarial-review gate.

## 1. Marker parser + Markdown citations API (pure, shared)
- [ ] 1.1 Add a pure parser: `(answerMarkdown, citations[]) → segments` where `[N]` (1≤N≤len)
      → a footnote-marker segment bound to `citations[N-1]`, out-of-range `[N]` → literal,
      duplicates allowed. Must NOT treat a real markdown link label `[N](url)` as a marker.
- [ ] 1.2 `answerSpan` anchoring backup: a citation with no inline `[N]` gets a marker
      injected after the verbatim `answerSpan`; unmatched → no marker (lives in SourceList).
- [ ] 1.3 ALIGNMENT check (mis-binding, not just out-of-range): trust `[N]→citations[N-1]`
      only if that citation's `answerSpan` sits at/just-before the marker; on mismatch
      re-anchor by `answerSpan` (or fall to SourceList). Never point a marker at the wrong source.
- [ ] 1.4 `Markdown` primitive gains an OPTIONAL `citations?: Citation[]` prop: a custom
      `remark` plugin tokenizes `[N]` → a node a `components` override renders as
      `<CiteChip variant="footnote">` wired to the dispatch. Absent `citations` → byte-identical
      to today (regression-safe). Alignment/anchor logic lives in the plugin/helper, not the component.
- [ ] 1.5 Unit tests: in-range, out-of-range, duplicate, answerSpan backup, alignment mismatch,
      markdown-safety (links/code not corrupted), and `[N](url)` real-link NOT treated as a marker.

## 2. CiteChip footnote variant (ui-runtime)
- [ ] 2.1 Add `variant: "pill" | "footnote"` to `CiteChip`; `footnote` = inline superscript.
      Same dispatch (`highlightCitation` / `openDocument`), same `cite.peeked`, same tier color.
- [ ] 2.2 Tests: footnote variant routes + telemetry identical to pill; regionless → openDocument.

## 3. SourceList (shared `brand/` presentational component)
- [ ] 3.1 New `SourceList` in `components/brand/` (alongside `CiteChip`): collapsed `N sources`
      → expands to rows grouped by `documentId`, distinct pages as labeled chips, deduped by
      region. Single citation → no collapse. Hosts the existing "Show all sources" action.
      Per-`[N]` color matches the marker (canonical `[1]` green / `[2]–[3]` cyan / coral).
- [ ] 3.2 Built from the FULL `citations[]` (never-drop floor), independent of marker success.
- [ ] 3.3 As a `brand/` component it ships a sibling test + obeys `no-hardcoded-styles`; the
      widget-contract (`mode` prop / slot rules) does NOT apply (that's for chat-/viewer-widgets).
- [ ] 3.4 Tests: grouping/dedupe (27 same-doc → one group, distinct pages), single-citation
      no-collapse, never-drop (citation absent from prose still listed + clickable), color mapping.

## 4. Wire into chat (ui-views) — ONE unified claim model
- [ ] 4.1 Replace the flat `turn.citations.map(<CiteChip>)` row in `LiveTurnList` /
      `chatPrimitives` with: inline markers (pass `citations` to `<Markdown>`) + a `SourceList`
      beneath the bubble.
- [ ] 4.2 Tier-precision (unifies req 569): the marker is the claim's affordance — click/hover
      drives `exact`→word-level / `paraphrase`→chunk-translucent / `ambient`→marker-only
      highlight. Tests for each tier (exact may be dormant; render handles all three).
- [ ] 4.3 Index-keyed colors (req 335): markers + lit regions + SourceList chips share the
      `[1]` green / `[2]–[3]` cyan / coral mapping. Test color consistency.
- [ ] 4.4 Streaming: markers render inert during stream (no `citations` prop yet); upgrade to
      clickable + SourceList appears on envelope. Test inert→clickable.
- [ ] 4.5 Refresh/rehydrate renders the footnote model (RT-01 path), no data dropped.

## 5. Wire into extract field rows + report sections (app-wide, no fork)
- [ ] 5.1 Extract widget field-row values use the `footnote` variant (wherever the widget
      mounts — onboarding AND authenticated). Test: same component, routes like chat.
- [ ] 5.2 Report sections use inline markers + `SourceList`. Test: shared components, no fork.

## 6. Generation contract (chat-routing prompts module)
- [ ] 6.1 Extend the grounded prompt's merged citation contract to require inline `[N]` markers
      (N = 1-based citation index) at each cited claim + claim/group-level guidance; retain
      `answerSpan`. Prompt lives ONLY in `services/prompts/` (guard test stays green).
- [ ] 6.2 Parser leaves inline `[N]` in the cleaned `answer` (fenced JSON still stripped).
- [ ] 6.3 Test: contract asserts the inline-marker instruction; cleaned answer retains markers.

## 7. Verification + close
- [ ] 7.1 Full app + middleware suites green; build clean; no-hardcoded-styles + widget-contract
      guards green. `SourceList` is a `brand/` component (sibling test + no-hardcoded-styles);
      it is NOT a widget, so the `mode`-prop / slot widget-contract does not apply to it.
- [ ] 7.2 Live browser check: a 5+ citation answer renders inline markers + collapsed source list
      (no wall); markers route to the viewer.
- [ ] 7.3 Adversarial review (fresh scan) before marking done.
- [ ] 7.4 `openspec validate inline-footnote-citations --strict`; archive on completion.
