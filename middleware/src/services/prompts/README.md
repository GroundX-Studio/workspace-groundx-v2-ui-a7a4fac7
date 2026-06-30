# services/prompts — every model-facing prompt lives here

`chat-architecture-hardening` Task 2. A prompt literal in a service file is a
review smell; the `promptLiterals.guard.test.ts` drift guard fails the build
when one appears outside this directory.

## Inventory

| Prompt | Builder | Consumer | Pinning test |
|---|---|---|---|
| Grounded chat/report system prompt | `grounded.ts#buildGroundedSystem` | `ragPipeline.ts#callGroundedLlm` (chat + report + hybrid post-Task-3) | `prompts.test.ts` + the prompt-shape assertions in `chatRouter.test.ts` |
| VOICE rule (fragment) | `fragments.ts#VOICE_RULE` | grounded builder | `prompts.test.ts` (`/never expose your internal materials/`) |
| Citations contract (fragment) | `fragments.ts#CITATIONS_CONTRACT` | grounded builder | `prompts.test.ts` + `chatRouter.test.ts` citations tests |
| Snippet header (fragment) | `fragments.ts#snippetHeader` | `ragPipeline.ts#buildSnippetBlock`, `extractor.ts` | `prompts.test.ts` |
| Field-extractor prompt | `extractor.ts#buildExtractorPrompt` | `fieldExtractor.ts#extractField` | `prompts.test.ts` + `fieldExtractor.test.ts` |
| Leaf conversation summary | `summarizer.ts#buildSummaryPrompt` | `conversationCompressor.ts#summarizeChunk` | `conversationCompressor.test.ts` (via re-export) |
| Meta summary merge | `summarizer.ts#buildMetaSummaryPrompt` | `conversationCompressor.ts#runMetaCompaction` | `conversationCompressor.test.ts` (via re-export) |
| Turn-router classifier | `turnRouter.ts` (lands in Task 4) | `groundedAnswer.ts#planTurn` | `turnRouter.test.ts` (Task 4) |

## Rules

- Consumers import builders/fragments; they never inline prompt strings.
- A fragment exists only when ≥2 prompts share the text (earn the axis).
- `HYBRID_SYSTEM_PROMPT` in `structuredHandler.ts` is the one temporary
  exception (guard-excluded): it is DELETED in Task 3, not moved.
- The VOICE fragment is the normative ban-list; Task 3 folds in the hybrid
  copy's extra terms (union) when that prompt dies.
