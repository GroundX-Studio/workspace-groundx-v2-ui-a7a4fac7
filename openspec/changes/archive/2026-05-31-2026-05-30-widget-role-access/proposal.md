# Widget contract: access by role + required scope

> Two contract dimensions, one per-widget sweep + one drift guard: (1) replace the binary `mode` lock
> with a `WidgetRole`; (2) make `scope: WidgetScope` a REQUIRED, intentional prop on every widget. Both
> are prop additions enforced by the same `widget-contract.test.ts`, applied in the same Phase 2b pass —
> folded together to avoid a second full widget sweep + a second contract collision.

## Why

The locked widget contract requires every widget to accept `mode: "onboarding" | "steady"`, and to
hide/disable editable affordances when `mode === "onboarding"`. In practice that boolean is **not**
about onboarding — it answers *"is this user allowed to mutate persisted state on this surface?"* That
is **authorization**, not a chat-flow phase. Today it happens to have exactly two values because there
are two states: an uncommitted/anonymous visitor (read-only) and a committed member (full edit).

More roles are coming (e.g. read-only authenticated viewer, editor, admin/owner). A binary `mode`
cannot express them, and overloading the word "onboarding" to mean "locked" is already misleading — it
collides with the just-unified conversation-flow work, which removes onboarding as a *flow mode*. The
two concepts should not share a vocabulary.

So: replace the binary `mode` with a **role** the widget reads to decide what is locked. Roles map to a
single source-of-truth lock policy; widgets ask the policy, they don't re-derive it. This is
role-based access — extensible to N roles — not a chat concept.

**Second dimension — required scope.** A code audit (2026-05-30) found `PdfViewerWidget` takes a raw
`documentId: string` (not a scope), passed from 5 mount sites across 4 view files (often from mock
`scenario.manifest`); NO
mount site passes a `ContentScope` to any widget; and `ContentScope` has no "not applicable" variant. So
a widget can be silently unscoped by omission. We make **`scope` a required, intentional prop on every
widget** — a widget either targets a real `ContentScope` or explicitly declares it takes none. Never
omitted, never a raw `documentId`/`bucketId`/`projectId`.

## What

- **`WidgetScope`** — a new type in `@groundx/shared`: `WidgetScope = ContentScope | { type: "none" }`
  (`widgetScopeSchema`). The `none` variant lives HERE, not in `ContentScope` — the data-call
  `ContentScope` (search / extract / report) stays clean and can never receive a meaningless "none".
- **Every widget's props SHALL include `scope: WidgetScope` (required).** ScopedViewerWidgets
  (PdfViewer · Extract · SmartReport · Integrate) narrow it to a real `ContentScope`; scope-free widgets
  (SignUp, chips, ThinkingStream, gate…) pass the explicit `{ type: "none" }`. A single doc is
  `{ type: "documents", documentIds: [id] }` — `PdfViewer`'s raw `documentId` prop is REMOVED. The
  drift guard requires the `scope` prop (like `role`), so being unscoped is always an intentional choice.
- **`WidgetRole`** — a new source-of-truth Zod enum in `@groundx/shared` (isomorphic). Today:
  `"anonymous"` (uncommitted/pre-signup — read-only) and `"member"` (committed — full edit). Reserved
  for later: `"viewer"`, `"editor"`, `"admin"`/`"owner"`. The enum is the ONLY place new roles are added.
- **`widgetRoleCanEdit(role): boolean`** (+ companion `isWidgetReadOnly`) — the single role→lock policy
  in `@groundx/shared`. Widgets call this instead of testing `mode === "onboarding"`, so the mapping
  lives in ONE place even though the input is a role (no per-widget mapping drift).
- **Widget contract change** — the default-exported component's props type SHALL include
  `role: WidgetRole` (replacing `mode`). When `widgetRoleCanEdit(role)` is false, editable affordances
  SHALL be hidden/disabled; read-only viewing SHALL remain. README "Locked affordances" section and the
  sibling test retarget from `mode="onboarding"` to "read-only roles".
- **Tool scoping** — `WidgetTool.availableIn?: Array<"onboarding" | "steady">` becomes
  `availableIn?: WidgetRole[]`. The chat router exposes a tool when the caller's role is in `availableIn`,
  and **an absent/empty `availableIn` means all roles** (the "available to everyone" default). That is
  the ONLY role check on tool visibility. The `read`/`mutate` `category` is NOT consulted for visibility
  — it drives the confirmation model (auto-run vs. confirm-chip), not authorization. Onboarding's
  `propose`/`accept`/`reject` tools are `mutate` with no `availableIn`, so they stay available to the
  anonymous onboarding user; the "can this user actually persist?" check lives at the save/commit step
  (server-side + the signup gate), never by hiding tools.
- **Role source** — the role is derived from auth/session/gate state (an `AuthContext`/session selector),
  NOT from the conversation flow or a widget prop drilled from onboarding. Mapping today: uncommitted
  anonymous session → `"anonymous"`; signed-in → `"member"`.
- **Drift guard** — `widget-contract.test.ts` checks for a `role` prop (not `mode`); a transitional
  assertion fails the build if any widget still declares `mode: "onboarding" | "steady"`.

## Conformance to core architectural decisions

- **`no-onboarding-duplicates`**: reinforces it — the lock is a user-role concern, not an onboarding
  fork. Same production widget, role decides affordances.
- **Schema-as-source-of-truth**: `WidgetRole` is a Zod enum in `@groundx/shared`; types are `z.infer`.
- **Separation from conversation-flow**: the unified-conversation-flow change removes the *flow* mode;
  this change removes the *widget* mode. Distinct axes, deliberately split into two changes.

## Out of scope

- The actual future roles (`viewer`/`editor`/`admin`) — this change ships the enum + policy + the two
  current roles. Adding a role later is an enum entry + a policy line + tests, no widget churn.
- Server-side authorization / RBAC enforcement on the middleware API (this is the **UI affordance**
  layer; server enforcement of mutate permissions is tracked separately and MUST NOT rely on the client
  role alone).
- Per-field / per-action capability granularity (a capability-set model was considered; role enum +
  central policy chosen for simplicity — see design.md).

## Affected

`@groundx/shared` (new `WidgetRole` + policy), every widget under `app/src/components/{chat,viewer}-widgets/`
(prop rename + README + test), `app/src/test/widget-contract.test.ts` (drift guard), app-side `*.tools.ts`
`availableIn`, the middleware `SERVER_TOOL_CATALOG` + `ServerTool.availableIn`
(`middleware/src/services/toolCatalog.ts`) and the chat router's server-side tool-exposure filter
(`chatRouter.ts` → `toolsForStep`) — the LLM-facing catalog is server-side, so the app-side change alone
is a no-op, `app/src/views/*` (pass `role` not `mode`), the role source in auth/session context.
