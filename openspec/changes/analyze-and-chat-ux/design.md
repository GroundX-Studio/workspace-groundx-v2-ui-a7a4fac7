# Design — analyze-and-chat-ux

Four workstreams in one change: **A. composable Extract render**, **B. card → hover
highlights**, **C. chat thinking stream**, **D. two CSS polishes**. A/B are the Extract
sections below; C and D follow.

## A. The model: render the OUTPUT tree, label it from the schema by name

**Output-first.** STRUCTURE comes from the extraction OUTPUT (`getDocumentExtract`); LABELS/TYPES/
instructions come from the workflow schema fields, looked up **by field name**. The server already
reshaped the raw extract via business logic (`match_attrs`/hoist/project) — the app does NOT
reassemble and does NOT derive structure from the schema.

The OUTPUT tree (verified live 2026-07-06) is: top-level scalar fields (statement scalars hoisted
to root — no `statement` wrapper), plus top-level **array groups** (`meters`, and a synthesized
`account_charges`); within a meter, its matched charges are a nested `meter_charges` array (a
re-keyed projection — only some charge fields, e.g. `line_amount`/`line_currency`/`line_label`).
There is NO top-level `charges`; NO `__conflicts`/`*_decisions`; NO `{value,confidence}` dicts.

Today the code collapses this to three named panels (`CATEGORY_ORDER`) and the first array element
(`[0]`). The fix: make the **parse + render recursive over the received output tree**, and join
each output field to a **flat schema field-def dictionary** for its label/type. The schema type
stays FLAT — structure is not derived from it.

### Schema (flat — labels only)

```
SchemaFieldDef  = { id, name, type, description, instructions?, format?, identifiers? }   // unchanged
ExtractionSchemaDef = { id, name, groups: SchemaGroupDef[] }                               // groups = flat label dictionary
SchemaGroupDef  = { id, name, fields: SchemaFieldDef[] }                                   // group→fields, NOT recursive
```

**Source = the workflow schema, read BY FIELD NAME.** The current code already reads
`workflow.extract.<group>.fields.<id>.prompt` (`extractLiveData.ts:58` `fieldFromPrompt`) — keep
that. The demo workflow SCHEMA is **flat**: three sibling groups `statement`/`meters`/`charges`,
where `charges.fields` includes `meter_id` (an FK). `workflowToSchema` produces a flat field-def
dictionary keyed by (group, fieldId) — or just fieldId — used purely for labels/types/instructions.
The render joins output→schema by name: a charge field like `line_amount` appearing under
`meter_charges` OR `account_charges` maps to the `charges` group's field def **by name**.

**Why NOT a recursive schema type.** Because STRUCTURE now comes from the output, the schema does
not need to become recursive — the workflow schema is flat (group→fields for labels). The nesting
(`meters[].meter_charges`) is business-logic in the server-reshaped output, not schema; it is not
expressible as a schema path anyway (a `/group/field` shape caps at one level). So the recursion
lives in the OUTPUT walk + render, and the schema stays a flat field-def dictionary. This keeps the
type change **light** (no recursive `SchemaGroupDef`, no `type` enum removal forced by recursion).

> Blast radius: drop `CATEGORY_ORDER` (the {statement,meters,charges} allow-list) and
> `extractToValues` (the `[0]` flatten). `ExtractionSchemaDef` stays a shared zod type
> (`shared/src/index.ts`) mirrored in middleware (`middleware/src/scenarios/types.ts`) with a
> compile-time drift guard (`typesDriftGuard.ts`) and used in `app/src/test/scenarioFixtures.ts`.
> Kept flat, so this is a **light multi-package touch**, not a recursive-schema refactor. NOT a
> live-data migration (nothing seeds this per-bucket). App consumers: `api/extractLiveData.ts`,
> `Extract/SchemaView.tsx`, `hooks/liveExtractData.ts`, `types/scenarios.ts`.

### Parse (walk the output; all instances, nested)

