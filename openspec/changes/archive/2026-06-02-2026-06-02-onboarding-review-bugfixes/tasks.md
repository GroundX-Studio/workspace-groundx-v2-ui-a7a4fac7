# Tasks — onboarding-review bugfixes (#7, #8, #9)

Sequential, highest-severity first. TDD failing-test-first. Each task ends with an
adversarial-review gate (falsify the fix against the real code + a live/real run)
before the next starts. Live runs against real GroundX; node v20; ensure `:3001`/
`:5173` free first.

## T1 — #7 Interact chat 502: key-valid filter composition (SEQUENTIAL) — HIGH

- [ ] **Failing test first** (`middleware/src/services/groundxSearch.test.ts` or a
      focused composition test): given `rbacFilter {projectId:{$in:["p1","p2"]}}`
      + `scopeFilter {projectId:"p1"}`, the composed `body.filter` MUST constrain
      `projectId` ONCE (intersection `{projectId:"p1"}`), NOT `$and` two clauses
      on the same key. Add cases: multi∩multi → `{$in:[…]}`; disjoint → deny-all
      `{projectId:{$in:[]}}`; distinct keys → `$and`; one-sided key → passthrough.
- [ ] Implement a **key-aware merge** replacing the naive `$and` in
      `composeFilters` (groundxSearch.ts): per shared key, normalize each side to
      a value set (string→{x}, array→set, `{$in:[…]}`→set), intersect, emit a
      single clause; combine distinct keys with `$and` (each key once).
- [ ] **Live re-verify:** start servers, pick Utility, ask a question →
      `POST /api/chat/messages` 200 + a grounded answer (no 400/502). Confirm the
      middleware log shows a valid `filter` (single `projectId`).
- [ ] **Re-review F5** (unblocked): cite chip in the answer → click → PDF
      lit-region jump works; capture evidence.
- **Gate:** test RED-before/GREEN-after; the composed filter is single-constraint-
      per-key for every case incl. disjoint (deny-all) + distinct-keys ($and);
      live chat returns a grounded cited answer; no 400/502; F5 cite-jump verified;
      no regression in the existing groundxSearch / chatHandler tests.

## T2 — #8 anon session bootstrap: no failing requests on load (SEQUENTIAL) — LOW

- [ ] Investigate the bootstrap order (`ChatStoreServerHydrator`,
      `api/chatSessions.ts`, `csrfFetch.ts`): why does the first
      `POST /api/chat-sessions` 401 (session/CSRF not yet established) and why does
      a `PATCH /api/chat-sessions/<id>` fire before the create (404)?
- [ ] **Failing test first** (ChatStoreContext bootstrap test): a fresh anon
      bootstrap issues the session-create BEFORE any dependent PATCH, and the
      first create carries the established session/CSRF (no 401/404). Mirror the
      existing "POST before dependent endpoint" ordering test.
- [ ] Fix: establish the anon session (cookie/CSRF via `bootstrapCsrfToken` +
      first response) before the first `POST /api/chat-sessions`, and await the
      create before issuing the PATCH (or make the PATCH upsert/idempotent).
- **Gate:** test RED→GREEN; a clean live load shows NO `chat-sessions` 401 / PATCH
      404 in console+network (re-check via Chrome DevTools); no extra round-trips;
      existing chat-session tests green.

## T3 — #9 F2 reading sync: confirm then fix-or-downgrade (SEQUENTIAL) — LOW

- [ ] Confirm at runtime (Chrome DevTools): pick Utility and sample the canvas
      frame + chat state over the first ~5s. Determine whether the canvas reaches
      F3 BEFORE the ThinkingStream `onDone` fires (real desync) OR the thinking
      notes merely persist as a chat transcript after a correct advance (benign
      screenshot-timing artifact).
- [ ] If REAL: hold the canvas on the F2 doc-viewer/scanner until `onDone`
      (`advanceFrame("f3")`); add a test that the canvas stays on the F2 frame
      while the stream plays. Add a `ui-views` spec delta.
- [ ] If BENIGN: document the evidence; close #9 as not-a-bug (no code change, no
      spec delta).
- **Gate:** verdict is evidence-backed; if fixed, test RED→GREEN + canvas/chat
      agree on a live run; if downgraded, the evidence is recorded on #9.

## T4 — Close-out (SEQUENTIAL)

- [ ] Full middleware + app vitest green; full Playwright e2e green (esp. the
      onboarding + any chat-path specs); `openspec validate --strict`; builds clean.
- [ ] Spec deltas applied (chat-routing #7, conversation-flow #8, ui-views #9 if
      real); `docs/agents` note if a durable rule emerged (filter composition must
      be key-valid).
- [ ] Close Issues #7, #8 (and #9 if fixed; else comment the downgrade). Commit +
      archive + publish (dev) — #7 is a real runtime fix, so deploy is warranted.
- **Gate:** adversarial review — every fix falsified against code + a live run;
      no test gutted; suites + e2e green; issues closed with the fixing commit
      referenced.

---

## Execution results (2026-06-02)

- **T1 (#7, P1): DONE + shipped.** Key-aware `composeFilters` merge — flattens both
  RBAC + scope filters to one clause PER KEY (intersect shared keys; disjoint →
  deny-all `{$in:[]}`; distinct keys → `$and`). Unit test
  `groundxSearch.compose.test.ts` RED→GREEN (6); updated the 2 existing
  composition tests (chatRouter/chatHandler) to the flattened shape;
  middleware 730 + app 1526 green; tsc clean. **Live-verified**: chat returns a
  grounded cited answer ("$7,613.20", Citation·page 1), F5 cite-jump highlights
  the PDF. Issue #7 closed.
- **T2 (#8, low): NOT fixed — reverted, deferred.** Both approaches were
  disproportionate to the self-healing severity: the chosen **middleware** lazy-
  gate exposed a **403 session-ownership race** (the 401-retry was silently
  serializing session creation), and the **FE-ordering** fix rippled real-axios
  establishes into many onboarding component tests. Reverted to clean. Root cause
  + both pitfalls + the recommended dedicated approach are commented on issue #8;
  it stays open. (The conversation-flow spec delta was removed from this change
  since #8 wasn't fixed.)
- **T3 (#9, low): NOT a bug — closed.** Runtime timing samples show the canvas
  advances to F3 exactly when the ThinkingStream completes; no live desync (the
  notes persist only as chat transcript). No code/spec change. Issue #9 closed.
- This change ships ONLY the #7 fix (chat-routing delta).
