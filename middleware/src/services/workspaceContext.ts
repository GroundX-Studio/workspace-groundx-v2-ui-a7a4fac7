/**
 * Workspace-state context (chat-unified-tool-loop D2/D2a).
 *
 * The small "where you are" block — active entity, journey stage + active step,
 * saved-schema count, recent viewer trail — assembled for the grounded chat
 * loop's `structuredContext`. EXTRACTED verbatim from the (now-removed) hybrid
 * handler's inline assembly so it is a shared helper, not a fork: the one chat
 * loop injects it on every user-facing turn.
 *
 * Session deps are OPTIONAL: when the repository / chat-session id are absent
 * (anonymous / no session yet) the helper returns `null` — the loop simply omits
 * the block, never throws.
 */
import type { AppRepository, ChatSessionEntityRecord } from "../types.js";
import { journeyStageForStepKind } from "@groundx/shared";

/** Most-recent viewer events to summarize into the trail line. */
const RECENT_VIEWER_EVENTS = 5;

export interface WorkspaceContextInput {
  repository?: AppRepository;
  chatSessionId?: string;
  /** The signed-in groundxUsername, or null/undefined when anonymous. */
  groundxUsername?: string | null;
  /** Frame-free active ViewerStep kind off the wire request (never a frame word). */
  activeStepKind?: string | null;
}

/**
 * Assemble the workspace-state block, or `null` when there is no session to
 * describe (anonymous / deps absent). Never throws.
 */
export async function buildWorkspaceStateContext(input: WorkspaceContextInput): Promise<string | null> {
  const { repository, chatSessionId } = input;
  if (!repository || !chatSessionId) return null;

  const session = await repository.getChatSession(chatSessionId);
  const entities = session ? await repository.listChatSessionEntities(chatSessionId) : [];
  const active: ChatSessionEntityRecord | undefined = session
    ? entities.find((e) => e.entityKey === session.activeEntityKey)
    : undefined;

  // Signed-in users: saved-schema count so the answer can reference it
  // ("you have 3 saved schemas — want me to apply one?").
  let savedSchemaCount = 0;
  if (input.groundxUsername) {
    const rows = await repository.listTemplates(input.groundxUsername, "extract");
    savedSchemaCount = rows.length;
  }

  // Recent viewer trail — where the user has been.
  const recentEvents = (await repository.listViewerEvents(chatSessionId)).slice(0, RECENT_VIEWER_EVENTS);

  const contextLines: string[] = [];
  if (active) {
    contextLines.push(`Active entity: ${active.entityKey}`);
    // Frame-free position (standardized-viewer-control D13): journey STAGE +
    // active ViewerStep KIND off the wire request, never a frame word.
    const stage = journeyStageForStepKind(input.activeStepKind);
    if (stage) {
      contextLines.push(`Journey stage: ${stage}`);
      contextLines.push(`Active step: ${input.activeStepKind}`);
    } else {
      contextLines.push("No active view yet.");
    }
  } else {
    contextLines.push("No active entity yet.");
  }
  if (input.groundxUsername) {
    contextLines.push(
      `Signed-in user has ${savedSchemaCount} saved schema${savedSchemaCount === 1 ? "" : "s"}.`,
    );
  } else {
    contextLines.push("User is anonymous.");
  }
  if (recentEvents.length > 0) {
    const trail = recentEvents.map((e) => `${e.action}@${e.entityKey ?? "-"}`).join(" → ");
    contextLines.push(`Recent viewer trail: ${trail}`);
  }
  return contextLines.join("\n");
}
