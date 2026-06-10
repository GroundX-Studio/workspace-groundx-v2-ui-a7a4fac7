# Tasks — audit-chat-intent-coverage

> **Execution progress** (2026-06-09)
> - ✅ **T1 — Audit reconciliation** + Review 1 PASSED (30 kinds = 30 cases; 26 emittable / 4 not; no dead/unmapped).
> - ✅ **T2 — Vertical slice** + Review 2 PASSED: shared `intent-catalog` subpath (built, resolves, `tsc` clean); FE replay engine; completeness guard (RED, biting — 29 missing); `highlightCitation` fixture GREEN through the real pipeline; `IntentHarness` dev overlay (`?intents=true`) built, allowlisted, and **browser-verified** (fires → canvas loads real doc p.2 + overlay, **0** `/api/chat/messages`).
> - ✅ **T3 — Fan-out** + Review 3 PASSED: all 30 FE fixtures GREEN through the real pipeline (frame/viewer/gate/overlay/adapter-spy sinks; P4 reply / dispatch / script triggers); completeness guard GREEN; app `tsc` + drift guards green.
> - ✅ **T4 — Middleware corpus** + Review 4 PASSED: 26 tool→intent cases (read→`intents[]`, mutate→`suggestedActions[]`) + 2 parity guards + invalid-arg→`ToolFailure`, all via a stub `LlmClient` (29 tests, zero real LLM).
> - ✅ **T5 — Live suite** + Review 5 PASSED: `prompt` on all 26 emittable entries; live-coverage guard (default suite); gated `intentLive.test.ts` (`INTENT_LIVE`, real `LlmClient`, per-intent selectable) — skips cleanly by default, zero live calls.
> - ✅ **T6 — Finalize** + Review 6 PASSED: dev harness lists all 30 grouped, browser-verified (showExtract fire → Extract frame, 0 `/api/chat/messages`); README at `app/src/conversation/intentFixtures/README.md`.
> - ✅ **CLOSURE**: full app suite 1629/1629, middleware 765/765, `tsc` clean both, drift guards green, OpenSpec `validate --strict` green.
>
> **Post-ship follow-up (2026-06-10):** the standalone `?intents=true` `IntentHarness` was **merged into the single `?debug=true` dev menu** (`DebugOverlay`) — there is now ONE dev menu. The intent panel (`DebugOverlay/IntentDebugPanel`) is surfaced by a "Fire intent" toggle that appears only on canvas (onboarding) screens. Durable contract updated in `openspec/specs/testing-suite/spec.md` (the dev-harness requirement).
>
> **Adversarial review of the follow-up (2026-06-10) — 3 findings, all fixed:**
> - **A (Med):** script fixtures (accept/reject) only fired their seed in the live menu (`getSession` was stubbed `null`). Fixed — panel passes a live `getSession` (ref updated each render) + a real `flush`; new test asserts `acceptSchemaField` lands a field (`0`→`1`).
> - **B (Low):** screen gating used `pathname.includes("/onboarding")` → now `startsWith`.
> - **C (Low):** the toggle's gating went stale on client-side `pushState` nav (overlay only synced on `popstate`). Fixed — a dev-gated effect wraps `pushState`/`replaceState` to re-sync, restored on cleanup, **zero production impact**; new test + browser-verified.
> - Final: app suite **1633/1633**, `tsc` clean, drift guards green, OpenSpec `validate --all --strict` green.
>
> **Live suite executed + tuned (2026-06-10, gpt-5.5):** ran `INTENT_LIVE=1` against the real model. Result **21 passed / 8 skipped / 0 failed**. **18 intents reliably emit single-turn** (asserted); **8 marked `liveSingleTurn:false`** (skipped visibly with a `liveNote`, still covered by FE+middleware corpus): the 5 context-dependent (accept/reject schema+report, pinToReport), `jumpToPage` (under-elicited vs `open_document`), `openGate` + `submitSignup` (model answers in prose / form-driven). Catalog gained `liveSingleTurn`/`liveNote`; live-coverage guard now also enforces a `liveNote` on every skip (no silent gap). The live tier is a **best-effort nondeterministic diagnostic**, not a deterministic gate.

**Execution model.** Tasks run **sequentially**. Each task is immediately
followed by its own **Adversarial Review** — a hostile pass that tries to
*falsify* the task's output against the plan AND the real code. A task is NOT
done, and the next task does NOT start, until its review passes. A failed
review sends the task back to in-progress (principle 3, discipline §10).

T3 is the one **WORKFLOW** fan-out (one unit per intent kind); its adversarial
review is applied **per unit**.

Legend: each task starts with a **failing** test (RED, principle 2) where it
has user-visible/behavioural output.

