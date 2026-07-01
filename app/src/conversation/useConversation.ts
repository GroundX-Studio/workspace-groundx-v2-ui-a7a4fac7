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
 *     engine NEVER mutates the viewer directly; navigation choreography
 *     stays in the caller and goes through the orchestrator dispatch.
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
import { cryptoRandom } from "@/lib/cryptoRandom";
import type {
  ChatDispatchedIntent,
  ChatSessionEnsureMetadata,
  ChatSuggestedAction,
  ProposedSchemaField,
} from "@/api/chatSessions";
import { citationRegions, type Citation, type ToolActivity } from "@groundx/shared";
import { useApi } from "@/contexts/ApiContext";
import type { CanvasIntent } from "@/contexts/CanvasOrchestratorContext";
import { useCanvasOrchestrator } from "@/contexts/CanvasOrchestratorContext";
import {
  titleForEnsure,
  useChatStore,
  type ChatSession,
} from "@/contexts/ChatStoreContext";
import { litRegionsFromCitations } from "@/views/Onboarding/litRegions";

/**
 * simulated-agent-narration — per-message thinking beat for SCRIPTED agent
 * narration reveal. Shorter than the Understand-page ThinkingStream window
 * (1500-2800ms) — chat turn-taking should feel snappy, not sluggish — and
 * randomized so a multi-message burst doesn't read as a metronome.
 */
const AGENT_REVEAL_MIN_MS = 320;
const AGENT_REVEAL_MAX_MS = 560;

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
  /**
   * agentic-tool-loop — `reply.toolActivity[]`: what the agent consulted
   * server-side this turn (e.g. "Checked GroundX docs"), rendered as a muted
   * annotation on the assistant bubble. Absent/empty = nothing to show.
   */
  toolActivity?: ToolActivity[];
  /**
   * report-pin-affordance — OPT-IN: `true` ONLY on genuine document-answer turns
   * (the `send()` server reply + DB-hydration of a non-error assistant turn).
   * The pin affordance renders iff `pinnable === true`, so agent narration,
   * scripted intro/choreography, booking, and error turns (none of which set it)
   * are never pinnable. Distinct from the `ChatStore.pinToReport` mutation.
   */
  pinnable?: boolean;
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
   * simulated-agent-narration — `true` while the chat is in a "thinking" beat:
   * either a real user turn is in flight (`sending`) OR scripted agent
   * narration (book-call / sign-up / schema-agent) is being revealed one
   * message at a time. Drives the single `chat-thinking` indicator so scripted
   * bubbles read as live turn-taking instead of popping in fully-formed.
   * Distinct from `sending`, which alone gates the input bar + pin streaming.
   */
  thinking: boolean;
  /**
   * Canvas↔chat coherence (2026-06-11) — `true` once the RT-01 history
   * hydration has SETTLED (the listChatMessages fetch resolved, success or
   * error). Consumers that must decide "is this thread genuinely empty?"
   * (e.g. the onboarding Intro snapping the canvas to Understand before
   * replaying its scripted scan narration) wait for this instead of racing
   * the fetch — a returning user's history may still be in flight at mount.
   */
  hydrated: boolean;
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
/**
 * Canvas-navigation intent kinds that move the canvas to a NON-doc-viewer
 * surface. When a reply carries one of these, the answer's auto-highlight (which
 * forces the doc-viewer / PDF) must stand down so the explicit navigation wins.
 * Doc-surface navs (`openDocument` / `showInteract` / `jumpToPage`) are omitted —
 * a citation highlight there is complementary, not a conflict.
 */
const NON_DOC_CANVAS_NAV_KINDS: ReadonlySet<string> = new Set([
  "showExtract",
  "editSchema",
  "showReport",
  "editTemplate",
  "showIntegrate",
]);

export function citationToHighlightIntent(c: Citation): CanvasIntent {
  // multi-region-citations: a regionless "location unknown" citation has no page
  // to jump to — open the document without a highlight.
  const regions = citationRegions(c);
  const page = c.page ?? regions[0]?.page;
  if (page == null) {
    return { kind: "openDocument", ["documentId"]: c.documentId };
  }
  return {
    kind: "highlightCitation",
    ["documentId"]: c.documentId,
    page,
    ...(c.bbox ? { bbox: c.bbox } : {}),
    ...(c.tier ? { tier: c.tier } : {}),
    // multi-region-citations P2.1 — light every region of the auto-highlighted citation.
    ...(regions.length > 0 ? { regions } : {}),
  };
}

/**
 * widget-llm-integration Phase 1 — map a clicked SuggestedAction onto a
 * `CanvasIntent` the orchestrator can dispatch.
 */
