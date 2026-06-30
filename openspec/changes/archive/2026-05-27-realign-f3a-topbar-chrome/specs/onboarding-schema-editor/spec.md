# Spec Delta — onboarding-schema-editor

## MODIFIED Requirements

### Requirement: F3a topbar SHALL render the spec'd chrome

The topbar SHALL contain, left-to-right:

1. `← back` link (returns to F3 via `advanceFrame("f3")`)
2. Schema title block: `Designing <sample-id> · <category-id>` followed by `v<N> · draft`
3. Flexible spacer
4. `export ▾ JSON·CSV·YAML` button with `🔒` padlock for anonymous users
5. `↻ rerun` button (topbar-level rerun against pinned samples)
6. `💾 Save` button with `🔒` padlock for anonymous users

Padlocks SHALL be visual indicators only — anonymous users can click
both buttons; clicking opens the sign-in gate (F6) rather than no-op.

The topbar SHALL NOT contain an `✎ edit schema ▾` toggle.

#### Scenario: F3a topbar shows the spec chrome

- **GIVEN** the user is on F3a with `utility-bill` selected and `meters` as the focused category
- **WHEN** the editor mounts
- **THEN** the topbar renders, in order:
  `← back` · `Designing utility-bill · meters` · `v1 · draft` · spacer · `export ▾ JSON·CSV·YAML 🔒` · `↻ rerun` · `💾 Save 🔒`
- **AND** clicking `← back` returns the user to F3
- **AND** no `✎ edit schema` button is present