---

## Task 1 — Audit inventory, reconciled against live code (SEQUENTIAL)

Verify the `design.md` Part-1 inventory against reality; it is an artifact, not
an assumption.

- [x] Enumerate `canvasIntentSchema.options[].shape.kind.value` at runtime;
      assert count + names match the design table (correct the table if not).
- [x] Map every `SERVER_TOOL_CATALOG` `intentBuilder` → a table kind.
- [x] Map every `CanvasOrchestrator` `case` → a table kind; flag orphans.
- [x] Record which kinds are LLM-emittable (have a tool `intentBuilder`) vs not
      — this seeds the shared catalog's `llm`. (Expected: 26 emittable; 4 not —
      `showSample`, `openDocument`, `showCitations`, `editSchema` — confirm.)
- [x] List any dead kind (in the union, unreachable from chat/UI) or unmapped
      tool; file each as a `spawn_task` ticket (NOT fixed here).

### Adversarial Review 1
- Re-run the enumeration independently — do the three sets (schema ⇄ tools ⇄
  orchestrator cases) actually reconcile, or did the table get trusted?
- Is every "LLM-emittable" claim backed by a real tool/derivation path, not a
  guess? Pick 3 at random and trace them in code.
- Are dead/unmapped findings real (open the code) and each ticketed?
- **Gate:** counts reconcile three ways; no unexplained orphan; every defect ticketed.

---

## Task 2 — Shared catalog + FE replay engine + completeness guard + ONE intent + dev surface (SEQUENTIAL)

A complete vertical slice for `highlightCitation`, end to end.

- [x] Add `intentCatalog` (data only) to `@groundx/shared` via a **dedicated
      non-runtime subpath export** (e.g. `@groundx/shared/intent-catalog` — new
      `exports` entry + build wiring), so live prompts / test data never reach
      the production bundle. Typed against `CanvasIntent`; one entry per kind
      from Task 1 (`kind`, `class`, and `llm` = `false` or `{ toolName }` from
      Task 1's tool map — prompts come in Task 5).
- [x] **RED:** `intentCatalog.completeness.test` — asserts (a) every
      `canvasIntentSchema` kind has a catalog entry AND (b) **every catalog entry
      has an FE replay fixture**. Clause (b) fails now (only `highlightCitation`
      has a fixture; the other 29 don't) — that is the RED driver.
- [x] **RED:** FE replay engine + the `highlightCitation` fixture (trigger = a
      canned `ChatReply` with one citation, wrapped via
      `envelope(reply) = { userMessageId, assistantMessageId, compressionRan:false, reply }`
      so `useConversation` reads `result.reply`) + its test asserting the
      `doc-viewer` step + highlight land. Fails before wiring.
- [x] **GREEN:** implement the `IntentFixture` type + replay harness (reusing
      `makeFakeApi` + real providers); pass both for this one kind.
- [x] Add the dev harness surface **following the `DebugOverlay` precedent**
      (query/env-gated, absent from prod) rendering + firing the
      `highlightCitation` fixture. Firing **dispatches the computed intent
      directly** (via the exported derivation helpers / pre-built intent) — it
      MUST NOT call `useConversation.send` (which hits the real LLM in the
      running app). **Add the harness to the `no-hardcoded-styles` allowlist**
      in this same step. Verify in the running app that firing moves the canvas
      (Chrome DevTools measurement, per `memory/feedback_ui_verification_tooling`).

### Adversarial Review 2
- Does the replay actually drive `useConversation`'s derivation (not a shortcut
  that dispatches the intent directly)? Confirm the envelope shape is right by
  temporarily returning the bare reply → test must break.
- Does the completeness guard read the schema at **runtime** (not a hardcoded
  list)? Add a fake kind locally → guard must fail.
- Is the dev surface truly absent from a production build, and does the
  drift-guard pass *because* of the allowlist entry (not by luck)?
- **Gate:** slice GREEN; guard RED for the other 29 (proving it bites); dev
  surface measured in-browser; `shared` + `app` builds clean.

---

## Task 3 — Fan out FE fixtures to all 30 kinds (WORKFLOW — one unit per kind)

- [x] For each remaining kind: one FE fixture whose `expect` asserts the real
      **sink** (ChatStore mutation / adapter spy / onboarding-session call) —
      never a re-assert of the dispatch arg. Use the realistic trigger:
      reply-derived (P1–P5) for the LLM-emittable + suggested-action kinds
      (e.g. `showCitations` via the P2 "show all sources" action), `via:"dispatch"`
      only for the genuinely UI-originated kinds (`showSample`, `openDocument`,
      `editSchema`).
- [x] Completeness guard goes fully GREEN.

### Adversarial Review 3 (PER kind unit)
- Open the fixture: does it assert the sink state, or does it no-op / assert the
  input? A fixture that would pass against a broken sink fails this review.
- Is the trigger the *realistic* path for that kind (e.g. proposals via P5, tool
  intents via P4), or a contrived shortcut?
- **Gate (final unit):** all 30 covered; completeness guard GREEN; `app` vitest green.

---

## Task 4 — Middleware tool→intent corpus (SEQUENTIAL)

- [x] **RED:** parity guard — every `intentCatalog` entry with `llm.toolName`
      has a `toolIntentCase`; every `SERVER_TOOL_CATALOG` `intentBuilder` tool
      is in the catalog. Fails initially.
- [x] For each tool: inject a **stub `LlmClient`** via `chatHandler`
      `deps.llmClient` emitting a scripted tool-call → run `chatHandler` →
      assert `reply.intents[]` carries the expected `DispatchedIntent.intent`.
- [x] One representative invalid-arg case → assert `ToolFailure`, no intent.
- [x] Parity guard GREEN.

### Adversarial Review 4
- Is the LLM truly stubbed (grep the suite for any real client construction)?
- Does the corpus exercise the real validation boundary (valid→intent,
  invalid→failure), or only the happy path?
- File-serial config respected (`memory/project_middleware_vitest_serial`)?
- **Gate:** zero real LLM calls; every intent-bearing tool covered; `middleware` vitest green.

---

## Task 5 — On-demand live-LLM suite, full coverage, middleware layer (SEQUENTIAL)

- [x] Populate `llm.prompt` on **every** LLM-emittable catalog entry — the
      **26 kinds** with a tool `intentBuilder` (per Task 1; `highlightCitation`
      is among them, also reachable via the citation path). The asserted kind is
      the entry's own `kind` — there is no separate `expectKind`. (Task 2 already
      set `llm.toolName`; Task 5 only adds the prompt.)
