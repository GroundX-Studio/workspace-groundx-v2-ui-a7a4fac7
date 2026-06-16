# viewer-nav Specification

## Purpose
TBD - created by archiving change viewer-nav-redesign. Update Purpose after archive.
## Requirements
### Requirement: Viewer nav content SHALL be resolved from a typed surface context via one pure resolver

The `ViewerWidgetFrame` header content (eyebrow, title, subtitle) SHALL be
computed by a single pure function `resolveViewerNav(ctx, defaults)` from a
typed `ViewerNavContext` discriminated union (`onboarding-step` | `steady-canvas`
| `overlay`), NOT from a per-widget static descriptor spread. The union SHALL be
exhaustively handled (a `never` default), so a new surface is a new union arm
that fails to compile until handled. `chromePolicy` and `contentMode` SHALL
always come from the widget's intrinsic descriptor; any content field the
context does not supply SHALL fall back to that descriptor so the header never
renders blank. The frame component SHALL remain presentational (it SHALL NOT
import the resolver or context).

#### Scenario: Resolver drives header content

- **GIVEN** a viewer widget mounted by a host
- **WHEN** the host builds a `ViewerNavContext` and passes `resolveViewerNav(ctx, descriptor)` to `ViewerWidgetFrame`
- **THEN** the header shows the resolved eyebrow/title/subtitle
- **AND** `chromePolicy`/`contentMode` equal the widget's intrinsic descriptor values

#### Scenario: Unhandled context never renders blank

- **GIVEN** a context arm that sets no title
- **THEN** the resolver returns the widget descriptor's title as the fallback

### Requirement: Journey words SHALL appear only in onboarding, never in steady

For an `onboarding-step` context the eyebrow SHALL be the journey step name and
the title SHALL be the sub-step or feature. The eyebrow value SHALL be stored
mixed-case (for example "Understand" or "Analyze") and SHALL display uppercase via
the `Label` eyebrow variant, so tests assert the value, not the rendered case. For
a `steady-canvas` context the eyebrow SHALL be empty for now (the real workspace
name is deferred to a separate ticket); the title SHALL be the feature name or the
document name.

#### Scenario: Onboarding shows the journey step

- **GIVEN** the onboarding Extract surface (`step: analyze`, `substep: extract`)
- **THEN** the eyebrow value reads `Analyze` and the title reads `Extract`

#### Scenario: Steady shows no journey word

- **GIVEN** the steady Extract surface
- **THEN** the eyebrow is empty
- **AND** the title is the feature name

### Requirement: Every canvas-mounting shell SHALL feed the nav an experience via one merge path

Every shell that mounts the shared canvas SHALL pass the nav an experience value
(onboarding or steady), so the nav shows journey words in onboarding and omits
them otherwise. The three shells that mount the canvas SHALL all feed it:
`OnboardingShell`, `ScopedConversationShell`, and `SteadyShell`. This experience
toggle is a separate concern from the `chatExperienceRegistry` (which composes
chat experiences). There SHALL be exactly one descriptor-merge path (the
resolver); the unused `framePropsFromDescriptor` helper SHALL be deleted.

#### Scenario: All canvas shells feed the nav

- **GIVEN** the three shells that mount the shared canvas
- **THEN** each one passes its experience to the canvas so the nav resolves

#### Scenario: One merge path

- **GIVEN** the resolver is the descriptor-merge path
- **THEN** the unused `framePropsFromDescriptor` helper no longer exists

### Requirement: The document viewer nav SHALL be step-aware

The document viewer SHALL show a different nav for the Understand step than for
the Interact step, because the same `doc-viewer` widget is reused for both. For
Understand the eyebrow value SHALL be "Understand" and the title SHALL be the
document name. For Interact the eyebrow value SHALL be "Analyze" and the title
SHALL be "Interact". The viewer SHALL NOT show one generic label for both steps.

#### Scenario: Understand step nav

- **GIVEN** the doc-viewer mounted for the Understand step
- **THEN** the eyebrow value reads `Understand`
- **AND** the title is the document name (not a generic "Document viewer")

#### Scenario: Interact step nav

- **GIVEN** the doc-viewer mounted for the Interact step
- **THEN** the eyebrow value reads `Analyze`
- **AND** the title reads `Interact`

### Requirement: The Understand surface SHALL show a live processing line via the existing loading slot

The Understand surface SHALL show a live, present-tense processing line while the
document is being ingested, and it SHALL reuse the frame's existing `loading`
slot, not a new subtitle path. The line SHALL read "Reading the document — mapping
each table, paragraph, and figure on the page." It SHALL clear when the scanning
beat ends. The copy SHALL avoid hype words such as magical, seamless,
revolutionary, and unleash.

