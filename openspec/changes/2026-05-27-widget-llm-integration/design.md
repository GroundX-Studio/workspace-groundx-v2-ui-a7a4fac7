# Design — widget-llm-integration

**Scope (locked 2026-05-27 PM)**: every interactive element in the
app is LLM-drivable. Not "widgets" — every button, input, dropdown,
switch, anywhere. The DOM element is one trigger; the LLM tool call
is another; both invoke the same handler.

**Picks locked 2026-05-27 PM**: the answers in §A through §K below
are the chosen positions for v1. The open-question list at the end
of this file is closed — all five picks confirmed by the user.

§P (added 2026-05-27 PM) covers the element-level granularity
decision.

## A. CanvasIntent vs. AgentTool — what's the relationship?

**Decision:** tools produce intents.

- **`AgentTool`** is the LLM-facing surface: a function-callable
  declaration with `name`, `description`, Zod `inputSchema`. The LLM
  sees tools and invokes them via native function-calling.
- **`CanvasIntent`** is the in-app dispatch primitive: the
  discriminated union the orchestrator routes. Imperative.
- The bridge: each tool's handler is
  `(input: ZodInferredType) => CanvasIntent`. The middleware
  validates the LLM's call, invokes the handler, dispatches the
  intent as part of the chat reply.

**Trade-off:** keeps two abstractions instead of collapsing to one,
but each has a clear job. Collapsing would force every internal
in-app dispatch (e.g., `CiteChip` click) to go through a "tool"
which is overhead — the LLM-facing layer and the in-app layer have
different concerns.

**`AgentToolBus` is retired** in favor of the declarative widget
tool registry below (§D). The context is misleading-as-documented
today; cleaner to remove it than rename + repurpose.

## B. Tool-calling protocol — function calling vs. fenced JSON?

**Decision:** native function-calling.

- OpenAI: `tools` array + `tool_choice: "auto"` (or `"required"` /
  named tool) on the request; response carries `tool_calls[]` with
  validated argument JSON.
- Anthropic: equivalent `tools` array; response `content[]` carries
  `tool_use` blocks.
- Middleware abstraction: existing `LlmClient` already proxies to
  either provider. Extend its request envelope + response parser to
  surface tool calls in a normalized shape.

The existing fenced-JSON paths (`proposedSchemaField`,
`suggestedIntent`) ship today; they stay during migration as a
back-compat bridge but new tools land on function-calling.

**Trade-off:** function-calling is provider-coupled (different shapes
per provider). The wrapper layer already handles that for chat
completions; extending it for tools is incremental. Fenced JSON is
provider-agnostic but more fragile (parse failures, prompt drift,
no schema enforcement at the model layer).

## C. Confirmation model — auto-execute or user-confirmed?

**Decision:** **user-confirmed by default** for state-mutating
tools. Auto-execute reserved for read-only tools (open-doc,
highlight-citation).

Two tool categories:

| Category | Semantics | UI |
|---|---|---|
| `read` | Navigation / focus / highlight — no persisted state change | Auto-execute. The LLM saying "let me show you that" navigates the canvas. |
| `mutate` | Schema change, save, send message, ingest, delete | Renders as a chip / card. User clicks Accept to dispatch. |

Each tool declaration carries `category: "read" | "mutate"`.

**Trade-off:** introduces a category-flag the tool author has to
remember. Without it the alternative is always-confirm (bad UX) or
always-auto-execute (dangerous). The flag is the lightest weight
way to encode the semantic.

## D. Widget responsibility — what does the widget own?

**Decision:** widget owns the tool *declaration*. Adapter registry
is dead; replaced by declarative tools.

Each LLM-drivable widget exports `<Name>.tools.ts`:

```ts
// chat-widgets/PdfViewer/PdfViewerWidget.tools.ts
import { z } from "zod";
import type { WidgetTool } from "@/tools/types";

export const pdfViewerTools: WidgetTool[] = [
  {
    name: "open_document",
    description: "Open a document in the viewer. Use when the user names a document or you cite one.",
    category: "read",
    input: z.object({
      documentId: z.string().describe("GroundX document UUID"),
      page: z.number().int().positive().optional().describe("1-indexed page; defaults to 1"),
    }),
    handler: (input) => ({
      kind: "highlightCitation" as const,
      documentId: input.documentId,
      page: input.page ?? 1,
    }),
    // Optional: which mode(s) expose this tool. Defaults to both.
    availableIn: ["onboarding", "steady"],
  },
];
```

The orchestrator already has the `highlightCitation` handler; this
just declares it as an LLM-callable tool.

The "register an adapter" mechanism is **removed**. Built-in
handlers in the orchestrator's `dispatch()` switch are the only
intent execution path; tools dispatch into that switch.

**Trade-off:** less flexibility — widgets can't add custom dispatch
behavior at runtime; the orchestrator owns the routing. Practical
upside: one place to read every intent's behavior. Future "register
adapter at mount" can be added back if a real use case emerges.

## E. Tool discovery — static catalog or per-session?

