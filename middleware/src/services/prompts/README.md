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

_(The turn-router classifier prompt was removed in chat-unified-tool-loop along
with the light-LLM planner — chat now runs one grounded tool-loop with a fixed
plan, so there is no per-turn classification prompt.)_

## Rules

- Consumers import builders/fragments; they never inline prompt strings.
- A fragment exists only when ≥2 prompts share the text (earn the axis).
- The grounded system prompt is the single chat/report system prompt; the former
  hybrid prompt (`HYBRID_SYSTEM_PROMPT`) and its module were deleted with the
  three-mode router in chat-unified-tool-loop.
- The VOICE fragment is the normative ban-list for the internal vocabulary.
