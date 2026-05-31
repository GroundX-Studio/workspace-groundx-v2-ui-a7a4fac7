# Design — Widget access by role

## Current state (evidence)

- `openspec/specs/app-architecture/spec.md` §"Every widget SHALL conform to the slot contract" rule #2:
  props SHALL include `mode: "onboarding" | "steady"`; `mode === "onboarding"` hides editable affordances.
  README rule #3 + test rule #4 + three drift-guard scenarios all reference `mode`.
- `widget-contract.test.ts` asserts each widget's `.tsx` declares a `mode` prop (regex on `mode\s*[?:]`
  or a destructured `mode`).
- `WidgetTool.availableIn?: Array<"onboarding" | "steady">` (agent-tools spec + `*.tools.ts`); e.g.
  `_template/Template.tools.ts` edit tool is `availableIn: ["steady"]`, `propose_field` is `["onboarding"]`.
- Widgets test `mode === "onboarding"` inline to lock controls (each widget re-derives the lock).

So `mode` is a two-valued authorization flag wearing a chat-phase name, re-derived per widget.

## Target

### 1. `WidgetRole` — source of truth (`@groundx/shared`)
```ts
export const widgetRoleSchema = z.enum(["anonymous", "member"]); // extend here only
export type WidgetRole = z.infer<typeof widgetRoleSchema>;
```
Today's mapping from the old binary: `"onboarding"` → `"anonymous"`, `"steady"` → `"member"`. Reserved
future values (`"viewer"`, `"editor"`, `"admin"`/`"owner"`) are added as enum entries when real.

### 2. The lock policy — ONE place (`@groundx/shared`)
```ts
const EDIT_ROLES = new Set<WidgetRole>(["member"]);      // grows as roles are added
export function widgetRoleCanEdit(role: WidgetRole): boolean { return EDIT_ROLES.has(role); }
export function isWidgetReadOnly(role: WidgetRole): boolean { return !widgetRoleCanEdit(role); }
```
This is the answer to the option we chose (**role enum**, not capability-set): widgets receive a role,
but the role→lock mapping is centralized so a widget never hardcodes `role === "anonymous"`. Adding a
read-only authenticated `"viewer"` later = leave it out of `EDIT_ROLES`; zero widget edits.

> **Why role enum, not a capability set.** A capability set (`{ canEditTemplate, canRunExtract, … }`)
> is more granular but front-loads a taxonomy we don't yet need and spreads permission logic into every
> call site. A single role + one `canEdit` policy covers every current and near-term case (lock-all vs
> edit-all). If per-action granularity is ever needed, `widgetRoleCanEdit` becomes
> `widgetRoleCan(role, action)` without touching the prop contract. Chosen for YAGNI + one-place policy.

### 3. Widget contract after

