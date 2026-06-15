/**
 * chat-response-streaming — per-turn streaming sink, carried via AsyncLocalStorage.
 *
 * Live `token`/`activity` frames originate deep inside `callGroundedLlm` (the LLM
 * dispatch + the server-tool loop), but the SSE pump lives at the HTTP route — five
 * layers up (route → handleChatMessage → routeChat → runRagPipeline →
 * groundedAnswerOverScope → callGroundedLlm). Threading a streaming callback through
 * every planning/routing layer would couple them to a concern they otherwise know
 * nothing about (and churn their large test surface). Instead the TurnRunner sets an
 * ambient sink for the duration of one turn's generation; `callGroundedLlm` reads it.
 * No context set (every non-streaming caller, every existing test) → `getStore()` is
 * undefined → behavior is byte-identical. An explicit `stream` argument to
 * `callGroundedLlm` still wins (a direct unit-test seam); the store is the fallback.
 */
import { AsyncLocalStorage } from "node:async_hooks";

import type { ToolActivity } from "./chatRouterTypes.js";

export interface TurnStreamSink {
  /** Called per upstream content delta → a `token` frame. */
  onToken?: (delta: string) => void;
  /** Called when a server-executed tool runs → an `activity` frame. */
  onActivity?: (activity: ToolActivity) => void;
}

export const turnStreamContext = new AsyncLocalStorage<TurnStreamSink>();
