# Tasks — Workspace/Project chat experiences + enable nav-rail entries

> TDD: failing test first, then implement, then adversarial review per task. WIP cap = 3.
> Every experience is a glob-discovered `ChatExperienceEntry`; every route mounts the shared
> `ConversationFlow` with the looked-up experience — NO new flow component, NO `mode`.

## 0. Decision gate (blocks all authoring below)

- [x] **INPUT NEEDED → ANSWERED 2026-05-31 — DECISION: default-derived from `makeOnboardingExperience` (steady variant).** (a) Intro = a short summary of the scope's docs + pick-view pills (mirror onboarding's Intro; NO scripted ThinkingStream); (b) Choreography = NONE (steady mode — no f3/f5 frame auto-advance); (c) scope = Workspace → its workspace `bucket` id; Project → `bucket` + the project `filter` field/value. Copy/affordances refined later — author against this default now. Original question retained below for context:
- [ ] _(answered above)_ For the Workspace AND the Project nav entries, specify: (a) the Intro copy
  (header / lead bubbles / any pick-a-view affordances, or "no Intro — bare scoped chat"); (b) the
  Choreography, if any (engine-lifecycle side effects — or "none"); (c) the exact `ContentScope` each
  entry opens on — for Workspace, which `bucket` id is the workspace; for Project, which `bucket` +
  `filter` field/value pair identifies the project. Until answered, the experiences cannot be authored
  truthfully (they would otherwise hardcode a placeholder scope = a forbidden shortcut).

## 1. Workspace experience (SEQUENTIAL — new shared contract)

- [ ] Write failing test `conversation/experiences/workspace/experience.test.tsx`: asserts
  `makeWorkspaceExperience({ scope })` returns a `ChatExperience` whose pieces are the decided Intro /
  Choreography (or their absence), that `scope` is threaded through (e.g. into `scopeHint`/grounding as
  decided), and that the module's `experience` entry has id `workspace` with a `configSchema` that
  parses a `ContentScope` and rejects a non-scope arg.
- [ ] Implement `conversation/experiences/workspace/experience.tsx` mirroring the onboarding module's
  factory + `configSchema` + exported `experience: ChatExperienceEntry`. Factory closes over the
  `ContentScope`; pieces per the decision in task 0.
- [ ] Assert (test) `chatExperienceRegistry.byId("workspace")` resolves (glob discovery) and
  `.create(scope)` validates via the entry `configSchema`.
- [ ] Adversarial review: id unique vs `onboarding`/`project`; no hardcoded scope; module lives OUTSIDE
  `components/{chat,viewer}-widgets/` so the widget-contract guard never applies; `npm run build` green.

## 2. Project experience (SEQUENTIAL — new shared contract)

- [ ] Write failing test `conversation/experiences/project/experience.test.tsx`: same assertions as
  task 1, id `project`, and that the closed-over `ContentScope` carries the project `filter`
  (field + value) decided in task 0.
- [ ] Implement `conversation/experiences/project/experience.tsx` (factory + `configSchema` + entry).
- [ ] Assert `chatExperienceRegistry.byId("project")` resolves + `.create(scope)` validates.
- [ ] Adversarial review: unique id; `filter`-bearing scope round-trips; build green.

## 3. Per-entry chat-session selection (SEQUENTIAL — ChatStore contract)

- [ ] Write failing test: opening the Workspace entry, then the Project entry, then re-opening
  Workspace, each resolves a DISTINCT, stable `chat_sessions` row (per-scope), ensure-created if absent;
  re-opening returns to the same row (does not collide on one shared session).
- [ ] Implement the per-scope session resolve in ChatStore (selector/action that maps a `ContentScope`
  → its session id, ensure-creating). Reuse the existing ensure-create path; do not fork it.
- [ ] Adversarial review: anon + authed both get a server row (per the chat-session storage rule); the
  resolve is idempotent; reset (`resetExperience.ts`) still clears these sessions (extend its test if a
  new keyed structure is introduced).

## 4. Routes + compose experiences at the surface (◑ MIXED)

- [ ] Add `WORKSPACES` (`/workspaces`) and `PROJECTS` (`/projects`) to `router/routerPaths.ts` and
  register both routes in `router/router.tsx` under the providers Outlet (so onboarding/app contexts
  are present), each mounting the surface that hosts `ConversationFlow`.
- [ ] Write failing test: navigating to `/workspaces` mounts `ConversationFlow` composed with
  `chatExperienceRegistry.byId("workspace").create(<decided scope>)` against that entry's session;
  likewise `/projects` → `project`. No new flow component is rendered.
- [ ] Implement the route surface: look the experience up by id, supply its `ContentScope` (task 0
  decision), select its session (task 3), pass the constructed experience to `ConversationFlow`. The
  catalog is used for lookup only — selection is this surface's composition decision.
- [ ] Adversarial review: `/workspaces` + `/projects` no longer 404 (the nav's existing
  `window.location.assign` targets now resolve); grep proves NO second flow component and NO flow
  `mode` was introduced.

## 5. Enable the nav-rail entries (◑ MIXED)

- [ ] Write/extend `OnboardingNav.test.tsx`: with `accountState` ≠ `loggedOut`, the Workspaces and
  Projects rows are ENABLED (not `aria-disabled`) and clicking each fires `onItemClick` with
  `workspaces` / `projects`. (Logged-out stays disabled with the "Sign in to use" title.)
- [ ] Confirm `topItemsFor` already enables the rows for non-`loggedOut` state (it does); add the test
  coverage and any missing `activeKey` highlight wiring so the open entry shows active.
- [ ] Verify `OnboardingShell.handleNavItemClick` lands the user on the now-registered routes (the
  `window.location.assign("/workspaces" | "/projects")` calls). Decide + (if needed) test whether a
  hard reload is still required now that both surfaces share the providers, or whether client-side
  `navigate` is correct; keep whichever the test proves clean.
- [ ] Adversarial review: end-to-end — an authenticated user clicks Workspaces and lands in the scoped
  Workspace conversation (user-visible round-trip), and Projects likewise. Both reachable; neither 404s.

## 6. Retire the SchemaView `live ?? manifest` fallback (SEQUENTIAL)

- [ ] Write failing test in `SchemaView.test.tsx`: when there is NO live schema/values, `SchemaView`
  surfaces the real empty/error ("live extract unavailable") state — it does NOT silently fall back to
  `scenario.manifest.extractionSchema` / `sampleExtractionValues`.
- [ ] Implement: in `SchemaView.tsx` drop the `?? scenario?.manifest.extractionSchema` /
  `?? scenario?.manifest.sampleExtractionValues` arms (lines ~163–164); read live only; render the
  empty/error branch when live is absent. Update `data-extraction-status` default off the live state,
  not `"manifest"`.
- [ ] Adversarial review: grep `SchemaView.tsx` confirms no remaining `manifest.extractionSchema` /
  `manifest.sampleExtractionValues` read; the onboarding `Extract` widget + Intro `derivePickViews`
  fallbacks are UNTOUCHED (out of scope); no other consumer relied on SchemaView's manifest arm.

## 7. Closeout

- [ ] `openspec validate 2026-05-31-onboarding-experiences --strict` passes.
- [ ] Full app test suite + `npm run build` + drift guards green; no `TODO(2026-05-31-onboarding-experiences)` left.
