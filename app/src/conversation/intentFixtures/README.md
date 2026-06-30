# Intent coverage — fixtures, guards & harness

End-to-end coverage for every **chat intent** (the `canvasIntentSchema` union,
30 kinds). Built by the OpenSpec change `audit-chat-intent-coverage`.

## The one source of truth

`@groundx/shared/intent-catalog` (`shared/src/intent-catalog.ts`) — a **data-only**
catalog, one entry per intent kind, on a **non-runtime subpath** so its dev/test
data (incl. live prompts) never ships in the production bundle. Both `app` and
`middleware` import it.

```ts
IntentCatalogEntry = {
  kind;                         // one of the 30 canvasIntentSchema kinds
  class: "viewer-loading" | "ux-interaction";
  llm: false                    // not LLM-emittable (UI-only): showSample, openDocument, showCitations, editSchema
     | { toolName; prompt? };   // emittable: the SERVER_TOOL_CATALOG tool + a live prompt
}
```

**26 of 30 are LLM-emittable** (have a tool `intentBuilder`); **4 are not**
(`showSample`, `openDocument`, `showCitations`, `editSchema`).

## The four mechanisms (all keyed off the catalog)

| Mechanism | Where | What it proves | LLM? |
|---|---|---|---|
| **FE replay corpus** | `app` `intentFixtures` + `replayIntent.tsx` | a canned reply / dispatch drives the REAL `useConversation`→orchestrator→ChatStore-sink pipeline | none (mocked) |
| **Completeness guard** | `intentCatalog.completeness.test.ts` | every schema kind has a catalog entry AND an FE fixture | none |
| **Middleware tool→intent corpus** | `middleware` `intentToolCorpus.test.ts` | each tool-call (stubbed LLM) → expected `DispatchedIntent` (read→`intents[]`, mutate→`suggestedActions[]`); + parity guard | none (stubbed) |
| **On-demand live suite** | `middleware` `intentLive.test.ts` | a REAL model emits each emittable intent | **real, opt-in only** |
| **Dev menu panel** | `components/layout/DebugOverlay/IntentDebugPanel` (the single `?debug=true` menu → "Fire intent" toggle, canvas screens only) | fire any intent live & watch the canvas react | none (direct dispatch) |

## Adding a new intent kind

1. Add the kind to `canvasIntentSchema` (shared) — the completeness guard goes RED.
2. Add an `intentCatalog` entry (`shared/src/intent-catalog.ts`) — set `class` and
   `llm` (`false`, or `{ toolName, prompt }` if a tool emits it). Rebuild shared.
3. Add an FE fixture (`fixtures.tsx`) asserting its sink → completeness guard GREEN.
4. If LLM-emittable: add a `toolIntentCase`-covered tool (the middleware parity
   guard enforces it) and a `prompt` (the live-coverage guard enforces it).

## Running

- Default (no LLM): `vitest run` — replay corpus, all guards, middleware corpus.
- Dev menu: open any onboarding URL with `?debug=true`, then click "Fire intent".
- Live (real model, on demand, **never** in CI) — needs the LLM + GroundX
  Partner credentials in the env (source `middleware/.env.local`):
  - all: `INTENT_LIVE=1 vitest run intentLive`
  - one: `INTENT_LIVE=showExtract vitest run intentLive`

### Live results (verified 2026-06-10, gpt-5.5)

Best-effort diagnostic against a nondeterministic model. **18 intents reliably
emit single-turn** (asserted). **8 are marked `liveSingleTurn:false`** and
skipped with a reason (still covered by FE replay + middleware corpus):
- need prior conversational context: `acceptSchemaField`, `rejectSchemaField`,
  `acceptReportSection`, `rejectReportSection`, `pinToReport`
- under-elicited / superseded by a more specific tool: `jumpToPage` (vs
  `open_document`)
- model answers in prose / form-driven, not a chat tool-call: `openGate`,
  `submitSignup`