**Decision:** per-session scoped catalog, derived from the active
ViewerStep + scenario context.

```
LLM sees only the tools relevant to where the user currently is.
```

- On F1 (ingest-picker): `pick_scenario`, `pivot_to_byo`
- On F2 (doc-viewer): `open_document`, `highlight_citation`, `jump_to_page`
- On F3 (extract-workbench): `propose_field`, `accept_field`, `dismiss_field`, `pin_sample`, `edit_field`
- On F5 (interact-chat): all chat tools above + `open_document`

The catalog is composed from each widget's `tools.ts` by filtering
on the active viewer step kind. Lookup table in
`app/src/tools/registry.ts` maps step-kind → list of widget tool
modules.

**Trade-off:** simpler "expose everything" gives the LLM more
freedom but increases hallucination risk (model tries
non-applicable tools). Scoping is the safer floor.

## F. Tool/intent identity — same name or separate?

**Decision:** separate. Tools are snake_case LLM-facing names
(`open_document`); intents are camelCase TypeScript kinds
(`highlightCitation`).

A single mapping object in the registry resolves tool names →
intent constructors.

**Trade-off:** indirection cost. But snake_case is the convention
LLMs work best with (matches OpenAI/Anthropic example tools);
camelCase is the convention TypeScript discriminated unions
work best with. The mapping is one line per tool.

## G. Zod validation — required?

**Decision:** **yes, required at the middleware boundary.** Every
tool's input is a Zod schema. The middleware validates LLM-provided
arguments before invoking the handler.

The existing `proposedSchemaField` envelope already uses Zod
(provenance-tagged). This generalizes it.

**Trade-off:** Zod adds runtime weight + a dependency on
`zod` server-side (already there). Catches LLM-emitted-bad-JSON at
the validation boundary; no defensive programming inside handlers.

## H. Process to prevent drift on new widgets

**Decision:** **four-layer enforcement**:

1. **Type-level:** Widgets that opt in to LLM drive export a typed
   `tools: WidgetTool[]` const. TS won't compile a tool with a bad
   schema.

2. **Sibling file:** `<Name>.tools.ts` mandatory OR `no-llm.md`
   (explicit opt-out, must justify why) sibling file. Drift guard
   asserts exactly one is present.

3. **Drift guard:** Extend `widget-contract.test.ts` to:
   - Walk every widget dir
   - Assert presence of `tools.ts` OR `no-llm.md`
   - For `tools.ts`: import + assert at least one `WidgetTool`
     export with valid shape
   - For `no-llm.md`: assert the file exists + has a `## Why`
     section

4. **Round-trip closure:** every tool ships with a test that
   exercises the full chain — middleware-side: LLM emits tool_call →
   server validates + dispatches → reply carries intent. Client-side:
   reply intent → orchestrator → widget state change.

**Trade-off:** raises the floor for new widgets significantly.
Cost: every widget author has to either write a tool or justify the
omission. Benefit: no more silent-inert intent kinds.

## I. Where do tools live — co-located or central?

**Decision:** **co-located with the widget** (`<Name>.tools.ts`),
**registered centrally** (`app/src/tools/registry.ts`).

Co-location: the widget + its README + its test + its tools all
ship together. When you add a new widget, you add its tools in the
same PR. No "register your widget in the central file" step that
gets forgotten.

Central registry: discovery + filtering + Zod composition happens
in one place. The catalog the LLM sees is assembled from the
co-located files at app boot.

**Trade-off:** auto-discovery requires a build-time scan or runtime
import. Vite's `import.meta.glob` makes this trivial for the app
side; server side reads a generated manifest committed to git.

## J. Per-mode tool availability

**Decision:** tools declare `availableIn: ("onboarding" | "steady")[]`
on the tool itself. Defaults to both.

Locks parallel to the `mode` prop affordance lock. In onboarding,
`pick_scenario` is available; `save_field` is not (save is locked
in onboarding). Steady is the inverse.

**Trade-off:** every tool author has to think about which mode it
belongs to. Cheap; matches the existing widget-mode mental model.

## K. Cross-widget tools

**Decision:** **deferred.** v1 ships single-widget tools only.

Tools that span widgets (e.g., "open doc + run extraction") are
expressed as **multi-turn tool calls** by the LLM — the model picks
`open_document`, sees the result, then picks `run_extraction`. We
don't need a multi-widget tool type today.

When cross-widget composition becomes a real need, a `composite`
tool type or an orchestrator-level tool category can be added.

**Trade-off:** the LLM has to make two decisions instead of one.
Practical impact is small for the workflows the wireframes show.

## L. Streaming vs. batch

**Decision:** **batch in v1.** Streaming is CF-11 (deferred).

The middleware waits for the full LLM response, parses
`tool_calls[]`, validates, dispatches. Frontend gets one envelope.

**Trade-off:** TTFB feels slower than streaming. Live chat already
isn't streaming today; this matches the existing UX baseline. CF-11
addresses it across the board.

## M. Tool retry + failure

