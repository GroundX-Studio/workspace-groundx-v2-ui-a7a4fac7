# Overnight autonomous run journal

**Run start:** 2026-05-22, after baseline gate green.
**Run end:** 2026-05-22, after Phase 4 stretch committed.
**Scope authorized:** Phase 0 → Phase 3 (Phase 4 stretch). All five phases committed clean.

## TL;DR for the morning

| Phase | Commit | Net delivery |
|---|---|---|
| **0 Foundations** | `a5ce66a` | 5 new contexts, observability + security middleware, onboarding session endpoint, PII scrubber, contract tests |
| **1 App shell + layout** | `8b2baaa` | AppShell 3-column grid, ResizeHandle a11y separator, useFocusMode (⌥-1/2/3), useResizableSplit (W5 snap zones), StepStrip |
| **2 F1–F7 + fixtures** | `1e07a48` | IngestView / UnderstandView / ExtractView / InteractView / GateView / IntegrateView, OnboardingShell route, placeholder fixtures (Utility/Loan/Solar), shared CiteChip |
| **3 Utility acceptance** | `24d9255` | Playwright golden journey F1–F7 for Utility (9 desktop tests) + two real bugs caught and fixed |
| **4 Loan (stretch)** | `e026c59` | Loan coverage + ExtractView render-mode toggle (Table ↔ JSON) for the workflow-handoff demo, 8 desktop tests including cross-doc citation chips |

**Test counts** (vs baseline 258 / 104):
- App unit: **333 passing** (75 new)
- Middleware unit: **117 passing** (13 new — onboarding session, PII scrubber, metrics endpoint)
- Playwright e2e: **32 passing / 34 properly skipped** (Utility 9 + Loan 8 desktop + scaffold smoke 15 × 3 viewports; deep flow on tablet+mobile deferred to Phase 6)

**Where to look first:**
- `git log --oneline workspace/groundx-v2-ui` — five new commits
- This file (below) — what each phase did + decisions I made
- `MEMORY.md` — unchanged overnight (no new feedback memories; only project facts in the per-phase decisions logs here)

**What's NOT done:**
- **Phase 5 (Solar + Report Builder)** — stopped here on purpose. S3/S3a are the parts I most want your judgment on (report builder, pin-to-report, 142-doc tree, cross-doc rollup canvas). Resuming Phase 5 is the next session.
- Phase 6 (Responsive + a11y + telemetry hardening) — tablet+mobile of the deep flow, axe a11y sweep, Lighthouse budget, mobile sheet patterns
- Phase 7 (Live integration + release hardening) — real Partner customer provisioning, real OpenAI calls, Calendly, Helm, SSO, magic-link sender, fixture content swap

**Fixture-swap checkpoint** (between Phase 6 and 7) is on schedule. Product owes the 11 content artifacts; my placeholder schema/category/field/citation shapes are stable so the swap should be content-only.

**Git push status:**
- Git session expired around 07:15 UTC. Five commits are local on `workspace/groundx-v2-ui`. After you refresh the session (via the harness `git_session` MCP tool or a fresh `harness-publish` call) and `git push`, they'll land on the managed repo.
- `/tmp/gxn-gitsession.json` (the password file) is still 0600 in /tmp. Safe to `shred -u` it.

**Security housekeeping not done overnight:**
- Your OpenAI key and Partner API key are still in `middleware/.env.local` (gitignored). Rotating them at your convenience won't break anything; just re-run `npm run setup:env`.

---

**Boundary rules:** see end of this file.

This file is the trail you read in the morning. Every phase appends a section. Every "hit a fork in the road" choice gets a `→ DECISION` line so you can override it.

---

## Phase 0 — Foundations

### Goal

Establish the production-grade seams: 5 product contexts, observability, security, MSW fixtures, contract-test extensions, and verify the Partner API endpoint map matches what `project-implementation-contract` + auth state machine assume.

### Plan

| # | Item | Notes |
|---|---|---|
| 0.1 | Drop in 5 contexts (stubs) | `AppMode`, `OnboardingSession`, `CanvasOrchestrator`, `AgentToolBus`, `OnboardingSkill` — typed shells, providers, hooks, tests |
| 0.2 | Observability seams (middleware) | OTel SDK init wired but no-op without `OTEL_EXPORTER_*`; prom-client `/api/metrics`; PostHog server stub (suppressed when key absent) |
| 0.3 | Observability seams (app) | PostHog browser stub, Sentry browser stub, Hotjar suppressor for canvas/doc surfaces |
| 0.4 | Security middleware | helmet (CSP); express-rate-limit; PII scrubber lib shared by pino + analytics paths |
| 0.5 | MSW fixtures | Extend mock partner/groundx clients with onboarding-specific routes |
| 0.6 | Contract tests | Extend `apiRouteContract.test.ts` (app + middleware) with onboarding endpoints |
| 0.7 | Partner endpoint verification | Read installed `groundx-partner-api` refs; document mapping decisions inline |
| 0.8 | Three-file project types | Onboarding session, schema, template TS shapes per `project-groundx-types` |

