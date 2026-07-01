# Tier-1 engineering principles

How we build here, in priority order. This is the synthesis; the enforceable
rules live in [`discipline.md`](discipline.md) and the per-task gates in
[`cross-plan-execution-order.md`](cross-plan-execution-order.md). When two
principles conflict, the lower number wins.

## 0. Never commit secrets
Non-negotiable, every commit. No `.env*` values; no Partner API `*username`
fields (they hold the API key). See discipline §2.

## 1. Solve to the model — composable over forked
**Add an axis value, not a cross-product of components.** Prefer a stable
abstraction parameterized by a value over a new component per situation.

- **Mechanism stays; policy/data varies.** One engine + injected behavior
  (e.g. `useConversation` + a `ChatExperience`), not a fork per mode/frame.
- **Parameterize by a first-class value**, not by code structure: a `scope`
  (`ContentScope`), a `role` (`WidgetRole`), an experience — orthogonal axes.
  New behavior = a new value on an existing axis.
- **Compose, don't dispatch.** The caller (entry point) composes the unit it
  wants; registries are read **catalogs** (`all`/`byId`), never resolvers.
- **Make the choice explicit.** Required props with an explicit "not
  applicable" (`scope: { type: "none" }`) beat silent omission. Make illegal
  states unrepresentable.
- **Guardrail — earn every axis.** This philosophy's failure mode is
  over-abstraction. Do NOT add a generic base, axis, or framework until a
  second real caller needs it. The explicit `none` is you paying the cost of
  an axis visibly. See [`hacking-vs-solving.md`](hacking-vs-solving.md) +
  [memory: anti-overengineering]. When unsure, build the concrete thing.

The named patterns underneath: mechanism/policy separation, Strategy,
Composition Root (not Service Locator), App Shell + plugins, Specification /
Query-Object (`ContentScope` → `compileScopeFilter`), orthogonal decomposition
(escape the combinatorial fork explosion), narrow-waist interfaces.

## 2. TDD — failing test first, every change
No exceptions for "small". Write the failing user-visible test, then implement,
then refactor. discipline §1.

## 3. Adversarial review after every task
A task is not done until a hostile review of its output passes — against the
plan **and** the real code, not the seam. Falsify every claim against the code.
Fan-out work is gated per unit. discipline §10.

## 4. Plain, succinct English
Talk like a busy engineer: tight, tables over prose, lead with the answer, no
filler, no novels. Ask before long output. State trade-offs in one line.
discipline §3 / §4a.

## 5. Done = user-visible behavior
A seam (interface compiles, mock returns) is `in-progress`, not done. Every
persisted byte gets a read site (round-trip). No dormant plumbing the guards
can't see. Honest commit titles and statuses. discipline §7 / §9.

## 6. One source of truth, one planning surface
Types come from one Zod schema in `@groundx/shared` (`z.infer`); no twin
definitions. Planning is OpenSpec only — no rival tracking files, no tombstones,
verify before flagging. discipline §8.

## 7. Measure twice, cut once — do no harm
Before you REMOVE or materially change existing code, first understand **why it
is there** and **what depends on it**. Existing code is a claim that someone
solved a problem; deleting it without reading that claim is how you trade a fix
for a regression. The fastest way to break something is to delete a thing whose
**second purpose** you never saw.
- **Before cutting, audit the blast radius:** every call site, every test that
  pins the behavior, and the *semantics* (what user-visible thing it guarantees).
  If a test asserts it, that test is documentation of intent — read it, don't just
  update it to green.
- **Look for a second purpose.** A thing that looks like a removable duplicate
  often serves a second case. *Worked example:* the tool-only prose-repair looked
  like a duplicate of the first LLM call, but it also **force-answered** after the
  model exhausted the server-tool loop — the audit caught that, so we removed the
  call only for navigation and kept it for answer-forcing. Blind removal would
  have regressed "the model searched a lot and never answered."
- **Prefer fixing at the source over a compensating add.** If output is wrong,
  fix generation (the prompt / the schema); don't bolt on a second call/branch to
  patch it downstream — that's a fork (principle 1) and it grows unbounded.
- Changing behavior a test encodes is a **deliberate decision**: update the test
  *with a comment explaining the reversal*, never silently.

---

## When you CREATE A PLAN (OpenSpec change)
- [ ] `proposal.md` carries a **`## Conformance to core architectural decisions`** section that checks the change against principles 1, 5, 6 (composable-not-forked? done-able? one source of truth?).
- [ ] `tasks.md` starts with a **failing user-visible test** (principle 2) and tags each task **SEQUENTIAL vs WORKFLOW** + its **adversarial review gate** (principle 3).
- [ ] New variation is a **value on an axis**, not a new forked component (principle 1). If you're adding an abstraction, name the **second real caller** — else don't (guardrail).
- [ ] Deferred work is a **tracked ticket**, never orphaned/dormant code (principle 5).

## When you ADD CODE
- [ ] Failing test first (2). Review your own diff adversarially before claiming done (3).
- [ ] Reuse the shared base (`@groundx/shared`, `ScopedViewerWidget`, `Template`, `ApiError`, the `Catalog<T>` contract) — no dup, no `Record<string,unknown>` placeholder (1, 6).
- [ ] A classification/enumeration (which intents/steps/surfaces are which) lives **once** — next to the union it classifies (e.g. `CANVAS_NON_DOC_NAV_INTENT_KINDS` in `@groundx/shared`, `satisfies` the kind union). Don't re-hardcode a subset per consumer (1, 6).
- [ ] Required, explicit props (`scope`, `role`) — no silent omission, no raw `documentId`/`bucketId`/`projectId` where a `scope` belongs (1).
- [ ] Both sides mirror (app `*.tools.ts` ↔ middleware `SERVER_TOOL_CATALOG`); update `data-model.md` in the same change (6, 5).
- [ ] Round-trip: every byte you persist has a read site (5).

## When you REMOVE or CHANGE existing code (principle 7)
- [ ] List its **call sites** and the **tests that pin it** — read them for intent before touching them.
- [ ] Name the **user-visible behavior** it guarantees, and check for a **second purpose** you might not have noticed.
- [ ] If it looks like a removable duplicate, prove it: what breaks if it's gone? (Run the dependent tests deliberately.)
- [ ] Fix at the source, not with a compensating add (1). Any behavior change to a pinned test is deliberate + commented.