**Decision:** **surface, don't auto-retry.**

If validation fails (LLM emitted bad args) OR the handler throws
OR the widget can't apply the intent (e.g., document not found):

- Middleware-side: log the failure to `intent_log` with status
  `error`; return a `tool_failures[]` array on the chat reply
- Frontend-side: render the failure as a chip with the failure
  reason so the user can ask the LLM to retry

No automatic retry in v1.

**Trade-off:** user has to nudge the LLM. Auto-retry without bounds
is dangerous (loops). Auto-retry with bounds = more state machine
complexity than v1 deserves.

## N. Persistence

**Decision:** every tool call → row in `intent_log` (table
exists), regardless of success / failure.

The `intent-dispatched` viewer event also fires (existing path).

Replay debugging: `SELECT * FROM intent_log WHERE chat_session_id = ?`
returns the full agent action history.

**Trade-off:** more rows. The table's already designed for this
shape (UI-10b).

## O. Tool catalog → LLM prompt

**Decision:** the catalog is sent on every chat turn (via the
provider's native `tools` field), filtered to the current
ViewerStep's allowed tool set.

Not in the system prompt (would balloon every turn's token use).
Tools are a separate field the provider treats as schema, not
narrative.

**Trade-off:** doesn't expose tool semantics to the prompt itself;
relies on the model's tool-following discipline. Both OpenAI and
Anthropic are well-trained on this; should not be a problem.

## §P. Element-level granularity — every interactive element must be LLM-drivable

**Decision:** every interactive element exposes a tool. Enforcement
is at the TypeScript level via a required prop on every interactive
primitive.

The architectural principle: **every user-facing action is a tool**.
The DOM element (button click, input change, dropdown selection) is
one way to trigger the action; the LLM tool call is another. Both
go through the same handler. The widget that *owns* the action
declares the tool; the element is one of potentially many entry
points.

### Enforcement: required `tool` or `noTool` prop on interactive primitives

The interactive primitives in `components/primitives/` SHALL take
a discriminated required prop:

```ts
type ButtonProps =
  | { tool: string; onClick?: () => void; /* ... */ }
  | { noTool: string; onClick?: () => void; /* ... */ };
```

There is no third overload. Bare `<Button>` fails compilation. The
type system audits every screen, eliminating the "I forgot to add
a tool" failure mode.

`noTool` carries a justification string that lands as a
`data-no-tool` attribute for runtime audit (e.g., "external redirect"
or "decorative — has no action"). The drift guard greps for
`data-no-tool` values that are empty or just `"x"` and flags them.

### Coverage table

| Primitive | Status |
|---|---|
| `Button` | tool/noTool required |
| `IconButton` | tool/noTool required |
| `TextField` | tool/noTool required (the tool sets the value) |
| `DropdownMenu` | tool/noTool required (the tool selects an option) |
| `Switch` (when added) | tool/noTool required |
| `Slider` (when added) | tool/noTool required |
| `Chip` (when interactive) | tool/noTool required |
| `Card` (purely visual) | no requirement (not interactive) |
| `Heading`, `BodyText`, `Label` (typography) | no requirement |

### Where the tool lives

Tools are declared at the *widget* level, not the *primitive* level.
A widget that contains a Send button + an input field + a Cancel
button declares all three tools in its `<Widget>.tools.ts`. The
primitives reference the tool name via the `tool=` prop.

This keeps the tool surface coherent: one widget = one tools file =
one mental model. A reader of `ChatColumn.tools.ts` sees every
LLM-callable action in the chat column.

### Registry-time integrity check

At app boot, the registry SHALL verify that every `tool="..."` value
referenced in any rendered primitive maps to a declared tool in
some widget's `tools.ts`. A missing mapping fails the build.

This catches the case where a developer types `tool="send_msg"`
(misspelled) — the build refuses until the typo is fixed.

**Trade-off:** TypeScript can't enforce string-literal validity
against a runtime-discovered set, so this check is build-time, not
compile-time. A small `vite` plugin (or a pre-build script) walks
the rendered tool names + the registry, fails if they diverge.

### Cost

Migration: every existing `<Button>` / `<TextField>` / `<IconButton>`
across the app (~50-100 instances) needs a `tool=` or `noTool=` prop
added. One sweep, one PR per file, type errors guide the work.

Once migrated, the cost per future widget is minimal: declare the
tool in `tools.ts`, reference the name from the primitive.

## Open questions

All previously-open picks are **closed** (user confirmed 2026-05-27 PM):

1. ~~(§A) Retire `AgentToolBus` entirely?~~ **YES — retire.**
2. ~~(§C) Auto-execute reads vs. user-confirm reads?~~ **Split: reads auto, mutates confirm.**
3. ~~(§D) Drop the `registerAdapter` mechanism?~~ **YES — drop.**
4. ~~(§E) Per-step catalog scoping?~~ **YES — scope per step.**
5. ~~(§K) Defer cross-widget tools to v2?~~ **YES — single-widget tools in v1.**

§P (element-level granularity) is the locked scope.
