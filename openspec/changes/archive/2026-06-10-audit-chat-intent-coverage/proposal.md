# Audit chat intent coverage + build an LLM-free intent test harness

## Why

Chat is the steering wheel of this product. Almost everything the canvas and
the chat rail do is the result of an **intent** — `highlightCitation` opens a
citation, `showExtract` swaps the frame, `proposeSchemaField` surfaces a card,
`openGate` opens the sign-up rail. There are **30 intent kinds** in the single
`canvasIntentSchema` union, reached through five derivation paths from a chat
reply plus direct UI affordances.

Today that surface is only **partially** covered by tests, and there is **no
single place** that proves every intent still fires end-to-end. New intent
kinds have shipped without a coverage check (the union grew to 30 organically).
We need three things:

1. **An audit** — one authoritative inventory of every chat-derived intent,
   classified as *viewer-loading* vs *UX-interaction*, with its derivation path
   and its state sink. (Deliverable lives in `design.md`.)
2. **A way to exercise every intent in chat** — a dev-only harness (a route or
   overlay, per the existing `DebugOverlay` convention) that fires each intent /
   replays each canned reply and shows the canvas + chat reacting live, for
   human QA.
3. **A test layer that proves they work without burning LLM budget** — a
   fixture-replay corpus driving the *real* derivation → dispatch → sink
   pipeline with the LLM stubbed, plus a completeness guard so a new intent
   kind cannot ship without coverage, plus an **on-demand** live-LLM suite that
   can verify **every LLM-emittable intent** against a real model (the whole
   set or one intent) — never part of the standard test run.

## What changes

| Area | Change |
|------|--------|
| `design.md` | The durable intent inventory: all 30 kinds, classification, 5 derivation paths, dispatch sinks, the test architecture. |
| New shared catalog | `intentCatalog` (data only: `kind`, `class`, `llm`) exported from a **dedicated `@groundx/shared` subpath** (NOT the `.` runtime entry, so live prompts / test data never reach the production bundle) — the **single source of truth** both `app` and `middleware` import (they can't import each other's tests). |
| New FE replay corpus | FE fixtures keyed by catalog `kind` (trigger = a canned `ChatReply` or a direct dispatch; expected = assertions on ChatStore/orchestrator/adapter state). |
| New replay engine | One parameterized harness that runs a fixture through the real `useConversation` → `CanvasOrchestrator` → `ChatStore` pipeline using the existing `makeFakeApi` seam (returning the full `{…, reply}` envelope). **Zero LLM calls.** |
| New completeness guard | A test that derives the kind list from `canvasIntentSchema` and fails if any kind lacks a catalog entry or an FE fixture — drift-proof coverage. |
| New middleware corpus | Stub `LlmClient` (via `chatHandler` `deps.llmClient`) → scripted tool-calls → assert each `SERVER_TOOL_CATALOG` tool produces the right `DispatchedIntent`. **Zero real LLM calls.** |
| New dev harness | Dev-gated surface (route or overlay, per the `DebugOverlay` precedent) listing every intent grouped viewer-loading / UX-interaction; "fire" replays the fixture live. Reuses the same fixtures + catalog. |
| New on-demand live-LLM suite | Key-gated (`INTENT_LIVE`), covers **every LLM-emittable intent** against a real model, runnable as a whole or per-intent (`INTENT_LIVE=<kind>`). **Never in the default gate.** Driven by the `llm` field of the shared `intentCatalog` (one source of truth). |
| Spec deltas | `testing-suite` (catalog + corpus + guard + harness + on-demand live suite); `agent-tools` (tool→intent fixture coverage). |

## Scope

**In:** the intent inventory; the shared catalog (subpath export); the FE replay
corpus for all 30 kinds; the middleware tool→intent corpus; the
completeness/parity guards; the dev harness; the on-demand live-LLM suite (full
coverage of every LLM-emittable intent, never in the default gate); spec deltas;
READMEs.

**Out:** changing any intent's behavior, adding/removing intent kinds, changing
the tool catalog, changing the LLM router. This change is **audit + coverage
only** — if the audit finds a genuine defect (a dead kind, an unmapped tool, a
broken derivation), it is logged as a *separate* ticket, not fixed here (keeps
the diff reviewable; a behavior fix gets its own failing-test-first change).

## Conformance to core architectural decisions

Checked against `docs/agents/principles.md`:

- **Composable, not forked (principle 1).** ONE replay engine + ONE
  `IntentFixture` shape, data-driven over the 30 kinds — the axis is *intent
  kind*, not 30 bespoke test files. The shared `intentCatalog` feeds **five**
  mechanisms: FE replay tests, completeness guard, dev harness, middleware
  tool→intent corpus, and the live suite. **Earn-every-axis is satisfied** —
  the catalog has 30 real consumers (every kind) across 5 mechanisms, named up
  front, so it is not speculative.
- **One source of truth (principle 6).** The catalog lives in `@groundx/shared`
  and is typed against `CanvasIntent` — no twin types, and importable by both
  workspaces (the FE-only `intentFixtures` array could not have served the
  middleware layer). The completeness guard derives the kind list from
  `canvasIntentSchema` at runtime, not a hand-copied list, so it cannot
  silently fall out of date.
- **TDD (principle 2).** `tasks.md` starts with the completeness guard failing
  RED (no fixtures) and the first vertical-slice intent test failing RED.
- **Done = user-visible (principle 5).** The vertical slice ships the
  `/dev/intents` route working in the running app early — not just a green seam.
  The replay suite + guard are the developer-facing "it works" proof.
- **No dormant plumbing (principle 5 / discipline §8).** No spec-only fixtures.
  Every fixture is consumed by the guard + harness on the same change. Audit-
  found defects become tracked tickets, never left as commented-out tests.
- **Plain English (principle 4).** Tables over prose; the audit leads with the
  classification matrix.
