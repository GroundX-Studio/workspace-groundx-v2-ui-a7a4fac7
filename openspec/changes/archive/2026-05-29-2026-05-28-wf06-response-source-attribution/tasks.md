# Tasks — WF-06 response→source attribution

> **Status 2026-05-29: middleware core DONE + live-verified → ARCHIVING. App render split to
> WF-06b.** The Bridge B quote-grounded generation, the verification gate, and tier assignment
> ship + are tested (10 new unit tests) and emit `tier`/`confidence`/`answerSpan` on the live wire
> (verified: ambient fallback tagged `tier:"ambient"`/`confidence:0`). The `exact` tier is dormant
> (WF-05 1b `-118-map` atom resolver was skipped — verified claims resolve at `paraphrase`, per the
> degrade-cleanly contract). This change now scopes to the **chat-routing** delta only; the
> **ui-views** tiered-render delta + §5 app work moved to **WF-06b** (2026-05-29-wf06b-tiered-citation-render).

## 0. Depends on

- [x] WF-03 merged — `citationGeometry.ts` + chunk geometry off the search result.
- [→] WF-05 1b (`-118-map` atom resolver) **was skipped** — so the `exact` tier never fires and
      verified claims resolve at `paraphrase`. WF-06 degrades cleanly (does not force 1b).

## 1. Bridge B — quote-grounded structured generation — DONE

- [x] RAG prompt now instructs claim-level, quote-anchored output (`quote` verbatim + `answerSpan`);
      `StructuredCitation` gained `answerSpan?`; the existing CF-06 parser carries it through.
- [x] Tolerant fallback retained: no structured claims → the all-snippets ambient path.

## 2. Verification gate (exact → normalized → embedding) — DONE

- [x] `verifyQuote(quote, chunkText, embedder?)` in `services/attribution.ts` — exact substring →
      normalized (case/whitespace/punct/currency) → embedding (behind an `Embedder` seam; lexical
      default). 10 unit tests (`attribution.test.ts`), incl. too-short-quote rejection.

## 3. Bridge A — per-chunk suggestedText↔text↔atom alignment — SKIPPED (dormant)

- [→] Not built. Needs WF-05's `-118-map` atom resolver (skipped). Without atoms, the word-level
      `exact` tier can't be produced, so verified claims resolve at `paraphrase` (chunk box, WF-03).
      This is the explicit degrade path — filed as a future precision enhancement, not a gap.

## 4. Compose tiers + attach to citations — DONE

- [x] `assignTier` + `confidenceFor` map verification → `exact|paraphrase|ambient` (+ `[0,1]`
      confidence). `Citation` gained `tier?`/`confidence?`/`answerSpan?` (additive, alongside WF-03 `bbox`).
- [x] Wired into the chat-router citation assembly: each validated citation's quote is verified
      against its snippet → tier + confidence + answerSpan; ambient fallback tagged `ambient`/0.
      Best-effort (never throws). Middleware **492/492**, tsc 0. **Live-verified** on `/api/chat/messages`.

## 5. App — claim segments + tiered highlight — SPLIT to WF-06b

- [→] Moved to **WF-06b** (`2026-05-29-wf06b-tiered-citation-render`): the app `Citation` gains
      `tier`/`confidence`/`answerSpan` + the tiered highlight render (paraphrase translucent /
      ambient chip / exact solid-but-dormant). The middleware already emits the data.

## Closure (middleware core) — DONE

- [x] Middleware **492/492**; tsc 0; drift; OpenSpec validate. (App suite unaffected — middleware-only.)
- [x] **Live-verified** on `/api/chat/messages`: citations carry the WF-06 `tier`/`confidence`
      contract (ambient fallback `tier:"ambient"`/`confidence:0`); the chat turn always succeeds.
- [x] Archive (chat-routing delta only; ui-views render → WF-06b).

## Follow-ups (not in this change)
- WF-05 1b `-118-map` atom resolver → unlocks the `exact` word-level tier.
- Embedding-backed verification + Bridge A alignment (currently lexical / dormant).
- Streaming-time incremental attribution.
