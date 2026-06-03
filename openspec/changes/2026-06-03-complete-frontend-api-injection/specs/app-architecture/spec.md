# app-architecture Specification (delta)

## ADDED Requirements

### Requirement: Frontend Api injection SHALL cover every runtime network consumer domain

The injected frontend `Api` surface SHALL cover every app-facing runtime network
consumer domain remaining after the session/chat and auth slices: resource
providers, scenario registry, canvas intent, extract, smart-report/report
templates, viewer/PDF support, reset/sign-up auth helpers, and telemetry/error
capture. Production components, contexts, hooks, and widgets SHALL use `useApi()`
or an equivalent injected app-facing provider, not direct value imports from the
legacy `@/api` aggregate or standalone network modules.

Type-only imports of API wire shapes MAY remain until a dedicated type-surface
cleanup moves them.

#### Scenario: Resource providers use injected resource groups

- **WHEN** a resource provider lists, creates, updates, deletes, or searches
  buckets, documents, groups, projects, workflows, API keys, health, or search
  data
- **THEN** it calls the corresponding injected `Api` resource group
- **AND** it does not value-import `api` from `@/api`

#### Scenario: Viewer and workflow surfaces use injected extract/report groups

- **WHEN** Extract, SchemaView, ProposeSchemaFieldCard, SmartReportBuilder, or
  SmartReportRender performs a network operation
- **THEN** it calls the injected extract, template, workflow, document, or report
  group
- **AND** it does not value-import standalone API modules such as
  `@/api/extractField`, `@/api/smartReport`, or API entity modules

#### Scenario: Scenario and canvas runtime use injected app-facing groups

- **WHEN** scenario registry, canvas intent, sign-up/reset, or PDF-viewer runtime
  code performs network or telemetry work
- **THEN** it reads the injected app-facing surface
- **AND** direct app-facing imports from `@/api/...` or `@/lib/sentry` are absent

### Requirement: Legacy frontend API aggregate SHALL be removed or quarantined after migration

After all runtime consumers migrate, the legacy `@/api` aggregate SHALL no longer
be an app-facing import path. It SHALL either be deleted or quarantined behind the
real injected client implementation so components, contexts, hooks, widgets, and
their tests cannot depend on it.

#### Scenario: Runtime consumers cannot import the legacy aggregate

- **WHEN** the final frontend API injection guard scans production runtime files
- **THEN** no component, context, hook, widget, or view value-imports `@/api`
- **AND** the only remaining value imports from API implementation modules are in
  explicit implementation allowlists such as `api/client.ts` and API module tests
