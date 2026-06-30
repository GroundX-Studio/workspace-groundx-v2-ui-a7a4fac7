# No LLM tools — SuggestedActionChips

## Why

`SuggestedActionChips` is the RENDERER for `reply.suggestedActions[]`
— the LLM already drives this widget by emitting the actions on each
chat reply. The chips are user-driven nav back into the orchestrator;
giving the LLM a tool to "click its own chip" adds no expressivity.

The actions themselves come from the chat router (`chatRouter.ts`)
and surface intent labels like `suggested-intent`, `show-source`, etc.
Phase 1 (2026-05-27) wired the chip click → orchestrator dispatch
path; the widget itself stays free of LLM tools.
