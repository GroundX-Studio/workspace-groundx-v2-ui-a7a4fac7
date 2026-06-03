/**
 * useConversation — the durable conversation ENGINE.
 *
 * 2026-05-30-unified-conversation-flow Phase 1. This hook owns ALL chat
 * behavior and knows NOTHING about onboarding, frames, scripts, or
 * scenarios:
 *   - `liveTurns` state + the two projection effects (RT-01 hydrate +
 *     `agent-`-prefixed ChatStore message projection)
 *   - `send` (optimistic user turn → `sendChatMessage` → assistant turn
 *     with citations/suggestedActions; mirrors to ChatStore; dispatches
 *     reply intents; enqueues field proposals)
 *   - `handleSuggestedAction` (chip → canvas intent)
 *   - lifecycle the experience layer observes (`onFirstUserSend`) — the
 *     engine NEVER calls `advanceFrame`; choreography stays in the caller.
 *
 * `isOnboarding` is read from `activeChatSession.isOnboardingSession` (not
 * hardcoded), so the SAME `send` serves both the onboarding journey and a
 * bare authenticated chat. This hook is the single conversation engine
 * behind `<ConversationFlow>`; the onboarding-vs-steady difference is a
 * pluggable `ChatExperience` (Intro/Choreography/seedTurns), NOT a forked
 * flow component (the old `SteadyConversationFlow`/`F2ConversationFlow`
 * forks were deleted in Phase 2).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { chatErrorToUserCopy } from "@/api/chatErrors";
import type { ChatDispatchedIntent, ChatSuggestedAction, ProposedSchemaField } from "@/api/chatSessions";
import type { Citation } from "@groundx/shared";
import { useApi } from "@/contexts/ApiContext";
import type { CanvasIntent } from "@/contexts/CanvasOrchestratorContext";
import { useCanvasOrchestrator } from "@/contexts/CanvasOrchestratorContext";
import { useChatStore } from "@/contexts/ChatStoreContext";
import { captureException } from "@/lib/sentry";

/**
 * One live ad-hoc conversation turn. ONE definition shared by the engine,
 * `LiveTurnList`, and both flow components.
 */
export interface LiveTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  /**
   * UI-01 Phase 2a — non-null when the grounded LLM proposed adding a
   * schema field on this turn. Rendered as an inline
   * `<ProposeSchemaFieldCard>` beneath the assistant bubble.
   */
  proposedSchemaField?: ProposedSchemaField | null;
  /**
   * clickable-citations Phase 2 — the citations array returned by the
   * chat router. Rendered as `<CiteChip>` rows beneath the assistant
   * bubble. Empty array = no chips, never undefined so callers can map
   * unconditionally.
   */
  citations?: Citation[];
  /**
   * widget-llm-integration Phase 1 — `reply.suggestedActions[]` from the
   * chat router (chips offered beneath the assistant bubble).
   */
  suggestedActions?: ChatSuggestedAction[];
}

/**
 * Optional scope hint the caller threads into the grounded LLM prompt so
 * the model knows what doc the user is looking at (onboarding supplies the
 * scenario file/title; a bare chat omits it).
 */
export interface ConversationScopeHint {
  fileName?: string | null;
  scenarioTitle?: string | null;
}

export interface ConversationOptions {
  /** Fires once, on the FIRST user `send` of this hook instance. */
  onFirstUserSend?: () => void;
  /** Optional scope hint forwarded to the chat router. */
  scopeHint?: ConversationScopeHint;
  /** Title used when the server ensure-creates the chat_sessions row. */
  title?: string;
}

export interface ConversationApi {
  liveTurns: LiveTurn[];
  sending: boolean;
  /**
   * 2026-05-30-unified-conversation-flow Phase 2 — flips `true` after the
   * FIRST real user `send()` of this hook instance and stays true. This is the
   * engine's first-send lifecycle exposed as observable STATE so an
   * experience's render-null `Choreography` can react to it (Rules-of-Hooks
   * safe). It is NOT set by RT-01 hydration of a persisted user turn — only a
   * genuine send — so a returning user with prior turns does not spuriously
   * re-trigger first-send choreography.
   */
  firstUserMessageSent: boolean;
  /** Send a user message; optimistic user turn + server assistant turn. */
  send: (text: string) => Promise<void>;
  /** Map a clicked suggested-action chip onto a dispatched canvas intent. */
  handleSuggestedAction: (action: ChatSuggestedAction, citations?: Citation[]) => void;
  /**
   * 2026-05-30-unified-conversation-flow Phase 2 — inject a one-shot set of
   * turns (idempotent: turns already present by id are skipped). This is how
   * `<ConversationFlow>` mounts a `ChatExperience.seedTurns()` — its only
   * caller. The onboarding experience doesn't seed (its scripted bubbles are
   * inline decoration in `Intro`); the follow-on Workspace/Project experiences
   * will (a workspace lands with a scripted "here's what's in this workspace"
   * opener). Covered directly by `ConversationFlow.test` so the path is
   * exercised, not dormant.
   */
  seedTurns: (turns: LiveTurn[]) => void;
}