### Decisions log

**D0.1 — Workspace label maps to Partner customer scope.** UI term "Workspace" = top-level org container per the glossary. Partner API has: `customer` (top) → `project` (with attached `bucket`s) → `group`s. Mapping I'm going with:
- UI **Workspace** → Partner `customer` (one per tenant)
- UI **Project** → Partner `project`
- UI **Project** (doc filter) → Partner `group` may be used as a doc-filter facet inside a project later
- Onboarding samples (Utility/Loan/Solar) are *projects* under the anonymous-then-promoted customer
Override if you think Workspace should be a Partner `project` (with the UI "Project" being a `group`) — that's a one-line change in the entity layer.

**D0.2 — Magic link is app-owned.** Partner API only documents Basic Auth login + password reset. F6 spec calls for magic-link as primary commit path. Going with app-owned magic-link middleware (token table, signed URL, email send via Resend/Mailgun envelope behind `EMAIL_PROVIDER` env). On verify, the app calls Partner `POST /customer/login` with stored credentials OR (for first-time signups) `POST /customer/register`. Anonymous session promotes by reusing the existing cookie session id and mutating its `groundxUsername` + encrypted API key after Partner returns.

**D0.3 — SSO disabled by default.** `SSO_ENABLED=false`. F6 gate shows email + Calendly; SSO button not rendered. Decision #25 in stack.

**D0.4 — Anonymous session existence.** Scaffold today only creates a session at register/login. Onboarding needs anonymous sessions from F1. Adding `POST /api/onboarding/session` that creates a session record with `groundxUsername=null`, encrypted-key=null, scoped to onboarding only. The session promotes when register/login completes (cookie id preserved).

---

## Phase 1 — App shell + nav + layout ✓

Done. Commit `phase1-...`. Test count: 323/323 app (was 287), 117/117 middleware.

**Delivered:**
- `useFocusMode` (split / focus-chat / focus-canvas) with Alt+1/2/3 hotkeys
- `useResizableSplit` with W5 snap zones (200, 280, 640/720, 720)
- `AppShell` 3-column CSS grid + Framer Motion AnimatePresence + ResizeHandle a11y separator
- `StepStrip` (W2) with pill state machine + Analyze substeps in dashed bracket

**Decisions log**

**D1.1 — Drag-snap auto-triggers focus mode.** When the user drags the chat width past a snap threshold, the AppShell auto-transitions into the corresponding focus mode (chat-focus or focus-canvas), and dragging back into the live band returns to split. The hook skips the first render so `initialFocus` isn't clobbered. Per spec W5 ("snapping is itself a request").

**D1.2 — Reduced-motion compliance via Framer Motion's prefers-reduced-motion.** No per-component logic; rely on the user agent.

**D1.3 — Existing Dashboard.tsx left alone.** The scaffold's logged-in Dashboard shell remains the route for steady-mode + auth screens. Phase 2 will add a new `OnboardingShell` view that mounts AppShell instead, gated by route + AppMode.

## Phase 2 — Onboarding F1–F7 ✓

Done. Test count: 333/333 app (was 323), 117/117 middleware. Build + verify:preview + 15/15 Playwright e2e all clean.