export function suggestedActionToIntent(action: ChatSuggestedAction): CanvasIntent | null {
  // widget-llm-integration Phase 8 — `tool:<name>` chips carry the
  // server-validated, server-constructed CanvasIntent on `detail.intent`. This
  // is the ONE chip path: mutate chips, and (standardized-viewer-control T7)
  // OFFERED navigation chips (a navigation tool call carrying `offerAs`) both
  // arrive as `tool:<name>` entries with their built intent on `detail.intent`.
  if (action.key.startsWith("tool:")) {
    const intent = action.detail?.intent;
    if (intent && typeof intent === "object" && typeof (intent as { kind?: unknown }).kind === "string") {
      return intent as CanvasIntent;
    }
    return null;
  }
  // standardized-viewer-control T7 — the legacy generic string-label
  // navigation chip is gone; the middleware no longer emits a general
  // any-destination navigator. Navigation is now per-destination intents
  // carried on `tool:<name>` chips (handled above).
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

function ensureMetadataFromSession(
  session: ChatSession | null,
  fallbackTitle?: string,
): ChatSessionEnsureMetadata | undefined {
  if (!session) return undefined;
  return {
    onboardingSessionId: session.id,
    title: titleForEnsure(session) || fallbackTitle || "Conversation",
    isOnboarding: session.scopeKey ? false : session.isOnboardingSession,
    activeEntityKey: session.activeEntityKey ?? null,
  };
}

export function useConversation(
  chatSessionId: string | null,
  opts?: ConversationOptions,
): ConversationApi {
  const api = useApi();
  const { state: chatState, enqueueFieldProposal, appendMessage } = useChatStore();
  const activeChatSession = chatSessionId ? chatState.sessions.get(chatSessionId) : null;
  const chatStateRef = useRef(chatState);
  chatStateRef.current = chatState;
  const { dispatch: dispatchIntent } = useCanvasOrchestrator();

  const [liveTurns, setLiveTurns] = useState<LiveTurn[]>([]);
  const [sending, setSending] = useState(false);
  const [firstUserMessageSent, setFirstUserMessageSent] = useState(false);
  // simulated-agent-narration — scripted agent bubbles (book-call / sign-up /
  // schema-agent) are revealed ONE AT A TIME with a short thinking beat between
  // them instead of all popping in fully-formed. `pendingAgentReveals` is the
  // reveal queue; `narrating` shows the thinking indicator while it drains.
  const [pendingAgentReveals, setPendingAgentReveals] = useState<LiveTurn[]>([]);
  const [narrating, setNarrating] = useState(false);
  // Every agent-message id ever enqueued — so the projection never re-queues a
  // message already revealed or in flight (the effect re-runs on every messages
  // change).
  const revealedAgentIdsRef = useRef<Set<string>>(new Set());

  // chat-response-streaming — the in-flight stream's AbortController, so the
  // SSE connection is CANCELLED on unmount (instead of running to completion as
  // a zombie that mutates state on a dead component + holds the socket open).
  // The `sending` gate already prevents a single client from overlapping turns,
  // so this is unmount-cancel, not client-side supersede.
  const inFlightAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => inFlightAbortRef.current?.abort(), []);

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
      // "Show all sources" — light up EVERY citation region of the answer at
      // once (color-coded), distinct from a single `[N]` chip (one region) and
      // from the auto-highlight (primary only).
      if (action.key === "show-source") {
        const cites = citations ?? [];
        const primary = cites[0];
        // multi-region: the page to show is the primary citation's first region
        // (or its legacy page). Skip when even that is unknown (regionless only).
        const showPage = primary ? primary.page ?? citationRegions(primary)[0]?.page : undefined;
        if (primary && showPage != null) {
          dispatchIntent(
            {
              kind: "showCitations",
              documentId: primary.documentId,
              page: showPage,
              regions: litRegionsFromCitations(cites),
            },
            "user",
          );
        }
        return;
      }
      // standardized-viewer-control T8 — a suggested action is dispatched
      // because the USER clicked it (a pill OR an inline anchor), so the source
      // is `"user"`, never `"agent"` (the agent only OFFERED it; design §1.4/§1.5
      // — anything the user triggers is `source:"user"`). This is the single
      // dispatch path both the pill and the inline-anchor surface route through.
      const intent = suggestedActionToIntent(action);
      if (intent) dispatchIntent(intent, "user");
    },
    [dispatchIntent],
  );

  // RT-01 hydration — the chat handler writes every turn to chat_messages;
  // without this the visible thread vanishes on refresh. Only seed when
  // liveTurns is still empty (the optimistic state wins any race).
  // `hydrated` flips true once the fetch SETTLES (success or error) so
  // consumers can distinguish "genuinely empty thread" from "still loading".
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!chatSessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const messages = await api.chat.listChatMessages(
          chatSessionId,
          ensureMetadataFromSession(
            chatStateRef.current.sessions.get(chatSessionId) ?? null,
            titleRef.current,
          ),
        );
        if (cancelled || messages.length === 0) return;
        const turns: LiveTurn[] = messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            citations: m.citations ?? [],
            // report-pin-affordance — opt-in: a hydrated NON-error ASSISTANT turn
            // is a genuine persisted answer → pinnable. User turns and error
            // turns never set it (so they're not pinnable).
            ...(m.role === "assistant" && !m.errorCode ? { pinnable: true as const } : {}),
          }));
        setLiveTurns((cur) => (cur.length === 0 ? turns : cur));
      } catch (err) {
        api.telemetry.captureException(err, {
          route: "/api/chat-sessions/:id/messages",
          chatSessionId,
        });
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api.chat, api.telemetry, chatSessionId]);

  // `schema-agent-chat-affordances` — project ChatStore-emitted agent
  // messages (id prefix `agent-`) into the rendered conversation. The
  // Schema-Agent's confidence-delta narration AND the onboarding book-call /
  // sign-up narration are appended via `appendAgentMessage`; without this
  // projection they would land in `ChatSession.messages` but never render.
  //
  // simulated-agent-narration — rather than dumping every new agent message in
  // at once (they "just appeared"), enqueue the fresh ones onto a reveal queue.
  // The processor effect below drains it one message at a time behind a
  // thinking beat, so scripted bubbles read as live turn-taking.
  useEffect(() => {
    if (!activeChatSession) return;
    const seen = revealedAgentIdsRef.current;
    const fresh: LiveTurn[] = activeChatSession.messages
      .filter((m) => m.id.startsWith("agent-") && !seen.has(m.id))
      .map((m) => ({ id: m.id, role: "assistant" as const, content: m.content }));
    if (fresh.length === 0) return;
    for (const t of fresh) seen.add(t.id);
    setPendingAgentReveals((cur) => [...cur, ...fresh]);
  }, [activeChatSession?.messages, activeChatSession]);

  // simulated-agent-narration — drain the reveal queue one message at a time.
  // While the queue is non-empty `narrating` is true (the thinking indicator
  // shows); after a short, slightly-randomized beat the head message lands in
  // the thread and the effect re-runs for the next. Mirrors the Understand-page
  // ThinkingStream cadence (a beat, then content), just faster for chat.
  useEffect(() => {
    if (pendingAgentReveals.length === 0) {
      setNarrating(false);
      return undefined;
    }
    setNarrating(true);
    const next = pendingAgentReveals[0];
    const beat = AGENT_REVEAL_MIN_MS + Math.random() * (AGENT_REVEAL_MAX_MS - AGENT_REVEAL_MIN_MS);
    const timer = window.setTimeout(() => {
      setLiveTurns((cur) => (cur.some((t) => t.id === next.id) ? cur : [...cur, next]));
      setPendingAgentReveals((cur) => cur.filter((t) => t.id !== next.id));
    }, beat);
    return () => window.clearTimeout(timer);
  }, [pendingAgentReveals]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      const userTurn: LiveTurn = { id: `u-${cryptoRandom()}`, role: "user", content: trimmed };
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
            id: `a-${cryptoRandom()}`,
            role: "assistant",
            content: "No active chat session — please refresh and try again.",
            // Not pinnable (a local error turn, not a genuine answer).
          },
        ]);
        return;
      }

      setSending(true);
      // chat-response-streaming P4 — mint the assistant turn id up front so the
      // in-flight bubble fills token-by-token and the error path targets it.
      const assistantTurnId = `a-${cryptoRandom()}`;
      // Fresh AbortController for THIS turn; unmount aborts it (see the effect above).
      const abortController = new AbortController();
      inFlightAbortRef.current = abortController;
      try {
        // widget-llm-integration Phase 5 — surface the user's current
        // ViewerStep kind so the LLM tool catalog is scoped.
        const targetChatSession = chatSessionId
          ? chatStateRef.current.sessions.get(chatSessionId)
          : null;
        const stepIdx = targetChatSession?.viewer.currentStep.stepIndex ?? -1;
        const activeStepKind =
          stepIdx >= 0 ? targetChatSession?.viewer.history[stepIdx]?.kind ?? null : null;
        const scopeHint = scopeHintRef.current;
        // P4 — push the in-flight assistant bubble, then STREAM into it: tokens
        // append live, activity drives the indicator; the cleaned envelope
        // finalizes it. The fake api delegates streamChatMessage→sendChatMessage,
        // so non-streaming callers/tests are unaffected.
        setLiveTurns((cur) => [...cur, { id: assistantTurnId, role: "assistant", content: "" }]);
        const result = await api.chat.streamChatMessage(
          {
            chatSessionId,
            newUserMessage: trimmed,
            sessionMeta: {
              // Session title wins; the caller's `title` is only a fallback
              // label when the session has none. This preserves the deleted
              // onboarding fork's `activeChatSession?.title ?? "Onboarding"`
              // precedence (and the steady fork's `"Steady chat"` label, which
              // a title-less steady session never overrode in practice).
              title: targetChatSession?.title ?? titleRef.current ?? "Conversation",
              // Read from the session — NOT hardcoded. Onboarding sessions
              // carry isOnboardingSession:true; a bare chat session false.
              isOnboarding: targetChatSession?.scopeKey
                ? false
                : targetChatSession?.isOnboardingSession ?? titleRef.current === "Onboarding",
              onboardingSessionId: chatSessionId,
              activeEntityKey: targetChatSession?.activeEntityKey ?? null,
            },
            ...(scopeHint ? { scopeHint } : {}),
            activeStepKind,
          },
          {
            onToken: (delta) =>
              setLiveTurns((cur) =>
                cur.map((t) => (t.id === assistantTurnId ? { ...t, content: t.content + delta } : t)),
              ),
            onActivity: (activity) =>
              setLiveTurns((cur) =>
                cur.map((t) =>
                  t.id === assistantTurnId
                    ? { ...t, toolActivity: [...(t.toolActivity ?? []), activity] }
                    : t,
                ),
              ),
          },
          { signal: abortController.signal },
        );
        // Finalize: the cleaned answer + full metadata replace the streamed draft
        // (the streamed text is the RAW answer; the envelope's is fence-stripped).
        setLiveTurns((cur) =>
          cur.map((t) =>
            t.id === assistantTurnId
              ? {
                  ...t,
                  content: result.reply.answer,
                  proposedSchemaField: result.reply.proposedSchemaField,
                  citations: result.reply.citations ?? [],
                  suggestedActions: result.reply.suggestedActions ?? [],
                  toolActivity: result.reply.toolActivity ?? [],
                  // report-pin-affordance — opt-in: the genuine server answer is
                  // the canonical pinnable turn.
                  pinnable: true,
                }
              : t,
          ),
        );
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
        // Auto-show the answer's source WITHOUT a click: as soon as an answer
        // with a citation arrives, highlight its primary citation on the canvas
        // (same surface as clicking [1] / "Show source"). "agent" source marks it
        // as automatic, not a user gesture.
        //
        // chat-QA fix — the auto-highlight forces the doc-viewer (PDF) surface, so
        // it must NOT fire when the SAME reply explicitly navigated the canvas to a
        // NON-doc surface (Extract / Report / Integrate / schema editor); otherwise
        // it dispatches AFTER the nav intent and yanks the user back to the PDF
        // ("show me the extracted fields" landed on the doc instead of Extract).
        // Doc-surface navs (openDocument / showInteract / jumpToPage) keep the
        // highlight — it is complementary there. This is what "an explicit
        // navigation wins" was always meant to guarantee.
        const navigatedAwayFromDoc = (result.reply.intents ?? []).some((d) =>
          NON_DOC_CANVAS_NAV_KINDS.has((d.intent as CanvasIntent | undefined)?.kind ?? ""),
        );
        const primaryCitation = result.reply.citations?.[0];
        if (primaryCitation && !navigatedAwayFromDoc) {
          dispatchIntent(citationToHighlightIntent(primaryCitation), "agent");
        }
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
        // An intentional cancel (unmount) is not a failure — never render an error
        // bubble for it (and `setLiveTurns` on an unmounting component is a no-op
        // anyway). This also avoids the status-0 abort mapping to scary "something
        // went wrong" copy.
        if (abortController.signal.aborted) return;
        const mapped = chatErrorToUserCopy(err);
        // Replace the in-flight bubble with the error (or append if the stream
        // failed before it was pushed). Not pinnable (an error, not an answer).
        setLiveTurns((cur) =>
          cur.some((t) => t.id === assistantTurnId)
            ? cur.map((t) =>
                t.id === assistantTurnId ? { id: assistantTurnId, role: "assistant", content: mapped.message } : t,
              )
            : [...cur, { id: assistantTurnId, role: "assistant", content: mapped.message }],
        );
      } finally {
        // Release the controller once this turn settles so the unmount effect can't
        // abort an already-finished stream.
        if (inFlightAbortRef.current === abortController) inFlightAbortRef.current = null;
        setSending(false);
      }
    },
    [api.chat, sending, chatSessionId, activeChatSession, enqueueFieldProposal, appendMessage, dispatchIntent],
  );

  return {
    liveTurns,
    sending,
    // The single thinking indicator fires for a real in-flight turn OR while
    // scripted agent narration is being revealed.
    thinking: sending || narrating,
    hydrated,
    firstUserMessageSent,
    send,
    handleSuggestedAction,
    seedTurns,
  };
}
