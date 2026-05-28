# Spec Delta — app-architecture

## ADDED Requirements

### Requirement: Every widget SHALL conform to the slot contract

Every component placed under `app/src/components/chat-widgets/<Name>/` or `app/src/components/viewer-widgets/<Name>/` SHALL satisfy all five rules below. The drift-guard test at `app/src/test/widget-contract.test.ts` enforces them programmatically.

1. **Single default export** — the directory SHALL contain a
   `<Name>.tsx` file whose default-exported React component is the
   consumer-facing entry point, named after the directory.

2. **Mode prop** — the default-exported component's props type
   SHALL include a `mode: "onboarding" | "steady"` field. When
   `mode === "onboarding"`, editable affordances (input bars,
   save buttons, edit toolbars, etc.) SHALL be hidden or disabled;
   read-only viewing SHALL remain functional.

3. **Sibling README** — a `README.md` SHALL sit alongside the
   `.tsx` file. The README SHALL document: what the widget does +
   its slot, props (required + optional), locked affordances under
   `mode="onboarding"`, events / callbacks fired, and a one-line
   integration example.

4. **Sibling test** — a `<Name>.test.tsx` SHALL sit alongside the
   `.tsx` file. The test SHALL cover: mounting in both `mode`
   values without crashing; locked affordances absent / disabled
   when `mode === "onboarding"`; and any events the widget fires
   on user action.

5. **Dependency direction** — the widget SHALL compose only from
   `app/src/components/primitives/`,
   `app/src/components/brand/`, or
   `app/src/components/layout/`. Widgets SHALL NOT import from
   other widget slots OR from `app/src/views/`.

#### Scenario: Drift guard fires when a widget directory is missing its sibling files

- **GIVEN** a new directory `app/src/components/chat-widgets/ChipsBar/` containing only `ChipsBar.tsx`
- **WHEN** `npx vitest run app/src/test/widget-contract.test.ts` executes
- **THEN** the test fails with an error naming the missing `README.md`
- **AND** the same drift guard fails with an error naming the missing `ChipsBar.test.tsx`

#### Scenario: Drift guard fires when the widget's component is missing the mode prop

- **GIVEN** `chat-widgets/ChipsBar/ChipsBar.tsx` exports a component whose props type lacks `mode`
- **WHEN** the drift guard runs
- **THEN** the test fails with an error naming the widget directory and the missing `mode` prop

#### Scenario: Drift guard accepts a fully-conforming widget

- **GIVEN** `chat-widgets/ChipsBar/` contains `ChipsBar.tsx` (default export with `mode` prop), `README.md` (with required section headers), and `ChipsBar.test.tsx`
- **WHEN** the drift guard runs
- **THEN** the test passes for that directory