```
FieldInstanceValue = { value: scalar; confidence?: number }          // {value,confidence} unwrapped DEFENSIVELY (dormant — no such dicts in real output)
GroupInstance      = { fields: Record<fieldName, FieldInstanceValue>; groups: Record<groupKey, GroupInstance[]> }
extractToInstances(extract, schema): { root: GroupInstance }         // walks the OUTPUT tree; schema supplies labels by name
```

- **The walk is over the OUTPUT**, not the schema. Top-level scalar keys → the root object's
  fields; a top-level key whose value is an array (`meters`, `account_charges`) → an array group,
  one instance per element; within a meter, a key whose value is an array (`meter_charges`) → a
  nested array group, recursing.
- An array group yields **one instance per element** (all 8 meters), each recursing into its
  nested arrays (that meter's `meter_charges`).
- Each output field is joined to its schema field def **by name** for label/type; an output key
  with no matching schema field is **not rendered** (that is the hiding rule).
- `confidence` unwrap is **DEFENSIVE/dormant** — the real output has no `{value,confidence}`
  dicts, so no band shows; keep the unwrap in case a future workflow emits them.

### Render — recursive tabs + tree (UX-validated 2026-07-05)

The pattern is **tabs + tree, repeated at every object level** (see the mockup):

- **STRUCTURE = the extraction OUTPUT tree (`getDocumentExtract`), walked as-received.** Groups,
  instances, and nesting come from the output object (verified live 2026-07-06). The UI does NOT
  re-nest or group-by `meter_number` — the server already produced the nested shape and the render
  walks it: statement scalars at root · `meters[]` each with nested `meter_charges` · top-level
  `account_charges` (charges matching no meter). So the top-level tabs are `Statement · Meters ·
  (Account charges)` and a meter's `Charges` tab is its nested `meter_charges`.
- **LABELS/TYPES = the workflow schema fields, joined BY FIELD NAME.** Labels come from the
  schema's `prompt`-derived field defs; count = array length (0 for `[]`).
- **Hiding = don't render output keys with no matching schema field.** `account_charges`/`meters`/
  `meter_charges` are STRUCTURE containers (render them); their leaf fields ARE schema fields
  (render them). No `leafFields` allow-list, no hardcoded `__conflicts` pattern — `__conflicts`/
  `*_decisions` are confirmed ABSENT in the real output, so no explicit filter is needed; anything
  without a schema-field match simply doesn't render.
- **Confidence band is DORMANT here (defensive).** The shipped band shows Low/Med/High only when a
  field value is a `{value, confidence}` dict; this output has none, so it never shows. Fine — keep
  it defensively. Do NOT repoint it at `__conflicts`.
- **Scalar tab → tree** of field rows (mono field name · value · confidence band [dormant] ·
  citation dot).
- **Array-group tab → instance pills** — one pill per instance, labeled by the group's own
  **identifying field(s) chosen from its schema/data at runtime** (e.g. a meter identifier +
  service type → "70182657 · electric"), `#n` fallback. NOT a hardcoded field name — pick the
  first present identifier-type field, else index.
- **Selecting an instance recurses: it is itself an object level → its own tab bar** — the
  instance's scalar fields as one tab plus a tab per nested array. So a selected meter shows its
  field tree AND a **"Charges" tab** (its `meter_charges`) exactly like the base has Statement/
  Meters — not an indented sub-section. Depth unbounded; each nested object level is the same
  tab-bar component.

One recursive `FieldGroup`/tab-bar component expresses this: given an object level (its arrays +
the active instance from the OUTPUT tree), it renders a tab bar and, per active tab, either a field
tree or an instance-pill selector whose selected instance recurses.

### Persisted-Template mismatch (flag, don't assume)

The committed Extract Template uses a flat `{categories}` shape (`shared/src/index.ts:426`
`extractBodySchema`). The render reads **LIVE extraction output + LIVE workflow schema, NOT the
persisted Template.** If any pin-to-Template path bridges into this render, the shape gap MUST be
flagged (or scoped out) — do not silently assume the persisted Template and the live output are the
same shape. In this change the render source is live data only.

### Editor — a view on the workflow's extraction schema

**The editor is carved into its own change — `extract-workflow-authoring`.** "Edit the schema"
means authoring/translating a desired schema into a valid GroundX workflow and PUTting it back — a
large capability out of scope here. This change ships the **read-only recursive render (Values
view)** only; the `Values | Edit schema` toggle, authoring, and save tiers live in
`extract-workflow-authoring`. This change does **not** depend on that one.

## B. Interaction: hover/click highlight replaces the inline provenance block

- The **inline provenance block** is removed — the `<Box data-testid="field-provenance-panel">`
  (SOURCE + WHY MATCHED) at `Extract.tsx:1033`, plus its breadcrumb. This is a surgery inside a
  1772-line file, **not** removing a `FieldProvenancePanel` component (there is none). It also
  retires the `field-provenance-panel` test contract in `docs/agents/testing.md`.
- A field-instance row exposes its citation (page + bbox). On **hover/focus** the row sets the PdfViewer highlight target; on **mouse-leave/blur** it clears; a **click pins** it (so keyboard users and touch get a stable highlight). This reuses the existing `targetPage`/`highlightBbox` prop path (the shipped padded overlay).
- Multiple citations (multi-region) for one instance all light, as today.
- The confidence band + reason stay inline on the row (no separate card).

## Per-instance geometry + confidence

`liveValuesToFieldValues` becomes instance-aware: keyed by an **instance path** (`groupId[/idx][/nestedGroupId/idx].fieldId`), so `line_amount` on charge 3 of meter 2 is distinct from charge 0 of meter 0. The geometry fetch (`fetchFieldGeometry`) runs over the flattened instance list (value + label per instance). Confidence likewise attaches per instance. This is the composable analogue of today's fieldId-keyed map.

> Cost note: the geometry call now covers every instance's value (not just row 0). That's a client→middleware call already in place; it scales with instance count. If a document is huge this is a follow-up cap (out of scope), logged not silently truncated.

## Anti-hardcode guard

A test feeds `extractToInstances` + the render an **arbitrary** extraction OUTPUT (a top-level
array group whose name is NOT in {statement,meters,charges}, with a nested array two levels deep)
and a schema supplying labels by name, and asserts every group + instance + nested instance
renders. This is the regression guard that would have caught the original miss.

## What stays

- Confidence band display (`confidenceBucket`, shown only for `{value, confidence}` dicts, hidden
  when absent, % on hover) — unchanged. **Dormant here** — the real output has no confidence dicts;
  the unwrap is kept defensively, per instance.
- Live sourcing (extract OUTPUT for structure + workflow schema for labels-by-name, not the
  manifest and not the persisted Template) — the label read stays on the existing
  `workflow.extract.<group>.fields.<id>.prompt` (`fieldFromPrompt`); the structure moves off
  `CATEGORY_ORDER`/`[0]` onto the output-tree walk.
- The padded PDF overlay geometry (shipped) — reused for the hover highlight.

## C. Chat thinking stream

Two content sources feed one ordered stream, rendered where the bare "…" is today.

**Source 1 — app narration (ships now).** The turn already runs through
`ragPipeline` / `turnRunner` over the `chatCompletionStream` SSE seam. Add an ordered
`thinking` event kind to that stream: the server emits human-readable status lines at
the real phase boundaries it already passes through — planning, GroundX search,
snippet assembly, the grounded completion, citation verification. These are
**app-authored**, deterministic, and need no provider support. Shared event type:

```
ThinkingEvent = { kind: "status", text: string }              // app narration
              | { kind: "reasoning", text: string }           // model reasoning (source 2)
// streamed as SSE events ahead of the final message; FE accumulates then clears on final render.
```

**Source 2 — model reasoning (provider-gated adapter).** Researched 2026-07-05:

| Provider / API | Reasoning surface |
|---|---|
| OpenAI `/chat/completions` (our chat path today) | **none** — reasoning is not returned |
| OpenAI **Responses API** (`/v1/responses`) | `reasoning: {summary: "auto"}` → reasoning-summary parts (streamable) |
| Anthropic Messages | `thinking: {type:"adaptive", display:"summarized"}` → SSE `content_block_delta` with `delta.type==="thinking_delta"` (token-by-token summary; raw CoT never exposed) |

So real model reasoning requires moving the chat completion **off** `/chat/completions`.
**This change wires that path (in scope, per the 2026-07-05 decision):** an OpenAI
**Responses API** (`/v1/responses`, `reasoning: {summary: "auto"}`) call behind the existing
`LlmClient` seam, mapping its reasoning-summary deltas → `{kind:"reasoning"}` events; the
Anthropic branch (summarized `thinking` → `thinking_delta`) uses the same adapter interface.
The adapter still **degrades gracefully** — a provider/model that exposes no reasoning yields
zero reasoning events and the stream is source-1-only — but the Responses-API path is built
and enabled for our OpenAI chat models, not deferred. Source 1 (narration) still ships first
so the UX fix doesn't block on the reasoning wiring.

**FE render — reuse the existing `ThinkingStream` widget, don't build a new one.** The
`chat-widgets/ThinkingStream` widget already exists but is fed a **scripted** `notes:
string[]` (timed reveal) and is used only for the onboarding *intro* parse theater —
real Q&A turns don't use it, which is why they show the bare "…". The bare-dot indicator
lives in **`app/src/conversation/chatPrimitives.tsx`** (`showThinking` → a `LoadingDots`
inside a `BotBubble` at the `chat-thinking` testid), **NOT** `ChatColumn` (ChatColumn has no
such code). Add a **live-fed source** to `ThinkingStream` (consume streamed `ThinkingEvent`s
instead of a static array) and render it in `chatPrimitives.tsx` in place of that
`LoadingDots` `BotBubble` for in-flight real turns; on the final `message` event it collapses
to the rendered answer with citations. Reusing the widget keeps its note-bubble presentation +
widget-contract paperwork (README, `role`+`scope`) intact — an added axis (scripted vs live
source), not a fork.

## D. Polishes

- **Scrollbar flush** — the Understand doc-pane scroll container reserves a right gutter
  it doesn't need; drop the extra right padding / `scrollbar-gutter` so the bar sits at
  the pane edge. (Note: `ui-views` already has a *chat* scrollbar-gutter requirement —
  this is the **doc pane**, a different container; don't regress the chat one.)
- **Chat header cutoff** — the header's top fade/mask overlaps the scroll region so
  scrolled content can't reach the top. Pad the header's text, not the scroll container;
  the scrolled content must reach y=0.
- **(Shipped)** highlight-bbox padding via `overlayPxRect(padPx)` — noted for completeness.

## Risks

- **Coupled multi-package type change** (A/B) across shared zod types + middleware mirror + drift
  guard + fixtures + the app consumers (`extractLiveData.ts`, `SchemaView.tsx`,
  `liveExtractData.ts`, `scenarios.ts`, onboarding `experience.tsx`) — one TDD pass, consumer by
  consumer, suite green at each step. Not a live-data migration (nothing seeds it per-bucket).
- **Instance labeling** when no identifying field exists — fall back to `#n`; never hide instances.
- **Geometry volume** for many instances — accepted for now; cap deferred.
- **Reasoning capture is provider-dependent** — source 1 ships now; source 2 lights up only when the Responses-API/thinking adapter is wired for the configured provider. Ship them decoupled so the UX fix doesn't block on the provider work.
- **Don't leak raw chain-of-thought** — only provider-sanctioned summaries (`reasoning.summary` / summarized `thinking`) reach the stream; never prompt the model to emit raw reasoning as text.
