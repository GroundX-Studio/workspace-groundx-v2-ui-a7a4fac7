/**
 * 2026-05-30-unified-conversation-flow Phase 2 — the optional, pluggable
 * `ChatExperience`.
 *
 * A `ChatExperience` is how the surface that mounts the chat directs the
 * *initial* conversational experience (onboarding today; Workspace/Project
 * follow-on). It is selected by COMPOSITION: the mount site constructs one
 * (or passes nothing) and hands it to `<ConversationFlow>`. There is NO flow
 * `mode` and NO entry-context object.
 *
 * EVERY field is optional. `Intro`/`Choreography` are COMPONENTS, not bare
 * hooks: an experience may be absent at runtime, and you cannot conditionally
 * *call* a hook (Rules of Hooks) — but you CAN conditionally *render* a
 * component. `Choreography` returns `null` and uses whatever hooks it needs
 * internally (`useOnboardingSession`, navigation) to react to engine events.
 *
 * Identity lives on the catalog ENTRY (`ChatExperienceEntry.id`), NOT here —
 * there is no second id on the experience itself. One id, one owner.
 */
import type { FC } from "react";

import type { ConversationApi, ConversationScopeHint, LiveTurn } from "./useConversation";

/** The props the experience's `Intro`/`Choreography` components receive. */
export interface ChatExperienceComponentProps {
  conversation: ConversationApi;
}

export interface ChatExperience {
  /** Scripted intro / pills / quick-actions rendered ABOVE the thread. */
  Intro?: FC<ChatExperienceComponentProps>;
  /** One-shot turns injected on mount (via the engine's `seedTurns`). */
  seedTurns?: () => LiveTurn[];
  /** Render-null director: side-effects reacting to engine lifecycle. */
  Choreography?: FC<ChatExperienceComponentProps>;
  /** Convenience lifecycle hook — fires once on the first user send. */
  onFirstUserSend?: () => void;
  /**
   * Scope hint the experience threads into the grounded LLM prompt so the
   * model knows what doc the user is looking at (onboarding supplies the
   * scenario file/title). `<ConversationFlow>` forwards this verbatim into the
   * engine's `useConversation` options — without it the model sees
   * `(no snippets found)` for off-topic queries and refuses, with no fallback
   * to "I can talk about the April utility bill — try asking about charges or
   * due date." (chatSessions.ts §scopeHint). A bare chat omits it.
   */
  scopeHint?: ConversationScopeHint;
  /**
   * Title fallback used when the server ensure-creates the chat_sessions row.
   * The active session's own title wins over this — it is only the label used
   * when the session has none. Forwarded into `useConversation`.
   */
  title?: string;
}