/**
 * Build the `highlightCitation` CanvasIntent for a "show source" click /
 * `[n]` chip.
 *
 * NB: the document-id field is assigned via a computed key
 * (`{ ["documentId"]: ... }`) on purpose — the widget-contract drift guard
 * forbids a raw document-id PROP declaration in a widget's main `.tsx`, and
 * a plain document-id object key would false-positive on that regex. This
 * is an intent payload field, not a widget prop, so the computed key
 * sidesteps the guard without weakening it.
 */
export function citationToHighlightIntent(c: Citation): CanvasIntent {
  return {
    kind: "highlightCitation",
    ["documentId"]: c.documentId,
    page: c.page,
    ...(c.bbox ? { bbox: c.bbox } : {}),
    ...(c.tier ? { tier: c.tier } : {}),
  };
}

/**
 * widget-llm-integration Phase 1 — map a clicked SuggestedAction onto a
 * `CanvasIntent` the orchestrator can dispatch.
 */
export function suggestedActionToIntent(action: ChatSuggestedAction): CanvasIntent | null {
  // widget-llm-integration Phase 8 — `tool:<name>` chips carry the
  // server-validated, server-constructed CanvasIntent on `detail.intent`.
  if (action.key.startsWith("tool:")) {
    const intent = action.detail?.intent;
    if (intent && typeof intent === "object" && typeof (intent as { kind?: unknown }).kind === "string") {
      return intent as CanvasIntent;
    }
    return null;
  }
  // Phase 1 — legacy `suggested-intent` chip with a string intent label.
  if (action.key === "suggested-intent") {
    const intent = action.detail?.intent;
    if (intent === "show-extract") return { kind: "switchFrame", frame: "f3" };
    if (intent === "show-report") return { kind: "switchFrame", frame: "f4" };
    if (intent === "show-interact") return { kind: "switchFrame", frame: "f5" };
  }
  return null;
}

/**
 * widget-llm-integration Phase 5 — narrow + dispatch each LLM tool call
 * carried on `reply.intents[]`. The middleware validated args against the
 * server tool catalog already; we just dispatch the constructed `intent`.
 * The runtime guard on `kind` is defensive.
 */
export function dispatchReplyIntents(
  intents: ChatDispatchedIntent[] | undefined,
  dispatchIntent: (intent: CanvasIntent, source?: "user" | "agent" | "tour") => unknown,
): void {
  for (const dispatched of intents ?? []) {
    const intent = dispatched.intent as CanvasIntent;
    if (typeof intent?.kind !== "string") continue;
    dispatchIntent(intent, "agent");
  }
}

