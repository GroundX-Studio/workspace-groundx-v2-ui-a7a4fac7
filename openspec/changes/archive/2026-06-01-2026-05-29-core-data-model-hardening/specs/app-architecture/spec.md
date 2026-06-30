# Spec Delta — app-architecture (core data-model hardening)

Durable contracts for the structural debts. Behavior-preserving; each lands behind green tests.

## ADDED Requirements

### Requirement: Widgets and tools SHALL be real base classes/objects with a registry

ScopedViewerWidgets, widgets, and tools SHALL be backed by real base classes/objects plus a registry
— not enforced by a test convention alone. A `ScopedViewerWidget` base SHALL carry `scope`-prop
handling, adapt on scope change, and register its `show_*` tool; every main viewer widget SHALL build
on that base; and the tool registry SHALL hold real tool objects. The `widget-contract` test remains
as a guard, but the structure (base + registry) SHALL be the source of truth.

#### Scenario: A viewer widget is a registered ScopedViewerWidget instance

- **GIVEN** a main viewer widget (PdfViewer, Extract, SmartReport, Integrate)
- **WHEN** it is constructed
- **THEN** it builds on the `ScopedViewerWidget` base (scope handling + `show_*` tool registration)
- **AND** it is present in the widget/tool registry, not merely conformant to a test.

### Requirement: The active-intent type SHALL be the single CanvasIntent union

The ChatStore's active-intent slot SHALL use the single `CanvasIntent` discriminated union owned by
the orchestrator, not a `Record<string,unknown> | null` placeholder. The ChatStore SHALL re-export the
orchestrator union via a type-only import of the orchestrator's leaf types module (erased at runtime,
so no circular import forms); no placeholder SHALL remain.

#### Scenario: ChatStore stores a typed CanvasIntent

- **GIVEN** an active canvas intent on a chat session
- **WHEN** it is read from the ChatStore
- **THEN** its type is the orchestrator `CanvasIntent` union (compile-time exhaustive)
- **AND** no `Record<string,unknown> | null` placeholder remains.

### Requirement: ChatMessage SHALL carry its citations in memory

A `ChatMessage` SHALL carry its `citations: Citation[]` as a real in-memory field, written when the
turn is appended. Consumers (the Interact lit-regions, `CiteChip`, report pin-to-section) SHALL read
citations from the ChatStore message, not by polling the persistence API.

#### Scenario: Citations are available without a server poll

- **GIVEN** an assistant turn that arrives with citations
- **WHEN** it is appended to the ChatStore
- **THEN** the in-memory `ChatMessage` exposes `citations`
- **AND** the Interact surface lights the cited regions without polling `listChatMessages`.

### Requirement: ViewerStep kinds SHALL have a single source of truth

The server `ViewerStepKind` SHALL be derived from or shared with the app `ViewerStep`'s kinds, not
hand-mirrored. Adding a viewer-step kind SHALL update one source.

#### Scenario: A new step kind is declared once

- **GIVEN** a new viewer-step kind is added to `ViewerStep`
- **WHEN** the server `ViewerStepKind` is resolved
- **THEN** it reflects the new kind without a separate hand edit.
