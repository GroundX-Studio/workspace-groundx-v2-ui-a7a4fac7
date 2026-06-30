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

---

## When you CREATE A PLAN (OpenSpec change)
- [ ] `proposal.md` carries a **`## Conformance to core architectural decisions`** section that checks the change against principles 1, 5, 6 (composable-not-forked? done-able? one source of truth?).
- [ ] `tasks.md` starts with a **failing user-visible test** (principle 2) and tags each task **SEQUENTIAL vs WORKFLOW** + its **adversarial review gate** (principle 3).
- [ ] New variation is a **value on an axis**, not a new forked component (principle 1). If you're adding an abstraction, name the **second real caller** — else don't (guardrail).
- [ ] Deferred work is a **tracked ticket**, never orphaned/dormant code (principle 5).

## When you ADD CODE
- [ ] Failing test first (2). Review your own diff adversarially before claiming done (3).
- [ ] Reuse the shared base (`@groundx/shared`, `ScopedViewerWidget`, `Template`, `ApiError`, the `Catalog<T>` contract) — no dup, no `Record<string,unknown>` placeholder (1, 6).
- [ ] Required, explicit props (`scope`, `role`) — no silent omission, no raw `documentId`/`bucketId`/`projectId` where a `scope` belongs (1).
- [ ] Both sides mirror (app `*.tools.ts` ↔ middleware `SERVER_TOOL_CATALOG`); update `data-model.md` in the same change (6, 5).
- [ ] Round-trip: every byte you persist has a read site (5).