- [x] **Live-coverage guard:** the set of catalog entries with `llm !== false`
      MUST equal {kinds with a tool `intentBuilder`} (26). An LLM-emittable kind
      missing a prompt fails; a non-emittable kind (`showSample`, `openDocument`,
      `showCitations`, `editSchema`) given a prompt fails. (No silent gap.)
- [x] Add the key-gated suite (middleware project): when `INTENT_LIVE` set + real
      keys, inject a **real `LlmClient`** (same DI seam as Task 4), send each
      `llm.prompt`, assert the reply emits the entry's **`kind`** (assert kind,
      not answer text; bounded retry; on failure report prompt + actual emission).
- [x] Per-intent on demand: `INTENT_LIVE=<kind>` runs exactly one case.
- [x] Skips cleanly when env/keys absent; **excluded from the default gate.**

### Adversarial Review 5
- Run the default gate with keys present but `INTENT_LIVE` unset → confirm NO
  live call and the suite skips (not fails).
- Run `INTENT_LIVE=<oneKind>` → confirm exactly one live case fires.
- Temporarily drop one `llm.prompt` → live-coverage guard must fail.
- **Gate:** default gate makes zero live calls; per-intent selection works; guard bites; gating documented in test header + READMEs.

---

## Task 6 — Finalize dev harness + docs (SEQUENTIAL)

- [x] Dev harness renders all 30 fixtures grouped viewer-loading /
      ux-interaction, each with a "Fire" button + one-line description;
      dev-gated, reset-safe, prod-absent.
- [x] README (in `conversation/` or `shared/`) documenting the catalog + how to
      add an intent (catalog entry → FE fixture → tool case → live prompt) and
      that the guards enforce each layer; note the `INTENT_LIVE` tier.
- [x] Update `memory`/spec cross-refs as needed.

### Adversarial Review 6
- In the running app, spot-check across kinds: every viewer-loading fixture
  visibly changes the canvas; every ux-interaction fixture surfaces its
  card/modal (Chrome DevTools).
- **Confirm firing makes NO `POST /api/chat/messages` call** (Chrome DevTools
  network panel) — proving the harness dispatches directly, not via `send`.
- Confirm the harness is not reachable in a production build.
- **Gate:** in-browser spot-check passes; zero chat-network calls on Fire; prod build excludes the harness.

---

## Closure

- [x] `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict --json` passes.
- [x] `scaffold/app` + `scaffold/middleware` + `scaffold/shared` builds + vitest green; drift guards green; `tsc` clean.
- [x] Durable spec deltas merged on archive (`testing-suite`, `agent-tools`).
- [x] Every audit-found defect is a tracked ticket; none fixed inline here.
