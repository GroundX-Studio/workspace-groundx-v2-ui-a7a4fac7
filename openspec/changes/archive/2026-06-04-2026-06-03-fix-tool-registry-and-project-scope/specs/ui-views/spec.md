## MODIFIED Requirements

### Requirement: The steady ScopedConversationShell SHALL mount viewer widgets via the shared ScopedCanvas path

`ScopedConversationShell` SHALL render `<ScopedCanvas>` in its canvas slot, fed
by the active `ViewerStep` plus the shell's `scope` and `role` — the SAME shared
mount path `OnboardingShell` uses — so that orchestrator-pushed viewer steps
mount the production `PdfViewer` / `Extract` / `SmartReport` / `Integrate`
widgets on real data. The steady canvas slot MUST NOT be a static placeholder
that ignores the active viewer step, and MUST NOT import a viewer widget
directly. When no viewer step is active, the slot SHALL render `ScopedCanvas`'s
idle state, not an empty box.

For the `/projects` route, the shell's base scope SHALL be the workspace bucket
plus `filter.projectId` from the active project/scenario. It SHALL NOT use
`filter.project`.

#### Scenario: Project route scopes by projectId

- **GIVEN** the scenario registry is ready and the first scenario has
  `projectId:"proj_utility"`
- **WHEN** `/projects` mounts the scoped conversation shell
- **THEN** the active chat session scope key contains
  `"projectId":"proj_utility"`
- **AND** it does not contain `"project":"utility"`.

#### Scenario: Citation chip click mounts the PdfViewer in the steady canvas

- **GIVEN** the steady shell is mounted with a workspace scope and an assistant
  turn that carries citations
- **WHEN** the user clicks a `CiteChip` (dispatching `highlightCitation` to the
  `CanvasOrchestrator`)
- **THEN** `scoped-shell-canvas-pane` contains a `pdf-viewer-widget` element
  mounted by `ScopedCanvas` for the cited document/page
- **AND** the widget renders at non-zero width and height.

