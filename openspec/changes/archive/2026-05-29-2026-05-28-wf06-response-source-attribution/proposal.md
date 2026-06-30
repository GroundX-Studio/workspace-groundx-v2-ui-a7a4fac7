# WF-06: response→source attribution (claim-level, verified, tiered)

## Why

WF-03 lands citation *geometry* (which page/region a chunk occupies). It does not solve
**attribution** — "which part of the LLM's answer came from which part of the source." The
canonical harness (`chat-with-sources`) deliberately stops at whole-chunk markers: it numbers
chunks `[1]…[n]` from `suggestedText`, asks the LLM to cite `[n]`, regex-maps the marker to the
n-th chunk, and highlights that **entire chunk** (`groundedGeneration.ts` →
`segmentsFromGroundedAnswer`). Its `refineCitation()` is an explicit stub. The source-view guide
(§3.3) concedes it is "impossible to deterministically trace which words in the answer came from
which chunk."

The reason is **two lossy hops**, not one:

```
raw text (atoms+coords) ──A: GroundX ingest rewrite──▶ suggestedText ──B: answer LLM synthesis──▶ answer
  ▲ what the highlight must land on               ▲ what the answer LLM actually saw      ▲ paraphrased, merges chunks
```

Surface string-matching answer↔source crosses **both** paraphrase hops, so it is unreliable.
The marker approach hides this by never claiming sub-chunk precision. We want finer, honest
attribution: highlight the *specific* source span behind a *specific* claim when we can prove it,
and degrade transparently when we can't.

## The algorithm — two bridges + graduated precision

Don't match answer↔source by strings. Span the two hops with two different mechanisms and let
precision be *earned*.

**Bridge B (answer → suggestedText): quote-grounded structured generation.** Keep the LLM as the
attributor (only it knows which chunk it used), but make it emit claim-level, quote-anchored
output instead of freeform `[n]`:
`{ answerSpan, sourceIndex(es), supportingQuote }` where `supportingQuote` is a **verbatim copy**
from the cited chunk. The verbatim quote is the anchor — forcing a copy (a) suppresses
hallucinated citations and (b) gives a string that exists in `suggestedText` to localize.

**Verification gate.** Locate `supportingQuote` in chunk[n]'s `suggestedText`: exact substring →
normalized (lowercase/whitespace/punct/currency) → embedding similarity vs. each `suggestedText`
sentence. Below threshold → claim is **unverified** (chunk-level citation, low confidence, no
tight box). Never fabricate precision from a weak match.

**Bridge A (suggestedText → raw text → atoms): precomputed per-chunk alignment.** The hop the
harness gives up on. Once per chunk (cached): align `suggestedText` sentences ↔ raw `text`
sentences, and raw `text` char-ranges ↔ **atoms** in the `-118-map` (atoms concatenate to
reproduce `text`). Yields a reusable map `suggestedText span → raw text span → atom boxes`.
Compose: `answer claim → verified quote → suggestedText span → [Bridge A] → atom boxes`.

**Graduated precision (what gets highlighted):**

| Tier | Condition | Highlight |
|---|---|---|
| **exact** | quote matches raw `text` verbatim → atoms resolve | word-level box (`-118-map`) |
| **paraphrase** | quote matches `suggestedText` only | chunk-level `boundingBoxes` (WF-03) |
| **ambient** | claim unverified, chunk retrieved+reranked | source card, no inline span |

The `ambient` tier preserves today's scaffold behavior (our chat router already turns retrieved
snippets into citations when no structured cite resolves) and **adopts** the harness's `[n]`
marker parse as an additional fallback. So WF-06 is a strict superset of the harness's marker
approach — `exact`/`paraphrase` are new precision layered on top of an unchanged floor.

## What changes

- **Middleware (chat-routing):** the RAG path emits quote-grounded structured citations (Bridge
  B); a verifier runs the exact→normalized→embedding gate; the resolver composes Bridge A
  (suggestedText↔text↔atom alignment, reusing WF-05's `-118-map` atom matcher + WF-03's
  `citationGeometry.ts`); each citation gets a `tier` + claim `answerSpan` (+ `confidence` on the
  middleware `Citation`, which the app `Citation` already has). The freeform `[n]` parser is
  adopted as the ambient fallback alongside today's all-snippets behavior.
- **App (ui-views):** answer renders as claim segments; hovering/clicking a claim highlights its
  source at the best available tier; tier drives the visual (solid = exact, translucent =
  paraphrase, chip-only = ambient). This is the one place WF-06 *does* change the app contract
  (WF-03/WF-05 were consume-only).

## Dependencies

- **WF-03** — chunk geometry off the search result (the paraphrase + ambient tiers; `citationGeometry.ts`).
- **WF-05** — the `-118-map` atom resolver (WF-05 task 1b). The `exact` tier needs it; since 1b is
  optional in WF-05, **if it isn't built the `exact` tier simply never fires** and every verified
  claim resolves at `paraphrase` (chunk-level). WF-06 degrades cleanly — it does not force WF-05 1b.
- An **embedding capability** for the verification gate + Bridge A. Bridge A MAY start lexical
  (token/sentence overlap) and upgrade to embeddings; flag the dependency, don't block on it.

## Out of scope

- Precision finer than word-level atoms (none exists upstream).
- Making non-verbatim paraphrase land word-level (it can't — that's exactly the paraphrase tier).
- Streaming-time attribution (compute lazily when the user opens sources, per guide §9).

## Risk / cost

Bridge A + embedding verification add LLM/embedding calls. Mitigate: run only for **cited**
chunks, **lazily** when the user opens sources; cache X-Ray + `-118-map` + the per-chunk
alignment by `documentId`; route all calls through the existing search rate limiter
(≤3 concurrent / ~20 per min). Degrade-never-block: any hop failure drops the claim one tier;
the chat turn always succeeds.

## Affected

- Middleware: `chatRouter.ts` (quote-grounded prompt + structured parse, verification gate, tier
  assignment), new `services/attribution.ts` (Bridge A alignment + verifier), reuse
  `citationGeometry.ts`, the X-Ray + `-118-map` caches, tests.
- App: claim-segment rendering + tiered highlight in `ChatColumn` / `PdfViewer` consume path;
  `Citation` gains `tier`/`confidence`/`answerSpan` (additive), tests.
- Specs: `chat-routing` (quote-grounded + verified + tiered citations), `ui-views` (tiered
  highlight render).

> **Spec-supersession note.** WF-06's `exact` tier yields a box *tighter* than WF-03's
> chunk-union rule, so WF-06 **refines** WF-03's "bbox = union of the cited page's boxes"
> requirement (union becomes the `paraphrase` case; `exact` narrows to atoms). Execution order is
> WF-03 → WF-05 → WF-06, so once WF-03 is archived into `specs/chat-routing`, WF-06 should land its
> chat-routing delta as a **MODIFIED** requirement on the WF-03 one rather than a second parallel
> ADDED requirement. (Filed now as ADDED because WF-03 is not yet durable.)
