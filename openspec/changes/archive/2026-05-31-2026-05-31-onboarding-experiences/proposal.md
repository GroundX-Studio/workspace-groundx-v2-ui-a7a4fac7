# Workspace/Project chat experiences + enable the nav-rail entries

## Why

The unified-conversation-flow change shipped the engine (`useConversation` + `ConversationFlow`),
the optional `ChatExperience` contract, the `chatExperienceRegistry` data catalog, and ONE reference
experience (`makeOnboardingExperience`). The catalog's own durable spec already names the next step
verbatim — "a future 'entered from Workspace' experience … is a `ChatExperience` factory
(`makeWorkspaceExperience({ scope })`) closing over its `ContentScope`, composed at the workspace chat
surface … no new conversation flow component and no new mode." That experience does not yet exist, and
the two authenticated nav-rail entries that would open it are dead ends: `OnboardingNav`'s Workspaces /
Projects rows are disabled stubs when logged-out, and even when enabled `OnboardingShell.handleNavItemClick`
hard-assigns `window.location.assign("/workspaces" | "/projects")` to routes that **are not registered
in `router.tsx`** — clicking either 404s. This change authors the two missing experiences, registers
them in the catalog, and wires the nav entries to surfaces that actually mount them.

It also RELOCATES `SchemaView` from `views/Onboarding/` into the `Extract` widget directory so the
widget imports it as a within-slot sibling. The *retirement* of `SchemaView`'s `live ?? manifest`
fallback — originally planned here — is DEFERRED to its own tracked change
(`2026-05-31-schemaview-live-only-extract`): retiring the manifest arm is breaking under MOCK_MODE
(SchemaView's own tests and the ProposeSchemaFieldCard round-trip mount `<SchemaView />` with no live
props and rely on the manifest arm), so it cannot land until a live extract is available under MOCK_MODE
and a failing test is written first.

## What Changes

1. **INPUT NEEDED (gates everything below)** — the product/design definition of the two new
   experiences: the Workspace and Project Intro copy, the Choreography (if any), and the `ContentScope`
   each nav entry opens on (which bucket = workspace; which `filter` field/value = project).
2. **`makeWorkspaceExperience({ scope })`** — a `ChatExperience` factory closing over a `ContentScope`
   (the `bucket` arm = workspace), mirroring `makeOnboardingExperience`'s factory + `configSchema` +
   glob-discovered `experience` entry shape. Registered in `chatExperienceRegistry` under id `workspace`.
3. **`makeProjectExperience({ scope })`** — same factory shape, closing over a `ContentScope` whose
   `filter` carries the project field/value (project == doc-filter value within a workspace bucket).
   Registered under id `project`.
4. **Enable the nav-rail entries** — register `/workspaces` and `/projects` routes (the destinations the
   nav already assigns to) that mount `ConversationFlow` composed with the looked-up Workspace / Project
   experience, and confirm the authenticated (non-`loggedOut`) `OnboardingNav` renders them enabled.
5. **Per-entry session selection** — each nav entry resolves WHICH `chat_sessions` row it opens
   (a stable per-scope session, ensure-created if absent), so reopening an entry returns to its own
   conversation rather than colliding on one shared session.
6. **RELOCATE `SchemaView` into the `Extract` widget dir** — move
   `views/Onboarding/SchemaView.tsx` → `components/viewer-widgets/Extract/SchemaView.tsx` (a file inside
   the existing widget dir, not a new widget), update the 3 importers, and drop the now-unneeded rule-5
   view-import allowlist entry. The *retirement* of the `?? scenario?.manifest.*` arm is DEFERRED to the
   tracked change `2026-05-31-schemaview-live-only-extract` (breaking under MOCK_MODE — see overview).

### Out of scope

- New flow components or a flow `mode` — explicitly forbidden by the conversation-flow spec; this is
  composition only (author + register + compose a `ChatExperience`).
- The `Extract` widget's and onboarding Intro's `liveSchema ?? manifest` fallbacks — those serve the
  onboarding journey where the manifest is a legitimate pre-live placeholder; only the `SchemaView`
  fallback is retired here. (Track the others separately if they prove dead.)
- The Workspaces/Projects list/picker UI (selecting among many workspaces/projects) — this change opens
  ONE scope per entry per the INPUT-NEEDED decision; a multi-resource picker is a later change.

## Conformance to core architectural decisions

- **Composable, not forked** — adds two catalog VALUES (`workspace`, `project`) on the existing
  experience axis; mechanism (`useConversation` + `ConversationFlow` + the registry) is untouched. No
  new flow component, no `mode`. The second and third real callers of the `ChatExperience` factory are
  named here, earning the abstraction that unified-conversation-flow built.
- **One source of truth** — experiences close over the shared `@groundx/shared` `ContentScope`. (The
  `SchemaView` manifest-arm removal that would collapse its second live-data source is deferred to
  `2026-05-31-schemaview-live-only-extract`, per the no-shortcuts rule: tracked, not orphaned.)
- **Done-able** — done = the authenticated user clicks Workspaces (or Projects) and lands in a real
  scoped conversation (round-trip, user-visible), not a closed seam.

## Affected

- App: `conversation/experiences/workspace/experience.tsx`,
  `conversation/experiences/project/experience.tsx` (new; glob-discovered by `chatExperienceRegistry`);
  `router/router.tsx` + `router/routerPaths.ts` (new `/workspaces`, `/projects` routes); the surface
  that mounts `ConversationFlow` for those routes; `components/layout/OnboardingNav/OnboardingNav.tsx`
  + `views/Onboarding/OnboardingShell.tsx` (`handleNavItemClick`); `SchemaView.tsx` relocated from
  `views/Onboarding/` → `components/viewer-widgets/Extract/` (manifest-arm retirement deferred);
  ChatStore session-selection (per-scope session resolve).
- Specs: `conversation-flow` (the two new experiences as catalog values). The SchemaView live-only
  requirement is NOT in this delta — it moved to the deferred change `2026-05-31-schemaview-live-only-extract`.