**Delivered:**
- Placeholder fixtures for Utility / Loan / Solar (`app/src/fixtures/*.ts`). Every literal value tagged `// FIXTURE_PLACEHOLDER`. Fixture shape contract locked by `app/src/fixtures/types.ts`.
- F1 IngestView — three sample cards + 3 BYO tiles; clicking a sample picks scenario + dispatches `showSample` canvas intent + advances to F2; BYO opens the gate.
- F2 UnderstandView — placeholder PDF surface with scan animation (skipped under reduced-motion), streaming thinking notes (setTimeout-chained, terminates at end of list), "Show me the extract" reveal after ~4.5s.
- F3/F4 ExtractView — field rows by category, citation chips, click-to-peek preview pane. Solar (no schema) shows the skip-extract message.
- F5 InteractView — fixture chat replay + free-form input that posts a placeholder "live answers after sign-in" assistant turn.
- F6 GateView — email + book-engineer-call options (no SSO when `SSO_ENABLED=false` per decision #25).
- F7 IntegrateView — three-language code snippet (curl / Python / TS) + agent integrations list + next-steps card.
- Shared `<CiteChip>` — dispatches `highlightCitation` canvas intent.
- OnboardingShell — composes F1–F7 behind AppShell. Route `/onboarding` added.

**Decisions log**

**D2.1 — Heavy view tests deferred to Phase 6.** UnderstandView / ExtractView / OnboardingShell userEvent.click tests caused jsdom to pin at 100% CPU. Root cause is framer-motion + jsdom. Mitigation: framer-motion aliased to a test-only mock in `vitest.config.ts`. IngestView tests pass; rest of view tests come back in Phase 6 with proper Playwright coverage.

**D2.2 — Placeholder fixtures, locked shape.** Every fixture value tagged `// FIXTURE_PLACEHOLDER` for grep. Solar 142 docs + Loan 12 docs are synthetic procedurally-generated. Citation IDs reference fixture doc IDs only.

**D2.3 — F6 GateView commit is a placeholder.** Email submit immediately marks the gate "committed". Real magic-link send-and-verify is Phase 7. Calendly placeholder; production needs `CALENDLY_URL` env.

**D2.4 — Pin-to-report deferred to Phase 5.** When added, decision #12 holds: literal text only on first pin, manual variable bindings later.

---

## Phase 3 — Utility acceptance pass ✓

Done. Playwright Utility golden journey at desktop: 9/9 onboarding-utility tests + 15 scaffold-smoke × 3 viewports = 24 passed, 18 properly skipped (utility tablet+mobile).

**Delivered:**
- `app/e2e/onboarding-utility.spec.ts` — 9 desktop tests covering F1 picker badges, F1→F2, F2 thinking-notes reveal, F3 schema rows + cite chips, F4 citation peek open-on-row-click, F5 fixture chat replay, F6 gate-open-then-dismiss (LC5), F6 commit → magic-link confirmation, F1 BYO opens gate
- Tablet/mobile coverage of the deep flow deferred to Phase 6 via `test.skip` on non-desktop projects
- Bug fix: F5 "Save" now `openGate("save")` AND `advanceFrame("f6")` — previously only advanced the frame so the gate stayed idle
- Bug fix: GateView TextField had `data-testid` on the wrapper instead of the input; moved to `inputProps`
- Polish: GateView email submit is now a real `<button type="submit">` (was a Box requestSubmit dance)

**Decisions log**

**D3.1 — Desktop-only for deep flow tests in v1.** OnboardingShell tablet/mobile responsive forks per spec R3/R4 (tab nav + bottom-anchored chat sheet) haven't been implemented. Running deep-flow tests on smaller viewports would catch layout drift but not feature breakage. Gap closes in Phase 6.

**D3.2 — No `--project=` filter persisted.** Default `test:e2e` runs all viewports. Skip annotations live in spec files.

---

## Phase 4 (stretch) — Loan scenario ✓

Done. Loan adds 8 desktop tests on top of Utility's 9 + scaffold smoke 15×3. Full gate: app 333/333, middleware 117/117, build clean, verify:preview pass, **e2e 32 passed / 34 properly skipped**.

**Delivered:**
- `app/e2e/onboarding-loan.spec.ts` — 8 desktop tests covering Loan badges (Extract + Interact), F1→F2 with first paystub doc, F3 Income/Debt/Anomalies category regions, multi-doc citation chips on `gross_monthly_income` (4 paystub references), citation peek showing all 4 source paystubs, **render-mode Table ↔ JSON toggle (workflow handoff demo)**, F5 DTI replay, negative check that Utility does NOT show the JSON toggle.
- ExtractView gained a render-mode toggle visible only on scenarios that support JSON output (Loan today). JSON output is built deterministically from the fixture schema so it's a real workflow-handoff artifact.

**Decisions log**

**D4.1 — Render-mode is scenario-driven, not a generic toggle.** Hardcoded `scenario === "loan"` in ExtractView for v1. Will move into the fixture schema (a `renderModes: ["table", "json"]` array) in Phase 5/6.

**D4.2 — Doc-list panel deferred.** Loan spec calls for a 12-doc panel with file-type icons. For v1 the ExtractView shows fields across all docs without listing the docs themselves — citations carry the docId. Phase 5 adds the doc tree component (which Solar's 142-doc hierarchy also needs).

---

## Boundary rules I'm running by

1. **No live API calls** — `MOCK_MODE=true` and `APP_REPOSITORY_MODE=memory` stay on the whole run.
2. **Commit after every phase** to `workspace/groundx-v2-ui` (local only; you push in the morning if git-session expires).
3. **Stop hard on genuine ambiguity** — leave the question here under `Decisions log` with my chosen placeholder.
4. **All placeholder fixtures tagged** `// FIXTURE_PLACEHOLDER` so product can grep them later.
5. **No destructive git operations** — no force-push, no PR creation, no publish, no main-branch action.
6. **Memory writes** only for project facts decided overnight (no feedback memories).

---

## Where to look in the morning

- `git log --oneline workspace/groundx-v2-ui` — phase-by-phase commits
- This file — what I did, what I decided
- `MEMORY.md` index — any new project memory written overnight will be linked here
- Test results at the end of each phase: `npm test`, `npm run verify:preview`, `npm run test:e2e`
