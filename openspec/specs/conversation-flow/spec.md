# conversation-flow Specification

## Purpose
TBD - created by archiving change 2026-05-30-unified-conversation-flow. Update Purpose after archive.
## Requirements
### Requirement: There SHALL be exactly one conversation flow engine + view

The live chat conversation SHALL be implemented by a single durable engine (`useConversation`) and a
single view (`ConversationFlow`), used for BOTH the authenticated/steady experience and onboarding.
There SHALL NOT be per-mode forked flow components that re-implement the chat engine (state, message
projection, send, suggested-action handling, render). The engine SHALL be experience-agnostic: it
SHALL NOT import or depend on onboarding frames, scripts, or navigation, and SHALL read per-session
flags (e.g. `isOnboarding`) from the active chat session rather than hardcoding them.

#### Scenario: One engine serves steady and onboarding

- **GIVEN** the steady chat surface and the onboarding chat surface
- **WHEN** their conversation behavior (state, message projection, send, suggested-action handling) is inspected
- **THEN** both resolve to the one `useConversation` engine + `ConversationFlow` view
- **AND** there is no second flow component duplicating that engine
- **AND** the engine contains no `advanceFrame` / scripted-intro / navigation references.

### Requirement: A directed initial experience SHALL be an OPTIONAL `ChatExperience` selected by composition

The directed initial experience SHALL be an OPTIONAL `ChatExperience` whose every field is optional
(`{ Intro?, seedTurns?, Choreography?, onFirstUserSend? }`; its identity lives on the catalog entry, not
on the experience). It SHALL be selected by COMPOSITION —
the surface that mounts the chat constructs and passes the experience it wants, or passes none. The
presence and shape of the optional `experience` is what varies behavior. With no experience,
`ConversationFlow` SHALL render the plain chat (what was formerly "steady"). An experience SHALL be a
factory that closes over its own typed config (e.g. a `ContentScope` for a workspace/project
experience); its `Intro`/`Choreography` receive only the conversation API. Onboarding SHALL be one such
experience — NOT a privileged code path. Adding a new directed experience (e.g. Workspace, Project)
SHALL require only authoring + composing a `ChatExperience`, not a new flow component.

Experiences SHALL be organized in a **data catalog** (`chatExperienceRegistry`) exposing `all()` and
`byId(id)` with a unique-id invariant, consistent in API + style with the existing content catalogs.
The catalog SHALL be used for **lookup and enumeration only**: the mounting surface looks an experience
up by id, supplies its config, and passes the constructed `ChatExperience` to `ConversationFlow`. The
catalog SHALL NOT resolve an experience from an entry/route context and SHALL NOT mount it — selection
remains the caller's composition decision.

#### Scenario: Onboarding is an experience over the shared flow; no experience = plain chat

- **GIVEN** the onboarding surface and a plain chat surface
- **WHEN** each mounts `ConversationFlow`
- **THEN** onboarding passes `makeOnboardingExperience(...)` (scripted intro + pick-view affordances +
  the f3/f5 auto-advance via its `Choreography`); the plain surface passes NO experience and renders
  the bare chat
- **AND** the onboarding-specific behavior lives in the experience module, not in the engine.

#### Scenario: The experience catalog looks up but does not dispatch

- **GIVEN** the `chatExperienceRegistry` data catalog
- **WHEN** the onboarding surface needs its experience
- **THEN** it calls `chatExperienceRegistry.byId("onboarding")`, supplies the config to the entry's
  `create(...)`, and passes the result to `ConversationFlow`
- **AND** the catalog exposes `all()`/`byId()` with a unique-id invariant (consistent with the existing catalogs)
- **AND** the catalog itself neither inspects an entry/route context to choose an experience nor mounts one.

#### Scenario: A new directed experience needs no new flow component or mode

- **GIVEN** a future "entered from Workspace" experience
- **WHEN** it is added
- **THEN** it is a `ChatExperience` factory (`makeWorkspaceExperience({ scope })`) closing over its
  `ContentScope`, composed at the workspace chat surface
- **AND** no new conversation flow component and no new mode are introduced.

### Requirement: Experience pieces SHALL be components, not conditionally-called hooks

A `ChatExperience`'s `Intro` and `Choreography` SHALL be React components (rendered by
`ConversationFlow`), never hooks the view calls conditionally. This keeps the experience OPTIONAL
without violating the Rules of Hooks; `Choreography` is a render-null component that uses its own hooks
(session, navigation) internally to apply side effects in response to engine lifecycle events.

#### Scenario: An optional experience does not break the Rules of Hooks

- **GIVEN** an experience that is present for some mounts and absent for others
- **WHEN** `ConversationFlow` applies its `Intro`/`Choreography`
- **THEN** they are rendered as components (conditionally rendering is legal)
- **AND** the view does not conditionally call any experience-provided hook.

### Requirement: The conversation SHALL persist across onboarding frame advances without a routing hack

The conversation SHALL retain its `liveTurns` across onboarding frame advances (f2→f3→f5) without any
keep-mounted routing workaround — this follows structurally from one always-mounted `ConversationFlow`
with onboarding rendered as decoration around it. The previous mount-persistence routing hack SHALL be
removed.

#### Scenario: liveTurns survive a frame advance

- **GIVEN** an onboarding conversation with live turns
- **WHEN** the onboarding frame advances (e.g. f2 → f3 → f5)
- **THEN** the existing live turns are retained (the conversation is not remounted/wiped)
- **AND** no keep-mounted routing workaround is required to achieve it.

### Requirement: Workspace and Project SHALL be ChatExperience values, not flow forks

