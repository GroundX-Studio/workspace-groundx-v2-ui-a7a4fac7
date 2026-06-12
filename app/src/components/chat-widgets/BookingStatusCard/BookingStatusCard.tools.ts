/**
 * BookingStatusCard — LLM tool declarations.
 *
 * widget-llm-integration follow-up B.3 (2026-05-28). One mutate-
 * category tool:
 *
 *   • `book_call()` — open the Calendly booking surface. The
 *     orchestrator handler sets `?bookCall=1` on the URL; the
 *     OnboardingShell already watches that param to mount
 *     `BookCallView` in the viewer + `BookingStatusCard` in the chat.
 *
 * Mutate-category so the LLM surfaces a confirmable chip; the user
 * clicks to actually open the scheduler in the viewer (avoids surprise
 * context switches).
 */
import { z } from "zod";

import type { WidgetTool } from "@/tools/types";

const bookCall: WidgetTool = {
  name: "book_call",
  description:
    "Open the Calendly booking surface for a 30-minute engineer call. " +
    "Use when the user asks to speak with a team member or wants a " +
    "human-assisted path forward: uncertainty about fit, complex " +
    "documents, evaluation questions a sales engineer can answer. " +
    "The user confirms by " +
    "clicking the chip; the scheduler is not opened automatically.",
  category: "mutate",
  input: z.object({}),
  // §5 reachability — confirming this tool's chip opens the BookingStatusCard
  // (mounted by the OnboardingShell + CanvasOrchestrator when the book-call
  // surface activates).
  rendersWidget: "chat-widgets/BookingStatusCard",
};

export const tools: WidgetTool[] = [bookCall];
