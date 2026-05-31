# Spec Delta — agent-tools (finish role gating + the deferred view/primitive tools)

Net-new durable contracts. The two role-aware catalog requirements (catalog assembly + role-scoped
catalog) are owned + MODIFIED by `2026-05-30-widget-role-access`; this delta does NOT re-MODIFY them. It
ADDS only the contracts that change has no requirement for: the app↔server parity guard, the
view/primitive glob-home, the extended verb allowlist, and the three deferred tools.

## ADDED Requirements

### Requirement: The app and server tool catalogs SHALL agree on tool names and roles

The app and server tool catalogs SHALL agree on the set of tool names and each tool's `availableIn` role
set, enforced by an automated guard rather than manual review. The app-side catalog
(`app/src/tools/*.tools.ts`) and the middleware `SERVER_TOOL_CATALOG`
(`middleware/src/services/toolCatalog.ts`) are the two sides. The guard SHALL be a
cross-package NAME+role parity assertion where the packages can share one test cleanly, or a documented
per-package check (e.g. a committed name+role manifest the other side asserts against) where they
cannot. A tool present on one side but absent on the other, or with a divergent `availableIn`, SHALL
fail the guard.

#### Scenario: A tool added on one side without mirroring fails the guard

- **GIVEN** a tool declared in an app `*.tools.ts` with `availableIn: ["member"]`
- **WHEN** the middleware `SERVER_TOOL_CATALOG` omits it or mirrors it with a different `availableIn`
- **THEN** the parity guard fails and names the mismatched tool.

#### Scenario: Matched name + role sets pass

- **GIVEN** every app tool has a server mirror with the same name and the same `availableIn` role set
- **WHEN** the parity guard runs
- **THEN** it passes.

### Requirement: View and primitive tool files SHALL be discoverable by the registry and the quality scanner

The registry glob and the tool-quality scanner SHALL discover `*.tools.ts` files co-located with a view
(`OnboardingWizard`) and a primitive (`DialogTitle`), in addition to the `chat-widgets/*` and
`viewer-widgets/*` slots. The two walkers are `app/src/tools/registry.ts` (`import.meta.glob`) and
`collectToolFiles` in `app/scripts/check-tool-quality.mjs`. Both walkers SHALL use the same discovery
shape so a tool home recognized by
one is recognized by the other; a `*.tools.ts` in a recognized view/primitive home SHALL be subject to
the same quality rules as a widget tool.

#### Scenario: A view-hosted tool file is discovered

- **GIVEN** `OnboardingWizard` ships a co-located `*.tools.ts`
- **WHEN** the registry assembles the catalog and the quality scanner runs
- **THEN** the view's tools appear in the catalog
- **AND** the quality scanner evaluates them against the same rules as widget tools.

#### Scenario: A primitive-hosted tool file is discovered

- **GIVEN** the `DialogTitle` primitive ships a co-located `*.tools.ts`
- **WHEN** the registry assembles the catalog and the quality scanner runs
- **THEN** the primitive's tools appear in the catalog and are quality-checked.

### Requirement: The verb allowlist SHALL admit submit_, wizard_, and close_

`check-tool-quality`'s `ALLOWED_VERBS` SHALL include `submit_`, `wizard_`, and `close_` so the deferred
sign-up, onboarding-wizard navigation, and dialog-dismiss tools pass the verb-prefix rule.

#### Scenario: A submit_/wizard_/close_ tool passes the verb-prefix rule

- **GIVEN** tools named `submit_signup`, `wizard_next`, and `close_dialog`
- **WHEN** the tool-quality guard runs
- **THEN** each tool's verb prefix is allowlisted and it passes the verb-prefix rule.

### Requirement: The SignUpWidget SHALL expose a submit_signup tool

The agent-tool catalog SHALL include a `submit_signup` mutate tool exposed by the F6 SignUpWidget, with
a server-catalog mirror. The widget's submit Button SHALL reference the tool; the input fields SHALL
carry `noTool` with the reason `"value collected by submit_signup"`; the widget's `no-llm.md` opt-out
SHALL be removed.

#### Scenario: The sign-up submit is LLM-invocable

- **GIVEN** the SignUpWidget tool catalog
- **WHEN** it is inspected
- **THEN** a `submit_signup` mutate tool exists, the submit Button references it, and the widget no
  longer declares a `no-llm.md` opt-out.

### Requirement: The OnboardingWizard SHALL expose navigation tools

The agent-tool catalog SHALL include `wizard_next`, `wizard_back`, `wizard_finish`, and `dismiss_wizard`
tools exposed by the OnboardingWizard view, each dispatching the corresponding CanvasIntent, with
server-catalog mirrors. They are navigation tools (auto-dispatch), not state-mutations.

#### Scenario: The LLM advances the onboarding wizard

- **GIVEN** the active surface is the OnboardingWizard
- **WHEN** the LLM emits `wizard_next`
- **THEN** the wizard advances via the dispatched navigation CanvasIntent
- **AND** `wizard_back`, `wizard_finish`, and `dismiss_wizard` are likewise available and dispatch their
  respective intents.

### Requirement: The DialogTitle primitive SHALL expose a close_dialog tool

The agent-tool catalog SHALL include a `close_dialog` mutate tool exposed by the `DialogTitle`
primitive, with a server-catalog mirror. The primitive's close IconButton SHALL reference the tool.

#### Scenario: The LLM dismisses the active dialog

- **GIVEN** a dialog is open with a `DialogTitle` close control
- **WHEN** the LLM emits `close_dialog`
- **THEN** the active dialog is dismissed via the dispatched CanvasIntent
- **AND** the close IconButton references the `close_dialog` tool.
