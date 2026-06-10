# Design — chat intent audit + LLM-free test harness

This is the source-of-truth design for the change. Part 1 is the **audit**
(the durable inventory). Part 2 is the **test architecture**.

---

## Part 1 — The intent audit

### 1.1 What an "intent" is

An intent is a validated `CanvasIntent` (single Zod union,
`shared/src/index.ts` → `canvasIntentSchema`, **30 kinds**) dispatched through
`CanvasOrchestratorContext.dispatch(intent, source)` where
`source ∈ { user, agent, tour }` (`canvasIntentSchema` excludes `"system"` for
intents via `intentSourceSchema`). Every dispatch triple-writes:
`chatStore.setCurrentIntent` + `chatStore.appendViewerEvent` +
`apiClient.intent.recordIntent` (`POST /api/intent`, fire-and-forget).

### 1.2 Classification matrix — all 30 kinds

**Viewer-loading** = opens or changes *what the canvas shows* (a doc, a frame,
a region). **UX-interaction** = a card / modal / form / gate / wizard / edit
that does not itself load a new document into the viewer.

| # | Intent kind | Class | Built-in vs adapter | Sink |
|---|-------------|-------|---------------------|------|
| 1 | `showSample` | viewer-loading | adapter (F1 picker) | sample flow |
| 2 | `openDocument` | viewer-loading | adapter | doc-viewer step |
| 3 | `highlightCitation` | viewer-loading | built-in | `gotoDocViewer` (+ user-reclick toggle) |
| 4 | `showCitations` | viewer-loading | built-in | `showCitationRegions` |
| 5 | `jumpToPage` | viewer-loading | built-in | `gotoDocViewer` (no bbox) |
| 6 | `showExtract` | viewer-loading | built-in | `advanceFrame("f3")` |
| 7 | `showIntegrate` | viewer-loading | built-in | `advanceFrame("f7")` |
| 8 | `showReport` | viewer-loading | built-in | `advanceFrame("f4")` |
| 9 | `editTemplate` | viewer-loading | built-in | `advanceFrame("f4a")` |
| 10 | `switchFrame` | viewer-loading | adapter | frame switch |
| 11 | `editSchema` | UX-interaction | adapter | schema edit mode |
| 12 | `openGate` | UX-interaction | built-in | `openGate(trigger)` |
| 13 | `proposeSchemaField` | UX-interaction | built-in | `enqueueFieldProposal` |
| 14 | `acceptSchemaField` | UX-interaction | built-in | `acceptFieldProposal` |
| 15 | `rejectSchemaField` | UX-interaction | built-in | `dismissFieldProposal` |
| 16 | `commitGate` | UX-interaction | built-in | `commitGate(method)` |
| 17 | `dismissGate` | UX-interaction | built-in | `dismissGate` |
| 18 | `openBookCall` | UX-interaction | built-in | history pushState → booking |
| 19 | `pinToReport` | UX-interaction | built-in | `pinToReport` |
| 20 | `proposeReportSection` | UX-interaction | built-in | `enqueueReportProposal` |
| 21 | `acceptReportSection` | UX-interaction | built-in | `acceptReportProposal` |
| 22 | `rejectReportSection` | UX-interaction | built-in | `dismissReportProposal` |
| 23 | `editReportSection` | UX-interaction | built-in | `editReportSection` |
| 24 | `deleteReportSection` | UX-interaction | built-in | `removeReportSection` |
| 25 | `submitSignup` | UX-interaction | adapter | SignUpWidget |
| 26 | `wizardNext` | UX-interaction | adapter | OnboardingWizard |
| 27 | `wizardBack` | UX-interaction | adapter | OnboardingWizard |
| 28 | `wizardFinish` | UX-interaction | adapter | OnboardingWizard |
| 29 | `dismissWizard` | UX-interaction | adapter | OnboardingWizard |
| 30 | `closeDialog` | UX-interaction | adapter | DialogTitle |

