# Issue Handoff

## Existing Issue Matches

### Current Open GitHub Issues

All open issues in `GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7` are
backlog-labeled:

| Issue | Labels | Audit relevance |
|---|---|---|
| `#1` WF-05 word-level citation highlight | `enhancement`, `backlog`, `area:citations` | Candidate handoff for any confirmed citation-geometry/word-map precision gap. |
| `#2` Seed Loan + Solar live sample docs | `backlog`, `blocked`, `content`, `area:scenarios` | Candidate handoff for unseeded Loan/Solar live-data coverage. |
| `#3` BYO upload: stamp `filter.projectId` on ingested documents | `backlog`, `blocked`, `feature`, `area:ingest` | Candidate handoff for BYO scope/RBAC upload stamping. |
| `#5` Steady-mode fidelity audit (wireframe pass) | `backlog`, `design-fidelity`, `area:steady` | Existing handoff for steady wireframe/widget-parity gaps (`SCF-003`). |
| `#11` SmartReport Utility render returns `no_template` | `backlog`, `content`, `severity:med`, `area:report` | Existing handoff for missing Utility rendered-section coverage and SmartReport scope-key subfinding (`SCF-006`). |
| `#13` Wire page-budget structured answer to `page_usage_event` usage counts | `enhancement`, `backlog`, `area:conversation`, `severity:low` | New handoff for deferred page-usage reader (`SCF-001`). |
| `#14` Track or retire CF-19 multi-bucket group resolver substrate | `backlog`, `area:conversation`, `severity:low`, `tech-debt` | New handoff for deferred multi-bucket/group resolver substrate (`SCF-002`). |
| `#15` Replace or retire the enabled scaffold `OnboardingWizard` walkthrough | `backlog`, `severity:med`, `area:onboarding`, `tech-debt` | New handoff for generic signed-in scaffold wizard copy (`SCF-004`). |
| `#16` Delete or wire the orphan app-side tool registry | `backlog`, `area:conversation`, `severity:low`, `tech-debt` | New handoff for duplicate app-side tool registry cleanup (`SCF-007`). |
| `#17` Normalize scoped project `ContentScope` filters to `projectId` | `backlog`, `area:conversation`, `severity:med`, `tech-debt` | New handoff for scoped `/projects` filter-key drift (`SCF-008`). |

### Confirmed Existing-Issue Handoffs

| Finding | Existing issue | Rationale |
|---|---|---|
| `SCF-003` | `#5` Steady-mode fidelity audit: <https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/5> | Issue body already requires fresh `/c/:sessionId`, `/workspaces`, and `/projects` Chrome DevTools evidence, steady widget parity, and explicit tracking for unimplemented surfaces. |
| `SCF-006` | `#11` SmartReport Utility render returns `no_template`: <https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/11> | Issue body already owns restoring Utility rendered-section coverage through the shared Template/Scope/Result architecture. The audit added comment <https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/11#issuecomment-4617034014> for the SmartReport `filter.project` versus `filter.projectId` scope-key subfinding. |

### Current Non-Backlog Issues

None. `gh issue list --state open --search '-label:backlog'` returned `[]`.

### Archived OpenSpec Cross-Check

Archived changes from `2026-06-01` through `2026-06-03` still contain historical
unchecked checkboxes, but the live handoff check found no untracked open
non-backlog issue:

| Archived area | Live state |
|---|---|
| Chrome DevTools E2E blocked surfaces | Former blockers `#4`, `#6`, and `#12` are closed; surviving blockers are open backlog `#5` and `#11`. |
| Required E2E gap closure | `#4`, `#6`, and `#12` were closed with evidence; `#11` remains open backlog; `#5` remains open backlog. |
| Onboarding interactive review / review bugfixes | Filed findings `#7`, `#8`, and `#9` are closed; `#1`-`#6` backlog items were explicitly out of scope or later narrowed/closed. |
| Projects/RBAC/BYO upload scope | BYO upload stamping remains open backlog `#3`; project/session follow-ups `#6` are closed. |
| Loan/Solar live data | Unseeded Loan/Solar live sample coverage remains open backlog `#2`. |
| Word-level citation precision | Word-map fetch work was superseded in archived code; user-visible word-level highlight upgrade remains open backlog `#1`. |

## New Issues Created

| Finding | Issue | Filing decision |
|---|---|---|
| `SCF-001` | `#13` <https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/13> | Filed after final searches found no existing issue for `page_usage_event`, `pages remaining`, page budget, or `CF-04`. |
| `SCF-002` | `#14` <https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/14> | Filed after final searches found no existing issue for multi-bucket/group resolver substrate or `CF-19`. |
| `SCF-004` | `#15` <https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/15> | Filed after final searches found no existing issue for `OnboardingWizard`, scaffold walkthrough, or starter Home page copy. |
| `SCF-007` | `#16` <https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/16> | Filed after final searches found no exact owner for the orphan app-side `toolRegistry` versus middleware `SERVER_TOOL_CATALOG` split. |
| `SCF-008` | `#17` <https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/17> | Filed after final searches found only adjacent issues for `filter.project`/`projectId`, not scoped `/projects` route and project-experience test drift. |

## Blocked Drafts

None.

## No-Action Findings

- No action from Task 3: historical unchecked boxes inside archived OpenSpec
  folders are not active work by themselves when they map to closed issues,
  archived follow-up changes, or current backlog-labeled issues.
- No action from Task 5: `SCF-005` Extract manifest fallback is a transitional
  fallback, not a confirmed shipped defect in this review. The live-only
  standalone SchemaView path has tests proving it does not fall back to manifest
  data when live extract is unavailable.

## Closeout Rule

The OpenSpec change may be archived only when every confirmed finding has one of
these handoff states: existing issue URL, new issue URL, blocked draft caused by
permission failure, or explicit no-action rationale.