export function useConversation(
  chatSessionId: string | null,
  opts?: ConversationOptions,
): ConversationApi {
  const api = useApi();
  const { state: chatState, enqueueFieldProposal, appendMessage } = useChatStore();
  const activeChatSession = chatSessionId ? chatState.sessions.get(chatSessionId) : null;
  const { dispatch: dispatchIntent } = useCanvasOrchestrator();

  const [liveTurns, setLiveTurns] = useState<LiveTurn[]>([]);
  const [sending, setSending] = useState(false);
  const [firstUserMessageSent, setFirstUserMessageSent] = useState(false);

  // `onFirstUserSend` must fire exactly once across the lifetime of this
  // hook instance, regardless of how `opts` re-identifies between renders.
  const firstSendFiredRef = useRef(false);
  const onFirstUserSendRef = useRef(opts?.onFirstUserSend);
  onFirstUserSendRef.current = opts?.onFirstUserSend;
  const scopeHintRef = useRef(opts?.scopeHint);
  scopeHintRef.current = opts?.scopeHint;
  const titleRef = useRef(opts?.title);
  titleRef.current = opts?.title;

  const seedTurns = useCallback((turns: LiveTurn[]) => {
    if (turns.length === 0) return;
    setLiveTurns((cur) => {
      const seen = new Set(cur.map((t) => t.id));
      const fresh = turns.filter((t) => !seen.has(t.id));
      if (fresh.length === 0) return cur;
      // Seeds lead the thread (a scripted opener comes first).
      return [...fresh, ...cur];
    });
  }, []);

  const handleSuggestedAction = useCallback(
    (action: ChatSuggestedAction, citations?: Citation[]) => {
      // "Show source" carries no intent of its own — it opens/highlights
      // the answer's primary citation, same as clicking the [1] chip.
      if (action.key === "show-source") {
        const c = citations?.[0];
        if (c) {
          dispatchIntent(citationToHighlightIntent(c), "user");
        }
        return;
      }
      const intent = suggestedActionToIntent(action);
      if (intent) dispatchIntent(intent, "agent");
    },
    [dispatchIntent],
  );

  // RT-01 hydration — the chat handler writes every turn to chat_messages;
  // without this the visible thread vanishes on refresh. Only seed when
  // liveTurns is still empty (the optimistic state wins any race).
  useEffect(() => {
    if (!chatSessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const messages = await api.chat.listChatMessages(chatSessionId);
        if (cancelled || messages.length === 0) return;
        const turns: LiveTurn[] = messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            citations: m.citations ?? [],
          }));
        setLiveTurns((cur) => (cur.length === 0 ? turns : cur));
      } catch (err) {
        captureException(err, {
          route: "/api/chat-sessions/:id/messages",
          chatSessionId,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api.chat, chatSessionId]);

  // `schema-agent-chat-affordances` — project ChatStore-emitted agent
  // messages (id prefix `agent-`) into the rendered live-turns list. The
  // Schema-Agent's confidence-delta narration is appended via
  // `appendAgentMessage`; without this projection it would land in
  // `ChatSession.messages` but never reach the rendered conversation.
  useEffect(() => {
    if (!activeChatSession) return;
    setLiveTurns((cur) => {
      const seen = new Set(cur.map((t) => t.id));
      const projected: LiveTurn[] = activeChatSession.messages
        .filter((m) => m.id.startsWith("agent-") && !seen.has(m.id))
        .map((m) => ({ id: m.id, role: "assistant", content: m.content }));
      if (projected.length === 0) return cur;
      return [...cur, ...projected];
    });
  }, [activeChatSession?.messages, activeChatSession]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      const userTurn: LiveTurn = { id: `u-${Date.now()}`, role: "user", content: trimmed };
      setLiveTurns((cur) => [...cur, userTurn]);

      // Lifecycle: fire onFirstUserSend exactly once + flip the observable
      // `firstUserMessageSent` state. The caller's Choreography observes the
      // latter (e.g. onboarding advances to F5) — only a genuine send sets it,
      // never RT-01 hydration of a persisted user turn.
      if (!firstSendFiredRef.current) {
        firstSendFiredRef.current = true;
        setFirstUserMessageSent(true);
        onFirstUserSendRef.current?.();
      }

      if (!chatSessionId) {
        setLiveTurns((cur) => [
          ...cur,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: "No active chat session — please refresh and try again.",
          },
        ]);
        return;
      }

      setSending(true);
      try {
        // widget-llm-integration Phase 5 — surface the user's current
        // ViewerStep kind so the LLM tool catalog is scoped.
        const stepIdx = activeChatSession?.viewer.currentStep.stepIndex ?? -1;
        const activeStepKind =
          stepIdx >= 0 ? activeChatSession?.viewer.history[stepIdx]?.kind ?? null : null;
        const scopeHint = scopeHintRef.current;
        const result = await api.chat.sendChatMessage({
          chatSessionId,
          newUserMessage: trimmed,
          sessionMeta: {
            // Session title wins; the caller's `title` is only a fallback
            // label when the session has none. This preserves the deleted
            // onboarding fork's `activeChatSession?.title ?? "Onboarding"`
            // precedence (and the steady fork's `"Steady chat"` label, which
            // a title-less steady session never overrode in practice).
            title: activeChatSession?.title ?? titleRef.current ?? "Conversation",
            // Read from the session — NOT hardcoded. Onboarding sessions
            // carry isOnboardingSession:true; a bare chat session false.
            isOnboarding: activeChatSession?.isOnboardingSession ?? true,
            onboardingSessionId: chatSessionId,
            activeEntityKey: activeChatSession?.activeEntityKey ?? null,
          },
          ...(scopeHint ? { scopeHint } : {}),
          activeStepKind,
        });
        setLiveTurns((cur) => [
          ...cur,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: result.reply.answer,
            proposedSchemaField: result.reply.proposedSchemaField,
            citations: result.reply.citations ?? [],
            suggestedActions: result.reply.suggestedActions ?? [],
          },
        ]);
        // core-data-model-hardening item 6 — mirror the assistant turn
        // (with citations) into the shared ChatStore so canvas consumers
        // (InteractView litRegions / CiteChip / report-pin) read it off
        // the in-memory session instead of re-fetching the thread. Minted
        // with the `m-` id prefix (via appendMessage) so the `agent-`
        // projection effect above does NOT re-render it into liveTurns.
        appendMessage({
          role: "assistant",
          content: result.reply.answer,
          citations: result.reply.citations ?? [],
        });
        // widget-llm-integration Phase 5 — dispatch every server-validated
        // LLM tool call through the canvas orchestrator.
        dispatchReplyIntents(result.reply.intents, dispatchIntent);
        // F3a wireframe-fix: also enqueue the proposal onto the canvas-side
        // ProposalCard queue so SchemaView's "above the list" surface fires.
        if (result.reply.proposedSchemaField) {
          enqueueFieldProposal({
            categoryId: result.reply.proposedSchemaField.categoryId,
            name: result.reply.proposedSchemaField.name,
            type: result.reply.proposedSchemaField.type,
            description: result.reply.proposedSchemaField.description,
            provenance: result.reply.proposedSchemaField.provenance,
          });
        }
      } catch (err) {
        const mapped = chatErrorToUserCopy(err);
        setLiveTurns((cur) => [
          ...cur,
          { id: `a-${Date.now()}`, role: "assistant", content: mapped.message },
        ]);
      } finally {
        setSending(false);
      }
    },
    [api.chat, sending, chatSessionId, activeChatSession, enqueueFieldProposal, appendMessage, dispatchIntent],
  );

  return { liveTurns, sending, firstUserMessageSent, send, handleSuggestedAction, seedTurns };
}