**Totals: 10 viewer-loading, 20 UX-interaction. 20 built-in, 10 adapter-routed.**
(Task 1 reconciles these counts against the live code as the audit gate; the
table is corrected there if reality differs.)

### 1.3 The five chat → intent derivation paths

How a `ChatReply` (and direct UI) becomes dispatched intents
(`conversation/useConversation.ts`):

| Path | Trigger | Produces | Dispatch source |
|------|---------|----------|-----------------|
| P1 — primary citation | `reply.citations[0]` after a turn lands | `highlightCitation` (auto) | `agent` |
| P2 — show all sources | "Show all sources" suggested action | `showCitations` (all regions) | `user` |
| P3 — suggested-action chip | chip `key="tool:*"` carries a server-built intent; legacy `suggested-intent` | the carried `CanvasIntent`; or `switchFrame` | `agent` |
| P4 — LLM tool calls | `reply.intents[]` (validated `DispatchedIntent`s) | each `.intent` as-is | `agent` |
| P5 — proposal → user action | `reply.proposedSchemaField` enqueues a card; user clicks | `acceptSchemaField` / `rejectSchemaField` | `user` |

Plus **direct UI affordances** (not from a reply): citation chip click →
`highlightCitation` (`user`); pane buttons → wizard / gate / dialog adapter
intents (`user`). All flow through the same `dispatch`.

### 1.4 The middleware half (tool → intent)

`middleware/src/services/toolCatalog.ts` → `SERVER_TOOL_CATALOG`: each tool has
an `intentBuilder(input)` that turns validated LLM tool-call args into the
`CanvasIntent` shape carried in `reply.intents[]`. `chatHandler` /
`chatRouter` validate each tool call against the tool's Zod `inputSchema`;
valid → `DispatchedIntent`, invalid → `ToolFailure`. The app and server
catalogs are kept in parity by an existing drift guard
(`toolCatalog.test.ts`).

### 1.5 Audit gate — what "done" means for Part 1

The inventory above is *verified against code*, not assumed:
- Kind count in the table == `canvasIntentSchema` option count.
- Every `intentBuilder` tool maps to a kind in the table.
- Every orchestrator `case` maps to a kind in the table; no orphan case.
- Any **dead kind** (in the union but unreachable from chat or UI) or
  **unmapped tool** found → logged as a `spawn_task` ticket, not fixed here.

---

## Part 2 — Test architecture (no LLM cost)

### 2.1 The seam that makes it free

The frontend **never calls the LLM** — it calls `api.chat.sendChatMessage()`,
which returns an envelope `{ userMessageId, assistantMessageId, compressionRan,
reply }` whose `reply` is a validated `ChatReply` (the FE reads `result.reply`).
The existing `test/makeFakeApi.ts` already mocks exactly that method. So a
**canned `ChatReply` wrapped in that envelope and replayed through
`makeFakeApi`** exercises P1–P5 and the full dispatch → sink pipeline with zero
LLM cost. On the server, the LLM lives behind a provider abstraction that the
middleware tests stub — so scripted tool-calls flow through *real* validation
without a real model.

This is **legitimate test-doubling of the LLM boundary**, not the retired
MOCK_MODE (which faked the *GroundX data* path). GroundX/data behavior is out
of scope here; only the LLM is stubbed.

### 2.2 One shared catalog, layer-specific fixtures

**Workspace reality — why a single app-side array cannot be the source of
truth.** `app/` and `middleware/` are separate npm workspaces; middleware
**cannot import** `app/src/test/*`. The FE replay needs `ChatReply` triggers +
`expect()` functions that touch *app* state; the middleware corpus + live suite
run server-side. So the one-source-of-truth lives where **both** can import it:
`@groundx/shared`.

