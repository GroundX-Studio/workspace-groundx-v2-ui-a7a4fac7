# Tasks — Widget access by role

> Goal: replace the binary widget `mode: "onboarding" | "steady"` with a `WidgetRole` enum + a single
> central lock policy. Authorization, not a chat phase. **DRAFTED — build deferred** (on record now;
> do not implement until scheduled). WIP cap = 3.
>
> **Execution: MIXED.** Phase 1 (shared schema + policy + contract guard) = SEQUENTIAL/TDD — it is the
> target the rest builds on. Phase 2 (per-widget prop sweep) = WORKFLOW-OK — widgets are independent;
> one agent per widget once Phase 1 is green. Phase 3 (tools/router/views) = SEQUENTIAL.
>
> **Ordering vs unified-conversation-flow:** this change MUST land first or together. It flips the
> widget-contract guard from requiring `mode` to requiring `role`; conversation-flow then removes
> `ChatColumn`'s flow `mode` and gives it `role` (forwarded to children). If conversation-flow ran
> first alone, the guard would go red.

## Phase 1 · Shared role + policy + contract guard (SEQUENTIAL/TDD)
- [ ] **Failing test:** `widgetRoleSchema` parses `"anonymous"`/`"member"` and rejects junk; `widgetRoleCanEdit("member") === true`, `widgetRoleCanEdit("anonymous") === false`; `isWidgetReadOnly` is its negation.
- [ ] Add `WidgetRole` (`widgetRoleSchema` = `z.enum(["anonymous","member"])`) + `widgetRoleCanEdit` / `isWidgetReadOnly` to `@groundx/shared`; export from the package index; rebuild `dist`.
- [ ] **Failing test:** `widgetScopeSchema` parses `ContentScope` shapes AND `{ type: "none" }`, and rejects junk; `WidgetScope = ContentScope | { type: "none" }` type compiles.
- [ ] Add `WidgetScope` (`widgetScopeSchema` = `z.union([contentScopeSchema, z.object({ type: z.literal("none") })])`) to `@groundx/shared`; export; rebuild `dist`. (The `none` variant lives ONLY here, NOT in `contentScopeSchema`.)
- [ ] **Failing test:** `widget-contract.test.ts` requires BOTH a `role` prop AND a `scope` prop; FAILS if any widget still declares `mode: "onboarding" | "steady"` OR declares a raw `documentId`/`bucketId`/`projectId` prop instead of `scope`.
- [ ] Update the drift guard accordingly (role-prop regex + scope-prop regex + the transitional no-`mode`-literal + no-raw-id-prop assertions).

## Phase 2a · Access matrix (AUTHORED & REVIEWED — `docs/agents/widget-access-matrix.md`, locked 2026-05-30)
- [x] Matrix authored + reviewed with product. Three axes: **(0) scope** — every widget declares required `scope: WidgetScope`; ScopedViewerWidgets (PdfViewer/Extract/SmartReport/Integrate) take a real `ContentScope`, all others `{ type: "none" }` (PdfViewer's raw `documentId` prop is removed); **(1) widget availability** by role — gate/sign-up widgets are **anonymous-only**, everything else all-roles; **(2) affordance locks** — **none today**. Tools: all-roles except `edit_template` → `["member"]`. See `docs/agents/widget-access-matrix.md` §1b for the scope column.
- [ ] **Failing test:** a coverage test enumerates every widget dir + every `*.tools.ts` and FAILS if any widget/tool is absent from the matrix (no silent omissions). Keep the matrix in sync when widgets/tools are added.

## Phase 2b · Per-widget sweep (WORKFLOW-OK — one agent per widget, after Phase 1 + 2a green)
> Explicit checklist (all 10 + the reference template). Each migrates to match its matrix row. NOTE: no
> widget locks an affordance by role today, so most of this is (a) removing/re-sourcing `mode` and (b)
> adding `role` to satisfy the contract. Three flavors:
> - **cosmetic `mode` → drop, add `role` for contract:** all-roles, no behavior change.
> - **flow/replay/chrome `mode` → RE-SOURCE (not rename):** drive the behavior from its real input.
> - **gate/sign-up widgets → anonymous-only AVAILABILITY** enforced at the mount site (view + gate-state), `role` only for contract.
- [ ] `chat-widgets/BookingStatusCard` — cosmetic `mode` → drop; all roles.
- [ ] `chat-widgets/ChatColumn` — container; `mode` (flow) removed by unified-conversation-flow; declares `role`, forwards to children. All roles. (Coordinate per the ordering note.)
- [ ] `chat-widgets/GateChatRail` — **anonymous-only availability**; re-source the gate variant from gate-state, not role.
- [ ] `chat-widgets/ProposeSchemaFieldCard` — cosmetic `mode` → drop; all roles.
- [ ] `chat-widgets/SuggestedActionChips` — cosmetic `mode` → drop; all roles.
- [ ] `chat-widgets/ThinkingStream` — RE-SOURCE `persist` (replay logic) from its own concern, not role; all roles. *(GA real-reasoning streaming is a SEPARATE ticket — see deferred.)*
- [ ] `viewer-widgets/BookCallView` — RE-SOURCE the chrome toggle from layout/flow, not role; all roles.
- [ ] `viewer-widgets/GateValueProp` — **anonymous-only availability** (gate context).
- [ ] `viewer-widgets/PdfViewer` (`PdfViewerWidget.tsx`) — cosmetic `mode` → drop; all roles; **REPLACE raw `documentId: string` with `scope: ContentScope`** (single doc → `{ type: "documents", documentIds: [id] }`); update all 5 mount sites across 4 view files (`SteadyShell.tsx` ×1, `InteractView.tsx` ×1, `UnderstandView.tsx` ×2, `ExtractView.tsx` ×1) + the sibling test.
- [ ] `viewer-widgets/SignUpWidget` — **anonymous-only availability**; `commitGate` stays sourced from gate-state.
- [ ] `_template/Template.tsx` (contract reference template) — add `role` + `scope`.
- [ ] Per widget: apply its matrix row; add `role: WidgetRole` AND required `scope: WidgetScope` (real `ContentScope` for the 4 ScopedViewerWidgets, else `{ type: "none" }`); update README "Locked affordances (read-only roles)" + "Scope" (note "none" where applicable); sibling test mounts under `"anonymous"` + `"member"`, asserts the matrix row, and passes the widget's declared `scope`. *(Fan out; each agent runs that widget's test green.)*

