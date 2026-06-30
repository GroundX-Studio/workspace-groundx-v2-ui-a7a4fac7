# Audit — why I hacked instead of solved (and the rule that stops it)

Filed 2026-05-29 during the smart-report spec planning, after the reviewer caught a string of
shortcuts. This is a root-cause pass on my own behavior so it doesn't recur.

## What I did wrong (the pattern)

| Hack I proposed | Why it was a hack | The real model I skipped |
|---|---|---|
| Make `ContentScope.filter` **mandatory**, **forbid bare bucket** | Hardcoded a rule to force one shape instead of supporting the model. Brittle — breaks the moment scope needs to change. | Scope is a **union the widget supports**; **context** selects. Follow GroundX doc-org, don't legislate it. |
| Per-sample scope = `{documents:[…]}` | Reached for an enumerated doc list because it was the easiest thing to render. | Demos are **projects in one shared workspace bucket** → scope is **`bucket + project filter`**. The org model already answers this. |
| Auto-create a draft template on pin (#6) | "Auto" so I didn't have to design the UX. | Pin needs a **UX: existing template or new?** + explicit create/edit methods. No auto. |
| Treated Report as a new, separate thing | Built it in isolation. | Report and **Extract are the same meta-pattern** (template + scope + generated results) and must **share objects, DB, lifecycle**. |
| Specced `show_*` tools that fail the verb allowlist | Designed spec-only plumbing the enforced guard never saw. | A tool isn't "designed" until it passes `check-tool-quality`. Reconcile spec ↔ guard, or ticket it. |

## Root cause

Each hack traded **conceptual correctness for local convenience** — I picked the shape that was
fastest to render/spec, instead of the shape the existing architecture (doc-org model, the
Extract template/scope/results lifecycle, the tool guards) already implied. The architecture was
knowable (it's in the harness skills + memory); I under-consulted it and invented around it.

## The rule (now locked)

**Solve to the model, not to the demo.** Before adding a type/rule/tool:
1. Find the existing concept it belongs to (doc-org scope, the template/scope/results lifecycle,
   the widget/tool contracts). Reuse it. Generalize, don't special-case.
2. If something must be deferred, it is a **backlog ticket** (OpenSpec `tasks.md` / `spawn_task`),
   never a hardcode, an `auto-`, a dormant stub, or a spec-only tool the guard can't see.
3. A thing is "done" only when the enforced guard passes — not when the spec reads nicely.

See `feedback_no_shortcuts` (memory) and `project_template_scope_results` (the shared
Extract/Report architecture this audit forced me to write down).
