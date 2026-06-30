# Chat architecture hardening — specs, prompts, turn routing, catalog parity

## Why

An adversarial review (2026-06-11) of the recent chat work — intent fixes,
extraction-in-prompt, skill-knowledge injection, citation policy, voice rules —
found one active contradiction and a cluster of compose-don't-fork violations:

| Finding | Severity | Problem |
|---|---|---|
| P1 | **High** | `chat-routing` spec still REQUIRES the "all-snippets fallback" for ambient citations — behavior deliberately deleted at the user's direction. Three shipped behaviors (extraction context, skill knowledge, voice rules) have **no durable-spec presence** (skill knowledge is covered only by the completed-but-unarchived `groundx-knowledge-prompt` change, whose keyword-routing mechanism this plan supersedes — it is archived as Task 1's prereq, then renamed + modified). The planning surface contradicts the product. |
| PR1/PR2 | Med | No prompt management: 5 model-facing prompts inline as TS string concat across 4 files; the VOICE rule exists twice and has **already drifted**; the hybrid prompt is a near-fork of the grounded prompt. |
| S1/S2 | Med | Skill retrieval false-positives: plain document questions ("what is the meter number?") inject 3–4.5KB of skill *authoring* guidance per turn (probe-verified). Corpus includes non-knowledge files (ROUTING.md, CHANGELOG.md). |
| I1 | Med | The two citation toggles (highlight / show-all) are copy-paste 15-line twins in the orchestrator. |
| T2/PR3 | Low | Per-tool usage guidance duplicated between the grounded prompt and the tools' `description` fields; snippet-header formatting implemented twice. |
| T1 | Med | `toolCatalog.ts`'s own header says hand-mirroring ends "past ~10 tools" — it has 26. The parity guard covers name + role + description + `rendersWidget` reachability; `category`, `availableSteps`, and input schemas can still silently diverge from the app-side `*.tools.ts`. A stale durable requirement ("…agree on tool names and roles") still *permits* a committed manifest, contradicting the gate-answered no-manifest decision — REMOVED in this delta as subsumed. |

## What changes

| Task | Change |
|---|---|
| 1 | **Spec reconciliation**: MODIFY the chat-routing citations requirement (no invented citations — uncited answer ⇒ zero citations; `ambient` = emitted-but-unverified only); ADD requirements for the extraction-context block, skill-knowledge retrieval (with the recorded **one-shot pipeline constraint** — injection, not a lookup tool, until a tool-result loop exists), and the voice rules. |
| 2 | **Prompt module**: `middleware/src/services/prompts/` — the single home for every model-facing prompt; shared fragments (`VOICE`, citations contract, snippet header); consumers import, never inline. |
| 3 | **Hybrid full-merge**: hybrid mode becomes the third caller of `groundedAnswerOverScope` via a new optional `structuredContext` block; `HYBRID_SYSTEM_PROMPT` deleted. Accepted behavior change: hybrid answers gain real citation verification. |
| 4 | **LLM turn router** (user-directed design): a light-LLM classifier plans each turn's retrieval — `{ documentSearch, productKnowledge, … }` as an **extensible** Zod-validated decision record gating BOTH `searchGroundX` and `skillsRetrieve`; deterministic fallback (current behavior) when the light model is absent/slow/erroring. Plus corpus cleanup (exclude ROUTING/CHANGELOG). |
| 5 | **Toggle helper**: one `togglesOffOnRepeat` util; both orchestrator citation toggles refactor onto it (behavior-preserving). |
| 6 | **Tool-guidance dedup**: per-tool prompt paragraphs derived from the tools' own `description` fields; `fieldExtractor` adopts the shared snippet header. |
| 7 | **Full-shape catalog parity**: extend the existing app-side cross-package parity guard (`catalog-parity.test.ts`) from name+role+description to **full shape** (category, steps, input JSON-Schemas via `zodToJsonSchema`); fix the stale `toolCatalog.ts` "manifest past ~10 tools" header. NO committed manifest — honors the gate-answered 2026-05-31 decision; Vite's `import.meta.glob` makes the in-suite guard the only loader that can see both catalogs. |
| 8 | **Closure**: suites, validate, live probes, archive. |

## Scope

**In:** everything above, including T1 (the full-shape catalog drift fix) per the user's explicit
direction. **Out:** an agentic tool-result loop (the lookup-tool evolution for
skills is *named* in the spec, not built); embedding-based retrieval; changes to
the structured-mode canned answers' tone (noted, separate concern).

## Conformance to core architectural decisions

- **Composable, not forked (principle 1).** Every task converts a fork into an
  axis value: hybrid = `structuredContext` config on the existing grounded seam
  (third caller — axis already earned twice); VOICE = one fragment, N consumers;
  toggles = one helper, compared-field as config; the turn router's decision
  record is the extensibility axis (a new scenario = a new flag, not a new
  classifier); per-tool guidance derives from the catalog (one declaration).
- **Earn every axis.** The prompts module has 5+ real consumers on day one
  (grounded, hybrid-merge path, classifier, extractor headers, summarizers
  optional). The turn-router record starts with exactly the two flags that have
  callers; future flags are named as evolution, not built.
- **One source of truth (principle 6).** Task 1 makes the durable spec match
  shipped reality before anything else builds on it; Task 7 makes the app-side
  `*.tools.ts` declarations authoritative for full catalog shape via the
  cross-package guard (no second artifact to drift).
- **TDD (principle 2)** — every behavioral task starts RED (see tasks.md).
- **Done = user-visible (principle 5)** — closure includes live chat probes for
  each behavior (groundx question, meter question, joke, hybrid question).
- **No dormant plumbing** — the classifier ships wired with its fallback, not
  behind a flag; excluded corpus files are deleted by the sync script, not
  filtered at N call sites.