> **Two access axes (don't conflate — the matrix review surfaced this).**
> 1. **Availability** — which roles ever *mount* the widget. This is where role has real teeth today:
>    `SignUpWidget` / `GateChatRail` / `GateValueProp` are **anonymous-only**, enforced at the mount site
>    from session/gate state (the view decides what to mount). The `role` prop is not the enforcement.
> 2. **Affordance lock** — within a visible widget, which controls a role may use. **No widget locks an
>    affordance by role today** — verified by reading all 10. So the `role` prop on widgets is
>    forward-looking (future `viewer`/`editor`) + contract-satisfying; it reproduces no current lock.
>
> Consequently most widgets' `mode` is either cosmetic (drop) or flow/phase behavior to **re-source**
> (`ThinkingStream` replay-persist, `BookCallView` chrome, `ChatColumn` flow dispatch) — NOT a rename to
> `role`, which would re-encode phase as role. No SHIPPED production tool declares `availableIn` today —
> they default to all roles. The only tool that declares it is `edit_template` in the `_template`
> reference scaffold (`availableIn:["steady"]`), which ESTABLISHES the role-restriction pattern; the
> role restriction is the pattern to apply, not a shipped fact. Full per-widget/per-tool decisions:
> `docs/agents/widget-access-matrix.md`.

- Props: `role: WidgetRole` (was `mode`).
- Lock check: `if (isWidgetReadOnly(role)) …` (was `if (mode === "onboarding")`).
- README: "## Locked affordances (read-only roles)" replaces "under `mode="onboarding"`".
- Test: mounts under `"anonymous"` AND `"member"`; asserts editable affordances absent under a
  read-only role and present under an edit role; covers fired events.
- Drift guard: requires a `role` prop; a transitional check FAILS if `mode: "onboarding" | "steady"`
  still appears in any widget (prevents half-migrated drift).
- **Container widgets** (e.g. `ChatColumn`) that don't lock anything themselves still declare `role` and
  simply forward it to the leaf widgets/tools inside them — no exemption needed, the prop is uniform.

> **Ordering with the conversation-flow change.** `ChatColumn` is itself a contract widget that today
> carries the *flow* `mode` (`"onboarding" | "steady"`). The unified-conversation-flow change removes
> that flow `mode`. Because the drift guard requires the prop, **this change (widget-role-access) MUST
> land first or together** — so the guard already asks for `role`, and conversation-flow's rewritten
> `ChatColumn` carries `role` (forwarded down) instead of the deleted flow `mode`. If conversation-flow
> landed first alone, the guard would go red. This ordering is mirrored in both changes' tasks.

### 4. Tool scoping after
`availableIn?: WidgetRole[]`. The chat router's tool-exposure filter is ONLY:
```
expose tool IF (availableIn is undefined/empty  →  all roles)  OR  role ∈ availableIn
```
`category` (`read`/`mutate`) is NOT part of visibility — it drives the confirmation model
(auto-run vs. raise-a-chip), which is orthogonal to who may see the tool. **Do not gate visibility by
`category × role`** — that was the original mistake: it would hide onboarding's `mutate` tools from the
anonymous user who needs them.

Mapping the existing values:
- `edit_template` — the `_template` reference scaffold's tool (`availableIn:["steady"]`) → `["member"]`.
  It is the only tool that declares `availableIn`; it is the PATTERN reference, not a shipped production
  tool. The mapping is correct: you don't offer "edit the *saved* template" to an anonymous user.
- `propose_schema_field` / `accept_proposal` / `reject_proposal` and every other SHIPPED production tool —
  **no `availableIn` today** (verified), so they stay unrestricted = all roles. The anonymous onboarding
  user keeps them. ✅

> **Where authorization actually lives.** `WidgetRole` gates two things only: (a) which editable
> *affordances* a widget shows (`isWidgetReadOnly`), and (b) which tools a role may *see* (explicit
> `availableIn`). Whether a change is actually **persisted** is enforced at the save/commit boundary —
> server-side, and at the signup gate — NOT by hiding the assistant's propose/accept tools. Proposing
> and accepting a draft is allowed for anonymous; committing it for real is what's gated.

### 5. Role source
A session/auth selector yields the role; the existing `AuthContext`/session state already distinguishes
uncommitted-anonymous from signed-in. Views pass `role={useWidgetRole()}` down to widgets. The role is
NEVER derived from the conversation flow or onboarding frame — that coupling is exactly what we're undoing.

## Why this shape (vs alternatives)
- **vs keeping `mode`**: `mode` can't express >2 roles and misnames authorization as a chat phase;
  collides with the conversation-flow change that removes the *flow* mode.
- **vs capability set**: deferred — see the box in §2 (YAGNI + central policy).
- **vs deriving role in each widget**: rejected — the policy is centralized; widgets receive the role,
  ask `isWidgetReadOnly`, and stay dumb.

## Risks / watch-items
- **Server enforcement**: the client role gates *affordances* only. Mutate endpoints MUST enforce
  permission server-side independently — the UI role is not a security boundary. Flagged out-of-scope
  but called out so it is not forgotten.
- **Big mechanical sweep**: every widget + README + test changes. Per-widget edits are independent →
  WORKFLOW-OK fan-out (one agent per widget) once we build, with the shared schema/policy + contract
  test landed FIRST (SEQUENTIAL) so the fan-out has a green target.
- **Transitional drift**: enforce the "no `mode` literal remains" guard so a partial migration can't
  ship green.
