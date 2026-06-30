## ADDED Requirements

### Requirement: Extract field editor exposes real rewrite and working preview
The Extract field editor (`FieldInlineEditor`) SHALL wire the real rewrite-with-agent (before→after Accept/Discard) and a per-field preview/Rerun that works for seeded fields, both via the shared `useTemplateItemAgent` hook with the extract-field adapter. The stub `(rewritten)` suffix handler SHALL be removed. Anonymous and authenticated extraction editors SHALL share this code path (same widget, gated only by `role`/`scope`).

#### Scenario: Rewrite on a seeded field
- **WHEN** an anonymous or authenticated user clicks "✨ rewrite with agent" on a seeded field
- **THEN** the grounded agent runs and a before→after proposal appears; Accept populates the form

#### Scenario: Rerun on a seeded field surfaces a value
- **WHEN** the user clicks "↻ Rerun" on a seeded field
- **THEN** the extracted value + confidence is shown in the preview and on the collapsed card (the seeded-field result is no longer dropped)

#### Scenario: No stub suffix remains
- **WHEN** the rewrite affordance is used
- **THEN** no literal "(rewritten)" text is ever appended by the client
