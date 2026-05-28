# Widget ↔ LLM integration — every widget LLM-drivable by default

## Why

A fresh-eyes audit (2026-05-27) found the intent + tool surface is
scaffolded but inert:

- `CanvasIntent` union has 9 kinds; **only 1 has a handler**
  (`highlightCitation`, added Phase 3 this session)
- **2 production dispatch sites** total (`CiteChip`, `IngestView`);
  `IngestView`'s `showSample` dispatch silently no-ops because no
  adapter handles it
- `registerAdapter` mechanism: **zero production callers**
- `AgentToolBus` context: **zero production consumers** (documented
  as "active | Dispatches LLM tool calls to widgets" — false today)
- Middleware generates `suggestedActions[]` including the canonical
  `suggested-intent` chip from LLM proposals — **frontend has zero
  consumers**, the chip never renders
- 8 named agent tools (TL-01..TL-08) per `project_dev_contracts.md`
  — **none wired**

Net: there's a sophisticated intent + tool architecture **defined**,
and a single working chain (CiteChip → orchestrator → ViewerStep)
**implemented**. The gap between "framework exists" and "widgets use
it" is wide. Every new widget we add today inherits the inert state.

The user requirement: **every widget MUST be LLM-drivable by
default**. The chat should be able to act on the user's behalf
across the full widget surface — open documents, jump pages,
propose extract fields, switch views, save schemas, pivot scenarios,
trigger reports. That requires a concrete, type-safe, drift-guarded
relationship between widgets and the LLM.

## What changes

Five concerns. Each lands as its own phase but the design lands first
(see `design.md`) to lock the architectural answers before code moves.

### 1. Unify `CanvasIntent` + `AgentToolBus` into one declarative tool surface

- DECIDE the relationship (design.md §A). Recommendation in this
  proposal: **tools produce intents**. The LLM-facing surface is a
  function-calling tool with a Zod schema; the in-app dispatch
  primitive is the resulting `CanvasIntent`. One generates the
  other. `AgentToolBus` is retired in favor of a widget-declarative
  tool registry.

### 2. Declarative widget tool registry

- ADD `<Name>.tools.ts` sibling file to every LLM-drivable widget.
  Exports a typed `tools` const: name + description + Zod input
  schema + handler that produces a `CanvasIntent`.
- ADD a central tool registry (`app/src/tools/registry.ts`) that
  auto-discovers all `<widget>/<name>.tools.ts` files at boot and
  composes them into the LLM-facing catalog.
- ADD widget-contract drift guard extension: every widget MUST ship
  either a `tools.ts` (declares tools) OR a `no-tools.md` marker
  (explicit opt-out). Silent omission fails the build.

### 3. Function-calling at the middleware boundary

- EXTEND the chat handler to send the current session's tool
  catalog to the LLM via native function-calling (OpenAI
  `tools` + `tool_choice`, Anthropic `tools`). Replaces the
  current "LLM emits a fenced JSON block" pattern for
  intent-style proposals.
- ADD a tool-call execution path: middleware receives
  `tool_calls[]`, validates each against the registered Zod
  schemas, dispatches the resulting `CanvasIntent` payload as
  part of the chat reply.
- KEEP the existing fenced-JSON path for `proposedSchemaField` +
  `suggestedIntent` as a transitional bridge (already shipping;
  works); migrate them to function-calling in a follow-up.

### 4. Render `suggestedActions[]` on the frontend

- ADD a `<SuggestedActionChips>` chat-widget that renders the
  middleware's `suggestedActions[]` array below each assistant
  bubble. Currently the array ships in the response and is
  silently dropped.
- WIRE chip click → dispatch the underlying `CanvasIntent`.

### 5. OpenSpec formalization

- ADD a "Widget MUST declare its LLM tool surface" Requirement to
  `openspec/specs/app-architecture/spec.md`.
- ADD a "Tool catalog assembly" Requirement to
  `openspec/specs/agent-tools/spec.md` describing the
  auto-discovery + LLM-prompt-injection flow.
- ADD a "Function-calling tool execution" Requirement to
  `openspec/specs/chat-routing/spec.md` describing the
  middleware-side dispatch + validation + intent-emission flow.

## Out of scope

- **Streaming tool calls** (CF-11) — separate change; this proposal
  is batch-mode tool calls.
- **Multi-turn tool flows** (LLM asks for clarification mid-tool) —
  defer; single-turn is the floor.
- **Cross-widget tools** that touch multiple widgets (e.g., "open
  document + run extraction") — defer; single-widget tools first.
- **Tool retry / error UX** — surface failures; don't auto-retry in
  v1.

## Affected

- Capability specs: `agent-tools` (new tool-catalog Requirement),
  `app-architecture` (widget contract extension), `chat-routing`
  (function-calling Requirement).
- Scaffold:
  - `app/src/components/{chat-widgets,viewer-widgets}/<Name>/<Name>.tools.ts`
    (NEW; one per widget that exposes LLM-drivable behavior)
  - `app/src/tools/registry.ts` (NEW central registry +
    auto-discovery)
  - `app/src/components/chat-widgets/SuggestedActionChips/`
    (NEW chat-widget)
  - `app/src/test/widget-contract.test.ts` (extended assertion)
  - `app/src/contexts/AgentToolBusContext/` (RETIRED or rewritten
    against the new registry)
  - `middleware/src/services/chatRouter.ts` (function-calling tool
    catalog + tool-call execution path)
  - `middleware/src/services/chatHandler.ts` (tool catalog
    assembly per session)
  - `docs/agents/widget-contract.md` (new "LLM tools" section +
    worked example)

## Sequence

1. **Land `design.md` first.** All 15 open architecture questions
   resolved with picked answers + trade-offs. No code moves before
   the design lands.
2. **P0 — Render `suggestedActions[]`** (un-dark the existing
   middleware path). 1 day. Closes a dark loop without committing
   to the full re-architecture.
3. **P1 — Decide AgentToolBus's fate** (retire or rewrite). Either
   way, fix the false "active" claim in widget-contract.md.
4. **P2 — Declarative `<Name>.tools.ts` API + registry.** 2-3
   days. One reference widget (`PdfViewer`) gets a full tool
   declaration to prove the shape.
5. **P3 — Middleware function-calling integration.** 2-3 days.
6. **P4 — Widget-contract drift-guard extension.** 1 day. Now
   widgets MUST declare tools (or opt out explicitly).
7. **P5 — Backfill: every existing widget gets a `tools.ts` or
   explicit `no-tools.md`.** Variable.
8. **P6 — Rule 9 closure pass** on each tool: round-trip test
   (LLM emits tool_call → middleware dispatches → widget renders).
9. **P7 — Migrate `proposedSchemaField` + `suggestedIntent`** off
   the fenced-JSON bridge onto native function-calling.

Total: ~2-3 weeks of focused work. The architecture (P0–P3) lands in
the first week.