#### Scenario: Live line while scanning

- **GIVEN** the Understand doc-viewer in its scanning beat
- **THEN** the frame's loading slot shows the live ingest line

#### Scenario: Line clears after scanning

- **GIVEN** the Understand doc-viewer with scanning ended
- **THEN** the loading slot no longer shows the ingest line

### Requirement: The journey vocabulary and step mapping SHALL have a single source

The journey vocabulary SHALL be defined once in a shared journey catalog. That
catalog SHALL hold the step labels, the nav eyebrow and title words, and the
mapping from a viewer step kind to its journey step and sub-step. Both the
StepStrip and the nav resolver SHALL consume this one catalog. There SHALL be no
second hand-maintained copy of the labels or the mapping, and a guard test SHALL
fail the build if a second copy reappears.

#### Scenario: StepStrip and nav read the same catalog

- **GIVEN** the journey catalog defines the Understand step label and eyebrow
- **THEN** the StepStrip pill label and the nav eyebrow both derive from it
- **AND** no inline duplicate of the step-label strings exists in the shell

#### Scenario: Guard rejects a duplicate mapping

- **GIVEN** a second copy of the viewer-step→journey-step mapping is added outside the catalog
- **THEN** the single-source guard test fails

### Requirement: The document name SHALL be resolved from existing state, then an authoritative fetch

The document name shown in the nav SHALL be resolved by reusing already-loaded
state first — `DocumentsContext` (`selectedDocument` / `documents`) or the active
scenario fixtures — and SHALL show a placeholder until the name resolves. An
authoritative `getDocument` metadata fetch is available as a fallback (cached per
id, gated on a resolved id so the `scenario:` placeholder is never fetched), but
on the doc-viewer surface the nav SHALL NOT issue it: the document viewer it
mounts already fetches the X-Ray (which carries the file name) and reports it up,
so the nav reuses that name and avoids a duplicate round-trip for the same
document.

#### Scenario: Document name comes from existing state when present

- **GIVEN** a doc-viewer surface whose document name is already in loaded state
- **THEN** the nav title resolves to that name without a fetch

#### Scenario: Doc-viewer reuses the viewer's resolved name (no duplicate fetch)

- **GIVEN** a doc-viewer surface whose loaded state has the id but no file name
- **THEN** the nav shows the file name the viewer reports from its X-Ray fetch
- **AND** the nav does not issue its own `getDocument` fetch for that document

### Requirement: The frame header SHALL be compact with a separated back button

The header SHALL NOT stack eyebrow, title, and subtitle as three full-width
lines. The eyebrow and title SHALL share one row (the eyebrow as a coral kicker,
separated from the title by a chevron), and the subtitle SHALL drop to a muted
second line only when present. When a back/close action is present it SHALL be an
icon-only button labelled via `aria-label` (not a bordered text button), set
apart from the title block so it does not read as cramped. All spacing/typography
SHALL use chrome tokens (no hardcoded `fontSize`/`fontWeight`/`borderRadius`/hex
literals).

#### Scenario: Eyebrow and title share one row

- **GIVEN** a surface with an eyebrow and a title
- **THEN** the eyebrow renders as a coral kicker on the same row as the title

#### Scenario: Back button is an icon-only labelled control

- **GIVEN** a surface with a `closeAction`
- **THEN** the back/close control is an icon-only button whose accessible name is the action label
- **AND** the action label is not rendered as visible button text

### Requirement: Overlay and Integrate nav SHALL be non-duplicative and entry-point-generic

The sign-up overlay eyebrow SHALL be entry-point-generic
(`UNLOCK THE FULL WORKSPACE`) rather than presuming prior work ("Save your
work"). The Integrate surface SHALL NOT repeat the same word as both eyebrow and
title; its title SHALL be `Connect`.

#### Scenario: Sign-up eyebrow is generic

- **GIVEN** the sign-up overlay reached from a main-page link
- **THEN** the eyebrow reads `UNLOCK THE FULL WORKSPACE`

#### Scenario: Integrate is not duplicated

- **GIVEN** the onboarding Integrate surface
- **THEN** the eyebrow value reads `Integrate` and the title reads `Connect`
- **AND** the eyebrow and title are not the same word

### Requirement: Unused legacy viewer widgets SHALL NOT be retained

The viewer-widget set SHALL contain only widgets reachable through a host mount.
The unused legacy `GateValueProp` widget SHALL be removed (its component, test,
README, and no-llm files), and no guard test SHALL reference it.

#### Scenario: GateValueProp is gone

- **GIVEN** the app source tree
- **THEN** no file or test references `GateValueProp`

