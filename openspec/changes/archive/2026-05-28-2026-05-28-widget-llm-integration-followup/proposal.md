# widget-llm-integration follow-up: fenced-JSON retirement + 3 widget upgrades

## Why

The widget-llm-integration epic
(`archive/2026-05-28-2026-05-27-widget-llm-integration/`) shipped on
2026-05-28 with 8 explicitly-deferred follow-up items. They were
NOT incomplete scope inside that epic — each was a deliberate
deferral with documented reasoning. This change captures them so
they don't get lost.

Two clusters:

1. **Fenced-JSON retirement** — the original epic kept the
   pre-Phase-5 fenced-JSON path (`proposedSchemaField` +
   `suggestedIntent` emitted via a ```json block) running as a
   back-compat bridge per design.md §B. Phase 5 wired native
   function-calling alongside it. Phase 8 added the category-
   aware routing that mutate-tool function-calls need. The bridge
   is now redundant — but retiring it requires changing the LLM
   prompt + every consumer of `reply.proposedSchemaField` /
   `reply.suggestedIntent`. That's the highest-regression-risk
   change in the chat pipeline, so it was deferred.

2. **Mutate-tool widget upgrades** — three widgets named in the
   original epic's Phase 7 triage (`ProposeSchemaFieldCard`,
   `GateChatRail`, `BookingStatusCard`) currently ship `no-llm.md`
   opt-outs because their actions are user-confirmed and the
   original epic didn't have time to design + land the new
   `CanvasIntent` variants each upgrade needs. Phase 8's category-
   aware routing made the ROUTING ready (mutate tools → chips, not
   auto-dispatch); the widget-level work is still pending.

Filing both clusters as one change so the tracking surface stays
small. They can be split into 2-3 sub-changes if they ship at
different cadences.

**Recommended posture**: defer until a forcing function appears.
The bridge works; the no-llm.md opt-outs are explicit. Pick this
up when (a) a parser stability issue surfaces, (b) a new agentic
flow needs the unified path, or (c) a user-flow design lands for
one of the mutate widgets.

## What changes

### Cluster A — Fenced-JSON retirement

- MOVE `proposedSchemaField` generation off
  `parseGroundedAnswer`'s fenced-JSON branch onto a
  `propose_schema_field(name, type, description, categoryId)`
  mutate tool. The LLM emits it via native function-calling;
  middleware validates against the Zod schema; the chip / card
  renders from `reply.suggestedActions[]` (key
  `tool:propose_schema_field`).
- MOVE `suggestedIntent` chip generation onto a
  `suggest_intent(intent, reason, confidence)` mutate tool, OR
  surface every existing mutate tool_call as the chip itself.
  Decision: emit `suggest_intent` as a discrete tool so the LLM
  can reason about intent suggestions independently of the
  underlying tool the user might pick.
- DERIVE `ChatReply.proposedSchemaField` from `intents[]` as a
  back-compat shim (returns the first matching tool call's
  payload) so existing consumers keep working through the
  migration window.
- MIGRATE `ChatColumn` + `ExtractView` to read directly from
  `intents[]` / `suggestedActions[]` instead of the legacy
  fields.
- DELETE `parseGroundedAnswer`'s `proposedSchemaField` +
  `suggestedIntent` branches; deprecate the legacy fields on the
  `ChatReply` type. The fenced-JSON parser keeps its `citations`
  branch (citations are NOT a tool — they're metadata on the
  answer).
- UPDATE the grounded LLM system prompt to advertise the new
  tools + drop the fenced-JSON schema description.

### Cluster B — Mutate-tool widget upgrades

For each upgrade: swap `no-llm.md` → `<Name>.tools.ts`, mirror
on `middleware/src/services/toolCatalog.ts`, add a
`<Name>.tools.test.ts` per the Phase 4 PdfViewer pattern, update
the widget's README "## LLM tools" section.

- **`chat-widgets/ProposeSchemaFieldCard`** —
  `accept_proposal(fieldId)` + `reject_proposal(fieldId)`. Needs
  two new `CanvasIntent` variants (`acceptSchemaField` /
  `rejectSchemaField`) + orchestrator handlers that dispatch to
  the existing `ChatStore.addSchemaField` /
  `dismissFieldProposal` actions.
- **`chat-widgets/GateChatRail`** — `commit_gate(method)` +
  `dismiss_gate()`. Needs two new `CanvasIntent` variants +
  orchestrator integration with the gate lifecycle
  (`OnboardingSessionContext.commitGate` / `dismissGate`).
- **`chat-widgets/BookingStatusCard`** — `book_call()`. Needs a
  `CanvasIntent` variant that sets `?bookCall=1` on the URL
  (which the OnboardingShell already watches to mount
  `BookCallView`).

## Out of scope

- **Streaming tool calls (CF-11)** — still deferred; this change
  stays batch-mode like the parent epic.
- **Multi-turn tool flows** — same as parent epic.
- **Cross-widget tools** — same.
- **New widgets** — this is upgrade work only. No new widget
  shapes; the 3 widgets above already exist and ship.
- **The other 6 widgets' no-llm.md opt-outs** — `ChatColumn`,
  `ThinkingStream`, `SuggestedActionChips`, `BookCallView`,
  `SignUpWidget`, and (in the original epic catalog) PdfViewer's
  ALREADY-shipped tools. These stay as documented in the parent
  epic's catalog.

## Affected

- Middleware: `chatRouter.ts` (fenced-JSON parse paths +
  grounded prompt), `toolCatalog.ts` (5 new tools added),
  `chatRouter.test.ts` (new tool round-trip tests).
- App: `ChatColumn.tsx` + `ExtractView.tsx` (consumer migration),
  `api/chatSessions.ts` (`ChatReply.proposedSchemaField` becomes
  derived), `CanvasOrchestratorContext` (5 new intent variants +
  handlers), 3 widgets' `tools.ts` + tests + READMEs.
- Specs: `chat-routing` (deprecate fenced-JSON requirements),
  `agent-tools` (add 5 new tools to the authoritative catalog),
  `app-architecture` (clarify mutate-tool round-trip flow).

## Sequence

Cluster A and Cluster B are independent — either can ship first.
Recommended order if both ship:

1. **Land Cluster B widget-by-widget** (3 sub-merges). Each
   widget's tools are independent; staging them reduces blast
   radius. Pick `accept_proposal` / `reject_proposal` first —
   it pairs with the most-used agentic flow (the propose-field
   loop).
2. **Land Cluster A as a single sweep** once Cluster B has shipped
   at least one widget. By then we have practice with the routing
   end-to-end and the prompt change is less risky.

Or stop after Cluster B if Cluster A's forcing function never
arrives.