**But not in the runtime bundle.** `@groundx/shared` today exposes a single `.`
export (`dist/index.js`) that app + middleware import at *runtime*. The catalog
carries dev/test data — including **live LLM prompt strings** — that must NOT
ship in production. So the catalog lives in a **dedicated, separate module
exported via its own subpath** (e.g. `@groundx/shared/intent-catalog`, a new
`exports` entry), so production code never imports it and it is excluded from
the runtime bundle. (Adding that subpath export + build wiring is part of
Task 2.)

```
@groundx/shared/intent-catalog:  intentCatalog: IntentCatalogEntry[]   // ← THE single source of truth (data only; non-runtime subpath)
  IntentCatalogEntry = {
    kind: CanvasIntentKind;                 // one of the 30, aligned with canvasIntentSchema
    class: "viewer-loading" | "ux-interaction";
    llm: false | { toolName: string; prompt?: string }; // false ⇒ not LLM-emittable; else the emitting tool (+ a prompt, added in Task 5). The live-coverage guard requires `prompt` for every emittable entry. The asserted kind IS `kind` (no separate expectKind).
  }

app/ (FE):         intentFixtures keyed by catalog `kind`
  IntentFixture = { kind; trigger: {via:"reply"; reply: ChatReply} | {via:"dispatch"; intent; source}; expect: (h:HarnessState)=>void }
middleware/:       toolIntentCases keyed by catalog `kind` (scripted tool-call → expected DispatchedIntent for `kind`)
```

The catalog is consumed by FIVE mechanisms; the FE/middleware fixtures attach
the layer-specific bits (triggers, assertions, scripts) keyed by `kind`:

1. **FE replay tests** — for each FE fixture, mount the real providers with
   `makeFakeApi({ chat: { sendChatMessage: () => envelope(fixture.trigger.reply) } })`
   where `envelope(reply) = { userMessageId, assistantMessageId, compressionRan: false, reply }`
   (the shape `useConversation` actually reads via `result.reply`) — or dispatch
   directly — then run `fixture.expect(state)`.
2. **FE completeness guard** — `for (const e of intentCatalog)
   expect(feFixtures.some(f => f.kind === e.kind)).toBe(true)` AND every
   `canvasIntentSchema` kind appears in `intentCatalog`. A new kind with no
   catalog entry or no FE fixture fails. (Drift-proof; the spine of the change.)
3. **Dev harness (2.6)** — renders the FE fixtures grouped by catalog `class`; "Fire"
   runs the trigger against the *live* orchestrator; the canvas reacts on screen.
4. **Middleware tool→intent corpus (2.3)** — for each catalog entry with
   `llm.toolName`, a `toolIntentCase` scripts that tool-call and asserts the
   `DispatchedIntent`.
5. **On-demand live-LLM suite (2.4)** — for each catalog entry where `llm !==
   false`, send `llm.prompt` to the **real** model and assert it emits the
   entry's `kind`.

### 2.3 Middleware tool→intent corpus

Server-side, in the middleware vitest project: inject a **stub `LlmClient`** via
the existing `chatHandler` `deps.llmClient` seam (verified injectable), have it
return a scripted tool-call for each `SERVER_TOOL_CATALOG` tool, run
`chatHandler`, and assert the resulting `reply.intents[]` carries the expected
`DispatchedIntent.intent`. A parity guard asserts every tool with an
`intentBuilder` has a `toolIntentCase`, cross-checked against the shared
`intentCatalog`. Zero real LLM calls. (Middleware vitest is file-serial — see
`memory/project_middleware_vitest_serial`.)

### 2.4 On-demand live-LLM intent suite (full coverage, never in the default gate)

A suite that can verify **every LLM-emittable intent** against a **real model**,
runnable on demand — the whole set or a single intent — but **never** part of
the standard test run.

