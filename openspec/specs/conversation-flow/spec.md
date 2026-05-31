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

