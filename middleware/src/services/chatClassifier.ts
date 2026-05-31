/**
 * Deterministic chat-mode classifier for the three-mode router.
 *
 * Extracted from `chatRouter.ts` (§1 of 2026-05-31-core-data-followups —
 * behavior-preserving split). Picks "rag" / "structured" / "hybrid" from the
 * bundled 3-axis context + simple string heuristics. NOT an LLM call.
 */

import type { ChatMode, ChatRouterRequest } from "./chatRouterTypes.js";

/**
 * Classify the request into one of the three modes. Deterministic
 * by intent + viewer-event signal + simple string heuristics — NOT
 * an LLM call.
 */
export function classifyChatMode(request: ChatRouterRequest): ChatMode {
  // 1. Explicit intent hint from the UI wins.
  if (request.intent) {
    if (request.intent.startsWith("extract.") || request.intent === "chat.sources" || request.intent === "understand") {
      return "rag";
    }
    if (request.intent === "smart.report" || request.intent === "explain.sample") {
      return "hybrid";
    }
    if (request.intent.startsWith("app.") || request.intent.startsWith("workspace.")) {
      return "structured";
    }
  }

  // 2. Pattern match the message. Structured questions are about the
  //    app/workspace, not document content.
  const msg = request.newUserMessage.toLowerCase();
  const structuredHints = [
    "saved schema",
    "saved schemas",
    "pages remaining",
    "page budget",
    "my workspace",
    "my projects",
    "api key",
    "my account",
    "my subscription",
  ];
  if (structuredHints.some((h) => msg.includes(h))) return "structured";

  // 3. Open-ended exploratory questions read as hybrid.
  const hybridHints = ["explain this sample", "what can i do", "what is this", "tour"];
  if (hybridHints.some((h) => msg.includes(h))) return "hybrid";

  // 4. Default — assume document-grounded.
  return "rag";
}
