# Spec Delta — app-architecture (dependency-direction guard)

Durable contract for widget-tier dependency direction. Behavior-preserving; the gate flow is
unchanged. The untangle lands before the guard so the guard ships green.

## ADDED Requirements

### Requirement: Widgets SHALL sit at the top of the dependency tree and import no view or other widget slot

A widget under `components/chat-widgets/` or `components/viewer-widgets/` SHALL import only from the
lower tiers (`brand/`, `primitives/`, `layout/`) and, within its own slot, sibling widgets — and SHALL
NOT import from `views/` nor from the other widget slot. This dependency direction SHALL be enforced by
a `widget-contract` test assertion (rule 5), not by prose convention alone.

#### Scenario: A widget importing a view fails the guard

- **GIVEN** a widget source under `components/chat-widgets/` or `components/viewer-widgets/`
- **WHEN** it imports a module resolving into `views/` (via the `@/views/` alias or a relative path)
- **THEN** the `widget-contract` rule-5 assertion fails
- **AND** the failure names the offending file and import specifier.

#### Scenario: A within-slot widget composite is allowed

- **GIVEN** `ChatColumn` (a `chat-widgets/` widget) mounting the gate composite
- **WHEN** the gate composite lives in `components/chat-widgets/GateChatPanel/` and itself mounts the
  `chat-widgets/GateChatRail` widget
- **THEN** the `ChatColumn` → `GateChatPanel` → `GateChatRail` chain is entirely within the
  `chat-widgets/` slot and passes rule 5
- **AND** no widget imports from `views/`.

#### Scenario: A cross-slot widget import fails the guard

- **GIVEN** a widget source under one widget slot
- **WHEN** it imports a widget from the *other* widget slot (chat-widgets ↔ viewer-widgets)
- **THEN** the `widget-contract` rule-5 assertion fails.