The Workspace and Project chat surfaces SHALL be expressed as `ChatExperience` factories
(`makeWorkspaceExperience({ scope })`, `makeProjectExperience({ scope })`) that close over a
`@groundx/shared` `ContentScope` and are registered in `chatExperienceRegistry` as glob-discovered
`experience` entries with ids `workspace` and `project`. They SHALL reuse the one `useConversation`
engine and the one `ConversationFlow` view; no new flow component and no flow `mode` SHALL be
introduced. A Workspace's scope SHALL be the `bucket` scope; a Project's scope SHALL be a scope whose
`filter` field/value identifies the project within a bucket.

#### Scenario: A new directed experience is added by composition only

- **GIVEN** the shipped `useConversation` engine, `ConversationFlow` view, and `chatExperienceRegistry`
- **WHEN** the Workspace experience is added
- **THEN** it is a `makeWorkspaceExperience({ scope })` factory closing over a `ContentScope`, exported
  as a `ChatExperienceEntry` with id `workspace` and discovered by the registry glob
- **AND** no new conversation flow component and no flow `mode` is introduced
- **AND** the Project experience is the same shape with id `project`, its scope carrying the project `filter`.

#### Scenario: The catalog resolves both experiences and validates their config

- **GIVEN** the `chatExperienceRegistry` data catalog
- **WHEN** `byId("workspace")` and `byId("project")` are read
- **THEN** each resolves to its entry with a `configSchema` that parses a `ContentScope` and rejects a non-scope arg
- **AND** `create(scope)` returns a `ChatExperience` whose pieces match the decided Intro/Choreography
- **AND** the catalog is used for lookup/enumeration only — the mounting surface supplies the scope and composes the result.

### Requirement: The Workspaces and Projects nav entries SHALL open their scoped conversations

The authenticated `OnboardingNav` Workspaces and Projects entries SHALL be enabled (not `aria-disabled`)
and SHALL open a surface that mounts `ConversationFlow` composed with the looked-up Workspace / Project
experience. The `/workspaces` and `/projects` routes those entries target SHALL be registered so neither
404s. Each entry SHALL resolve a distinct, stable `chat_sessions` row for its scope (ensure-created if
absent) so re-opening an entry returns to its own conversation. Logged-out users SHALL still see the
entries disabled with the "Sign in to use" affordance.

#### Scenario: An authenticated user opens the Workspace conversation

- **GIVEN** an authenticated user on a surface that renders `OnboardingNav` (non-`loggedOut`)
- **WHEN** they click the Workspaces entry
- **THEN** the `/workspaces` route mounts `ConversationFlow` composed with
  `chatExperienceRegistry.byId("workspace").create(<workspace scope>)`
- **AND** the conversation uses the Workspace entry's own `chat_sessions` row (re-opening returns to it)
- **AND** the Projects entry behaves identically with the `project` experience and its own session.

#### Scenario: The nav targets resolve and gate on auth

- **GIVEN** the nav entries' navigation targets `/workspaces` and `/projects`
- **WHEN** an authenticated user activates either
- **THEN** the route is registered and the scoped conversation mounts (no 404)
- **AND** for a logged-out user both entries remain disabled with `aria-disabled` and the "Sign in to use" title.

### Requirement: Sign-in SHALL use the shared conversation timeline

The app SHALL route sign-in, sign-up, save-to-account, export-gate, BYO,
threshold, and book-call handoff flows through the active `ChatSession` and
the shared `ConversationFlow`. These flows SHALL NOT create a second chat
window, replace the chat column with a gate rail, or mount a parallel chat
component.

The chat composition root SHALL receive explicit sign-in overlay activity from
the shell. It SHALL NOT use `gate.status` as a chat mode switch.

UI-click sign-in entries MAY append short scripted assistant turns because no
LLM user turn exists. Chat-router/tool-triggered sign-in entries SHALL preserve
the LLM-generated assistant reply and suggested actions. The client SHALL NOT
replace an LLM answer with a generic tool-status sentence such as "I am opening
the relevant view now."

#### Scenario: F1 sign-up opens chat in the same session

- **GIVEN** the user lands on `/onboarding` with one anonymous onboarding session
- **WHEN** the user clicks **Sign up**
- **THEN** the route changes to `/onboarding/signup`
- **AND** the same `chatSessionId` remains active
- **AND** `ConversationFlow` mounts
- **AND** assistant guidance appears as ordinary assistant turns in the timeline.
- **AND** `GateChatPanel` / `GateChatRail` test handles are absent from the live
  chat column.

#### Scenario: LLM-triggered save gate keeps the model answer

- **GIVEN** the user asks the chat to save their work
- **WHEN** the chat router returns an assistant answer plus an `openGate` intent
- **THEN** the assistant answer renders in `ConversationFlow`
- **AND** the sign-in overlay opens in the viewer
- **AND** no local replacement status panel hides or rewrites the answer.

#### Scenario: Gate lifecycle does not replace chat

- **GIVEN** `gate.status` is `open`, `dismissed`, or `committed`
- **WHEN** the active session is an onboarding session
- **THEN** `ChatColumn` still resolves to `ConversationFlow` after the user has
  entered sign-in or a sample journey
- **AND** `GateChatPanel` is not mounted for live sign-in behavior.

#### Scenario: Sign-in narration is duplicate-suppressed

- **GIVEN** sign-in guidance has already been appended for
  `chatSessionId + trigger + pathname`
- **WHEN** React re-renders, the user refreshes, or browser back/forward
  replays the same route state
- **THEN** the same opener is not appended again.
- **AND** restored chat history is checked before appending a UI-click opener.

