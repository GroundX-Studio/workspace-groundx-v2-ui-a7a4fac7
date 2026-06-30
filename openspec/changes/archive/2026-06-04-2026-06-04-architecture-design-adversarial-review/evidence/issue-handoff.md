# Issue Handoff

## Existing Issues Matched

Open backlog issues verified during Task 10:

| issue | coverage | review note |
|---|---|---|
| [#1 WF-05: word-level citation highlight](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/1) | Citation fidelity enhancement | Covers word-level upgrade; no new citation issue from this review. |
| [#2 Seed Loan + Solar live sample docs](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/2) | Blocked scenario content seeding | Covers Loan/Solar real-doc content gap; not implicated by this review's confirmed findings. |
| [#3 BYO upload: stamp filter.projectId on ingested documents](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/3) | BYO ingest projectId stamping | Adjacent to `ADR-002` but does not cover Smart Report's current render scope key drift. |
| [#5 Steady-mode fidelity audit](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/5) | Future steady-mode wireframe audit | Covers a future fidelity pass; this review did not execute that full backlog item. |
| [#11 SmartReport Utility render returns no_template](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/11) | Utility rendered-section E2E blocker | Adjacent to Smart Report but distinct from `ADR-002`; no-template and scope-key drift need separate closure paths. |
| [#13 Wire page-budget structured answer to page_usage_event usage counts](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/13) | `CF-04` page usage TODO | Covers the live `middleware/src/services/structuredHandler.ts` deferred marker. |
| [#14 Track or retire CF-19 multi-bucket group resolver substrate](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/14) | `CF-19` group resolver TODO | Covers the live `middleware/src/services/groundxSearch.ts` and entity-scope substrate markers. |

Closed issues checked and not reused:

| issue | why not reused |
|---|---|
| [#4 F7 Integrate view: build the real surface + live re-verify](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/4) | Closed after proving the real F7 surface. `ADR-004` is narrower: the remaining UI-02 plugin-download pipeline. |
| [#16 Delete or wire the orphan app-side tool registry](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/16) | Closed by previous work; Task 7 found no app-side runtime registry resurrection. |
| [#17 Normalize scoped project ContentScope filters to projectId](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/17) | Closed for `/projects` scoped route. `ADR-002` covers Smart Report's separate `filter.project` island. |

## New Issues Created

| finding | issue | labels |
|---|---|---|
| `ADR-001` | [#18 Resolve conflicting registerAdapter OpenSpec requirements](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/18) | `backlog`, `tech-debt`, `severity:med`, `area:conversation` |
| `ADR-002` | [#19 Migrate Smart Report scope filters from project to projectId](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/19) | `backlog`, `bug`, `severity:high`, `area:report` |
| `ADR-003` | [#20 Gate frontend analytics behind explicit consent](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/20) | `backlog`, `bug`, `severity:high`, `tech-debt` |
| `ADR-004` | [#21 Track or implement UI-02 plugin downloads for Integrate](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/21) | `backlog`, `feature`, `severity:low`, `area:integrate` |

## Blocked Issue Drafts

None.

## No-Action Findings

| candidate | rationale |
|---|---|
| View/primitive `submit_` / `wizard_` / `close_` tool comments | Current source, tests, and durable agent-tools spec show these were delivered by tool-system-completion; no new issue needed. |
| Air-gap font/docs/Calendly/terms URL seams | Already documented in `docs/agents/airgap-audit.md` as recommended future OpenSpec changes; this review did not find a new current runtime defect beyond that documented scope. |
| Sentry source-map upload | Already documented as `seam-only` in `docs/agents/observability.md`; requires a Sentry project and CI/deploy wiring. |
| F7 Integrate real surface | Closed by [#4](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/4); only UI-02 downloads remain in [#21](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/21). |
