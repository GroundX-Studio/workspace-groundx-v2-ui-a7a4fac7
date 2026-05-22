# Overnight autonomous run journal

**Run start:** 2026-05-22, after baseline gate green.
**Scope authorized:** Phase 0 → Phase 3 (Phase 4 stretch).
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

## Phase 1 — App shell + nav + layout

*(populated as we get there)*

---

## Phase 2 — Onboarding F1–F7

*(populated as we get there)*

---

## Phase 3 — Utility acceptance pass

*(populated as we get there)*

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