- **Coverage = every LLM-emittable intent.** Verified against
  `toolCatalog.ts`: **26 of the 30 kinds** have a `SERVER_TOOL_CATALOG` tool
  `intentBuilder` (P3/P4), so the model can emit them; `highlightCitation` is
  also reachable via the citation path (P1) but is already in that 26 (the
  `open_document` tool emits it). For each, send the prompt to the real model
  and assert the reply emits the expected kind.
- **Explicit boundary — no silent gap.** Exactly **4 kinds are NOT
  LLM-emittable** because they have no tool `intentBuilder`: `showSample` (F1
  picker), `openDocument` (adapter/user open), `showCitations` ("Show all
  sources" suggested-action, P2 — user-driven, not a tool), and `editSchema`
  (adapter/user). These have `llm: false` in the catalog and are covered by the
  FE corpus (2.2) only. The guard asserts the live set == {kinds with a tool
  `intentBuilder`} — so the boundary is enforced, not forgotten: a newly
  LLM-emittable kind without a prompt fails, and a non-emittable kind given one
  fails. (Task 1 confirms this 26/4 split against live code before the catalog
  is authored.)
- **Execution layer.** Runs in the **middleware** vitest project, injecting a
  **real `LlmClient`** through the same `chatHandler` `deps.llmClient` seam the
  stub corpus (2.3) uses — NOT in jsdom FE tests (there is no real client
  there). One DI seam, two clients (stub for default, real for live).
- **Gating.** Enabled only when `INTENT_LIVE` is set (+ real LLM/GroundX keys);
  excluded from the default gate command; skips cleanly when unset. Per-intent
  on demand via `INTENT_LIVE=<kind>` (or a vitest `-t` filter on the case id).
- **Nondeterminism.** The model is nondeterministic, so each case asserts the
  **intent kind** emitted (not exact answer text) and may allow a bounded retry;
  failures report the prompt + what the model actually emitted.
- **Why it exists.** Catches drift the canned fixtures cannot — a prompt change,
  a tool-description change, or a model swap that stops eliciting the right tool.
  Because it is on-demand it has no recurring CI cost.

### 2.5 Why not just 30 hand-written tests

A bespoke test per kind is a 30-way fork of the same mount-replay-assert
mechanism — exactly the cross-product the principles forbid. The data-driven
corpus keeps the mechanism singular and the *data* varied, and the completeness
guard makes coverage a property of the data, not of someone remembering to add
a file.

### 2.6 Dev harness surface — follow the DebugOverlay precedent

The repo's established dev-surface convention is a **query/env-gated overlay**,
not a new route: `DebugOverlay` (`?debug=true`, DBG-01) and `NavDebugOverlay`
are mounted by `App.tsx` and gated to dev. The intent harness SHALL follow that
precedent — a dev-gated surface (an overlay toggled by a query flag, or an
`import.meta.env.DEV` route if cleaner) that is **absent from production
builds**. Either way it renders the FE `intentFixtures` grouped by catalog
`class`, with a "Fire" control per fixture.

**Firing must not hit the network.** In the running app `api.chat.sendChatMessage`
is the REAL backend/LLM, so "Fire" MUST NOT route through `useConversation.send`.
Instead it **dispatches the fixture's computed intent(s) directly** to the live
orchestrator — using the exported derivation helpers
(`citationToHighlightIntent` / `suggestedActionToIntent` / `dispatchReplyIntents`)
to turn a reply-triggered fixture into its intents, or the pre-built intent for
a `via:"dispatch"` fixture. The harness demonstrates the **sink/canvas
reaction**; the derivation correctness is what the FE tests (2.2) assert. Zero
LLM calls in the harness, same as the tests.

**Drift-guard note:** `no-hardcoded-styles.test.ts` walks every `.tsx` under
`components/`+`views/`. A dev harness with intentionally off-brand styling MUST
be added to that test's allowlist with the same rationale as `DebugOverlay` /
`NavDebugOverlay`, in the SAME change — otherwise the guard fails. (Called out
so the task plans for it rather than discovering it.)