## Phase 3 · Tool scoping + router + views + role source (SEQUENTIAL)
- [ ] App-side `WidgetTool.availableIn` (`app/src/tools/types.ts`): `Array<"onboarding"|"steady">` → `WidgetRole[]`. Then review EVERY tool across the `*.tools.ts` files (`BookingStatusCard`, `GateChatRail`, `ProposeSchemaFieldCard`, `PdfViewerWidget`, `_template`) against the access matrix and set each `availableIn` deliberately — not just the one that has a value today. Known: `edit_template` (the `_template` reference scaffold) `["steady"]`→`["member"]`; every shipped production tool has no `availableIn` today and stays unrestricted (= all roles). Any tool whose access is NOT "all roles" must appear in the matrix with a reason.
- [ ] **Middleware (LLM-facing catalog — the change above is a no-op without this):** add the same role axis to `ServerTool.availableIn?: WidgetRole[]` in `middleware/src/services/toolCatalog.ts`, set it on each `SERVER_TOOL_CATALOG` entry per the access matrix. NOTE: there is NO app↔server tool-catalog parity guard today (no cross-package test asserts that `app/src/tools/*.tools.ts` and the middleware `SERVER_TOOL_CATALOG` agree on tool names + roles) — do NOT claim an existing guard. Add a minimal NAME+role parity assertion as part of this change (or, if it can't share both packages cleanly, file it as a separate guard task). The catalog the LLM actually sees is server-side (`toolsForStep` in `toolCatalog.ts`, consumed by `chatRouter.ts`); `category` and `availableSteps` exist there today but no role axis.
- [ ] **Failing test:** chat-router tool-exposure filter (server-side, `chatRouter.ts` → `toolCatalog.ts`) exposes a tool IFF (`availableIn` undefined/empty → all roles) OR role ∈ `availableIn`. `category` does NOT affect visibility — assert a `mutate` tool with no `availableIn` (e.g. `propose_schema_field`) IS exposed to `"anonymous"`, and a `["member"]` tool is NOT.
- [ ] Implement that filter in the chat router's server-side tool-exposure path (extend `toolsForStep`/the catalog selection with the role axis; drop any `category`-based visibility gate). Persistence permission is enforced at save/commit, not here.
- [ ] `useWidgetRole()` selector from auth/session/gate state (uncommitted-anonymous → `"anonymous"`, signed-in → `"member"`); views pass `role` (not `mode`) to widgets. Role NEVER derived from the conversation flow.

## Closeout
- [ ] `validate --all --strict` green; app + middleware suites green; widget-contract + no-hardcoded-styles guards green; `npm run build` clean (tsc catches any missed `mode` site).
- [ ] Update `feedback_no_onboarding_duplicates` memory + `docs/agents/data-model.md` (widget access is a role, not a mode).
- [ ] Archive.

## Out of scope / deferred (tracked, NOT this change)
- [ ] Real future roles (`viewer`/`editor`/`admin`/`owner`) — enum entry + policy line + tests when needed.
- [ ] **Server-side** authorization on mutate endpoints — the client role gates affordances only; the API MUST enforce independently. Track as its own security change.
- [ ] Per-action capability granularity (`widgetRoleCan(role, action)`) if lock-all/edit-all ever proves too coarse.
- [ ] **ThinkingStream GA real-reasoning streaming** (separate ticket) — make `ThinkingStream` a production widget that renders the model's reasoning tokens as they arrive over the chat stream; onboarding feeds it scripted messages (today's behavior) as one data source. Distinct from this change (which only untangles `mode`/`role` + re-sources the `persist` replay logic). Promote to its own OpenSpec change when scheduled.
