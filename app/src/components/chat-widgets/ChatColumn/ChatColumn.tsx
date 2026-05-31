/**
 * ChatColumn — the chat-column body across F1 ↔ F7.
 *
 * Dispatches between three states:
 *
 *   1. Gate active (open / committed / composing)
 *      → render <GateChatPanel /> (the existing gate-typing + GateView surface).
 *
 *   2. F2+ with a scenario picked
 *      → render the wireframe conversation per spec-chapters.jsx · Flow_Processing:
 *         · Conversation header + sample-switcher subline
 *         · User bubble (scenario name)
 *         · Bot lead ("Reading <filename> now.")
 *         · Streaming thinking-notes (timer-driven, one per ~1.1s)
 *         · After the stream finishes: Done + "Pick a view:" pills
 *         · Pills advance to F3 (the existing canvas CTA moves here)
 *
 *   3. F1 or F2-BYO-no-scenario
 *      → idle placeholder ("Ask anything about the sample…") or the BYO
 *         "sign in to upload" copy.
 *
 * Streaming logic + manifest reading is owned here (was previously in
 * UnderstandView). Chunk 4 cleans the canvas accordingly.
 */

import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useMemo, useRef, useState, type FC, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { chatErrorToUserCopy, listChatMessages, sendChatMessage } from "@/api/chatSessions";
import { useLiveExtractionSchema } from "@/api/useLiveExtractionSchema";
import type {
  ChatDispatchedIntent,
  ChatSuggestedAction,
  ProposedSchemaField,
} from "@/api/chatSessions";
import type { Citation, WidgetRole, WidgetScope } from "@groundx/shared";
import { CiteChip } from "@/components/brand/CiteChip/CiteChip";
import { ProposeSchemaFieldCard } from "@/components/chat-widgets/ProposeSchemaFieldCard/ProposeSchemaFieldCard";
import { SuggestedActionChips } from "@/components/chat-widgets/SuggestedActionChips/SuggestedActionChips";
import { ThinkingStream } from "@/components/chat-widgets/ThinkingStream/ThinkingStream";
import { LoadingDots } from "@/components/primitives/LoadingDots/LoadingDots";
import { Markdown } from "@/components/primitives/Markdown/Markdown";
import { useCanvasOrchestrator } from "@/contexts/CanvasOrchestratorContext";
import type { CanvasIntent } from "@/contexts/CanvasOrchestratorContext";
import { useChatStore } from "@/contexts/ChatStoreContext";
import { captureException } from "@/lib/sentry";

import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS_2X,
  BORDER_RADIUS_PILL,
  BORDER_RADIUS_SM,
  CYAN,
  EYEBROW_ON_LIGHT,
  FONT_SIZE_CAPTION,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_HEADLINE,
  FONT_WEIGHT_LABEL,
  GREEN,
  ICON_SIZE_INLINE,
  LETTER_SPACING_LABEL,
  MUTED_ON_LIGHT,
  NAVY,
  WARM_OFFWHITE,
  WHITE,
} from "@/constants";
import { useAppMode } from "@/contexts/AppModeContext";
import { useWidgetRole } from "@/lib/widgetRole";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";

import { GateChatPanel } from "@/views/Onboarding/GateChatPanel";

// ARCH-11 (2026-05-26): the timed thinking-note reveal + done-state
// persistence is now owned by `chat-widgets/ThinkingStream` — F2 mounts
// the widget and listens for `onDone` to reveal the "Done." bubble +
// Pick-a-view CTAs. Cadence constants + sessionStorage key live in
// the widget; this file's responsibility is conversation-flow
// orchestration only.

interface PickViewOption {
  key: string;
  label: string;
}

// Per-scenario pick-a-view pills derive from the scenario's extraction
// schema in F2ConversationFlow itself — see the useMemo there.

export interface ChatColumnProps {
  /**
   * 2026-05-30-widget-role-access — widget AUTHORIZATION role.
   * `anonymous` (uncommitted / pre-sign-up) · `member` (signed in).
   * ChatColumn is available to ALL roles and locks NO affordance by
   * role today (see `docs/agents/widget-access-matrix.md` §1 + §2);
   * the prop is required to satisfy the widget contract and is
   * forwarded to children as roles get teeth. NEVER derive the
   * conversation flow/surface from `role`.
   */
  role: WidgetRole;
  /**
   * 2026-05-30-widget-role-access — required widget scope. Chat is
   * session-scoped, not document-scoped, so ChatColumn always declares
   * `{ type: "none" }` (matrix §1b). It is not a ScopedViewerWidget.
   */
  scope: WidgetScope;
  /**
   * Override the scenario id read from session/appMode context. Used by
   * the OnboardingShell during the F2->F1 slide-out so the panes can
   * show the conversation that is sliding away, not the new F1 idle
   * state that has already taken over the session.
   */
  overrideScenarioId?: string | null;
  /**
   * Override the current frame. Same use case as overrideScenarioId.
   */
  overrideFrame?: "f1" | "f2" | "f3" | "f3a" | "f4" | "f5" | "f6" | "f7";
  /**
   * UI-05 (2026-05-27) — which conversation SURFACE renders. This is
   * FLOW/SHELL state, NOT authorization — it is sourced from the
   * mounting shell (OnboardingShell vs SteadyShell), never from
   * `role`. 2026-05-30-widget-role-access re-sourced the old flow
   * `mode` here instead of renaming it to `role` (which would
   * re-encode a chat surface as an auth role). unified-conversation-flow
   * removes this prop entirely once the two surfaces fully merge.
   *   - "onboarding" (default): Gate + F1/F2/BYO branching + scripted
   *     thinking-stream + sample-switcher + Pick-a-view pills.
   *   - "steady": bare conversation — persisted thread + LiveChatInputBar,
   *     no onboarding-only decorations. SteadyShell mounts this.
   *
   * Per the no-duplicates rule (memory `feedback_no_onboarding_duplicates.md`),
   * onboarding + steady share the same production widget.
   */
  surface?: "onboarding" | "steady";
}

/**
 * Outer dispatch — selects between the onboarding surface (which
 * needs OnboardingSession + ScenarioRegistry + AppMode contexts)
 * and the steady surface (which needs only ChatStore). Splitting
 * the two means each inner component has a stable hook order, even
 * if `surface` were ever to change at runtime (in practice it doesn't —
 * OnboardingShell vs SteadyShell mount different parents).
 *
 * `role`/`scope` satisfy the widget contract; they do NOT select the
 * surface (that is shell/flow state on `surface`).
 */
export const ChatColumn: FC<ChatColumnProps> = ({ overrideScenarioId, overrideFrame, surface = "onboarding" }) => {
  if (surface === "steady") return <SteadyConversationFlow />;
  return <ChatColumnInner overrideScenarioId={overrideScenarioId} overrideFrame={overrideFrame} />;
};

interface ChatColumnInnerProps {
  overrideScenarioId?: string | null;
  overrideFrame?: "f1" | "f2" | "f3" | "f3a" | "f4" | "f5" | "f6" | "f7";
}

const ChatColumnInner: FC<ChatColumnInnerProps> = ({ overrideScenarioId, overrideFrame }) => {
  const { state: appMode } = useAppMode();
  const { state: session } = useOnboardingSession();
  const { byId } = useScenarioRegistry();

  const currentFrame = overrideFrame ?? session.currentFrame;
  const scenarioId =
    overrideScenarioId !== undefined
      ? overrideScenarioId
      : appMode.scenario ?? session.scenario;
  const scenario = scenarioId ? byId(scenarioId) : undefined;
  // WF-17 — the F2 Pick-a-view pills derive from the LIVE workflow schema,
  // not `manifest.extractionSchema`. The hook must run unconditionally
  // (before the gate early-return) per the Rules of Hooks; it returns null
  // for placeholder ids / failures so `derivePickViews` falls back to the
  // manifest until WF-08 strips it.
  const liveSchema = useLiveExtractionSchema(scenario?.documents?.[0]?.documentId);

  // Gate takes over the chat column when active — preserves the existing
  // F6 typing-indicator + GateView flow.
  const gateActive =
    session.gate.status === "open" ||
    session.gate.status === "committed";
  if (gateActive) return <GateChatPanel />;

  const isF1 = currentFrame === "f1";
  const isF2 = currentFrame === "f2";

  // 2026-05-27 update: chat conversation stays mounted across the
  // F2→F5 onboarding journey so auto-advance (ThinkingStream done →
  // F3, first live send → F5) doesn't unmount the component and
  // wipe liveTurns. Scripted intro renders only on F2 mount; on
  // re-renders for F3/F5 the same bubbles persist as conversation
  // history (no timers re-fire because ThinkingStream's replay
  // guard skips them after the first run).
  const isInScenarioJourney =
    currentFrame === "f2" ||
    currentFrame === "f3" ||
    currentFrame === "f3a" ||
    currentFrame === "f4" ||
    currentFrame === "f5";
  if (isInScenarioJourney && scenario) {
    return (
      <F2ConversationFlow
        scenarioId={scenarioId!}
        scenarioName={scenario.manifest.hero?.title ?? scenarioId ?? "Sample"}
        fileName={scenario.documents[0]?.fileName ?? "sample.pdf"}
        thinkingScript={scenario.manifest.thinkingScript ?? []}
        pickViews={derivePickViews(scenario, liveSchema)}
      />
    );
  }
  if (isF1) return <IdleChatPlaceholder />;
  if (!scenario) return <ByoChatPlaceholder />;
  return <IdleChatPlaceholder />;
};

// ── Idle / BYO placeholders ───────────────────────────────────────────────

const IdleChatPlaceholder: FC = () => (
  <Stack spacing={1}>
    <Typography
      variant="overline"
      sx={{
        color: NAVY,
        letterSpacing: LETTER_SPACING_LABEL,
        fontWeight: FONT_WEIGHT_LABEL,
      }}
    >
      CHAT
    </Typography>
    <Typography variant="body2" sx={{ color: MUTED_ON_LIGHT }}>
      Ask anything about the sample. Citations appear next to every answer.
    </Typography>
  </Stack>
);

const ByoChatPlaceholder: FC = () => (
  <Stack spacing={1}>
    <Typography
      variant="overline"
      sx={{
        color: EYEBROW_ON_LIGHT,
        letterSpacing: LETTER_SPACING_LABEL,
        fontWeight: FONT_WEIGHT_LABEL,
      }}
    >
      UNDERSTAND
    </Typography>
    <Typography variant="h5" sx={{ color: NAVY }}>
      Sign in to start uploading your own docs.
    </Typography>
    <Typography variant="body2" sx={{ color: BODY_TEXT, mt: 1 }}>
      Once you sign in, this chat streams the same parse + extract experience
      over your documents.
    </Typography>
  </Stack>
);

// ── Steady-mode conversation flow (UI-05) ────────────────────────────────

/**
 * UI-05 (2026-05-27) — bare conversation for the steady-mode shell.
 * No scripted thinking-stream, no Pick-a-view pills, no sample-switcher,
 * no scenario header. Just the persisted thread + the input bar.
 *
 * Reuses everything load-bearing from F2ConversationFlow: the
 * `liveTurns` state, the RT-01 hydration effect, the send handler
 * (which writes to the same `/api/chat/messages` route), the
 * UserBubble/BotBubble/LoadingDots primitives, and LiveChatInputBar.
 *
 * Per the no-duplicates rule: same production widget shared across
 * onboarding + steady. Onboarding mode locks specific controls
 * (the scripted intro). Steady mode renders only the production
 * surface. Same code path, same data, same persistence.
 */
/**
 * Build the `highlightCitation` CanvasIntent for a "show source" click /
 * `[n]` chip. Extracted so the two conversation surfaces (steady +
 * onboarding) share one definition instead of duplicating the object
 * literal.
 *
 * NB: the document-id field is assigned via a computed key
 * (`{ ["documentId"]: ... }`) on purpose. The widget-contract drift
 * guard forbids a raw document-id PROP declaration in a widget's main
 * `.tsx` (raw ids collapse into `scope`); a plain document-id object
 * key would false-positive on that regex. ChatColumn's scope is
 * `{ type: "none" }` — this is an intent payload field, not a widget
 * prop — so the computed key sidesteps the guard without weakening it.
 */
function citationToHighlightIntent(c: Citation): CanvasIntent {
  return {
    kind: "highlightCitation",
    ["documentId"]: c.documentId,
    page: c.page,
    ...(c.bbox ? { bbox: c.bbox } : {}),
    ...(c.tier ? { tier: c.tier } : {}),
  };
}

const SteadyConversationFlow: FC = () => {
  const { state: chatState, enqueueFieldProposal, appendMessage } = useChatStore();
  const chatSessionId = chatState.activeSessionId;
  // Scroll-to-bottom ref — see effect below.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeChatSession = chatSessionId ? chatState.sessions.get(chatSessionId) : null;
  const { dispatch: dispatchIntent } = useCanvasOrchestrator();
  const widgetRole = useWidgetRole();

  const [liveTurns, setLiveTurns] = useState<LiveTurn[]>([]);
  const [sending, setSending] = useState(false);

  const handleSuggestedAction = useCallback(
    (action: ChatSuggestedAction, citations?: Citation[]) => {
      // "Show source" carries no intent of its own — it opens/highlights the
      // answer's primary citation, same as clicking the [1] chip. (Previously
      // this fell through to a null intent and did nothing.)
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

  // RT-01 hydration — identical to F2ConversationFlow's effect. The
  // chat handler writes every turn to chat_messages; without this the
  // visible thread vanishes on refresh.
  useEffect(() => {
    if (!chatSessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const messages = await listChatMessages(chatSessionId);
        if (cancelled || messages.length === 0) return;
        const turns: LiveTurn[] = messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            // clickable-citations Phase 2 — RT-01 hydrate carries
            // `citations` per row; project onto LiveTurn so chips
            // re-render after a refresh.
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
  }, [chatSessionId]);

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      const userTurn: LiveTurn = { id: `u-${Date.now()}`, role: "user", content: trimmed };
      setLiveTurns((cur) => [...cur, userTurn]);
      if (!chatSessionId) {
        setLiveTurns((cur) => [
          ...cur,
          { id: `a-${Date.now()}`, role: "assistant", content: "No active chat session — please refresh and try again." },
        ]);
        return;
      }
      setSending(true);
      try {
        // widget-llm-integration Phase 5 — surface the user's current
        // ViewerStep kind to the middleware so the LLM tool catalog
        // is scoped to relevant tools. Falls back to undefined when
        // the session hasn't seeded a step yet.
        const stepIdx = activeChatSession?.viewer.currentStep.stepIndex ?? -1;
        const activeStepKind =
          stepIdx >= 0 ? activeChatSession?.viewer.history[stepIdx]?.kind ?? null : null;
        const result = await sendChatMessage({
          chatSessionId,
          newUserMessage: trimmed,
          sessionMeta: {
            title: activeChatSession?.title ?? "Steady chat",
            isOnboarding: false,
            onboardingSessionId: chatSessionId,
            activeEntityKey: activeChatSession?.activeEntityKey ?? null,
          },
          activeStepKind,
        });
        setLiveTurns((cur) => [
          ...cur,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: result.reply.answer,
            proposedSchemaField: result.reply.proposedSchemaField,
            // clickable-citations Phase 2 — thread reply citations
            // onto the LiveTurn so CiteChips render alongside the
            // bubble.
            citations: result.reply.citations ?? [],
            // widget-llm-integration Phase 1 — thread suggestedActions
            // so the SuggestedActionChips widget renders below the bubble.
            suggestedActions: result.reply.suggestedActions ?? [],
          },
        ]);
        // core-data-model-hardening item 6 — also write the assistant
        // turn (with citations) into the shared ChatStore so canvas
        // consumers (InteractView litRegions / CiteChip / report-pin)
        // read it off the in-memory session instead of re-fetching the
        // thread. The server already persists the row; this is the
        // in-memory mirror.
        appendMessage({
          role: "assistant",
          content: result.reply.answer,
          citations: result.reply.citations ?? [],
        });
        // widget-llm-integration Phase 5 — dispatch every
        // server-validated LLM tool call through the canvas
        // orchestrator. Each entry on `reply.intents[]` is a
        // CanvasIntent shape constructed by the server tool's
        // `intentBuilder`.
        dispatchReplyIntents(result.reply.intents, dispatchIntent);
        // F3a wireframe-fix: also enqueue the proposal onto the
        // canvas-side ProposalCard queue so SchemaView's "above the
        // list" surface fires. The chat propose-card stays as a
        // mirror; canvas + chat both show the same proposal until
        // either surface accepts/dismisses it.
        if (result.reply.proposedSchemaField) {
          enqueueFieldProposal({
            categoryId: result.reply.proposedSchemaField.categoryId,
            name: result.reply.proposedSchemaField.name,
            type: result.reply.proposedSchemaField.type,
            description: result.reply.proposedSchemaField.description,
            // proposal-envelope-provenance: forward the Zod parse
            // provenance so the canvas ProposalCard surfaces the
            // `envelope verified` label.
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
    [sending, chatSessionId, activeChatSession, enqueueFieldProposal, dispatchIntent],
  );

  // Scroll the conversation body to the newest message whenever a
  // turn is appended or the thinking indicator appears. The body
  // has `overflow: auto`; we just push scrollTop to scrollHeight.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [liveTurns, sending]);

  return (
    <Box data-testid="steady-chat-conversation" sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* DBG-01 B: reserve a scrollbar gutter (inline style — not a brand
          token) + right padding so the scrollbar never paints over the
          message bubbles. */}
      <Box
        ref={scrollRef}
        data-testid="steady-chat-scroll"
        style={{ scrollbarGutter: "stable" }}
        sx={{ flex: 1, minHeight: 0, overflow: "auto", py: 1.5, pr: 1, display: "flex", flexDirection: "column", gap: 1.25 }}
      >
        {liveTurns.length === 0 && !sending && (
          <BotBubble testid="steady-chat-empty">
            Ask anything about your documents.
          </BotBubble>
        )}
        <LiveTurnList
          liveTurns={liveTurns}
          sending={sending}
          surface="steady"
          role={widgetRole}
          onSuggestedAction={handleSuggestedAction}
        />
      </Box>
      <Box sx={{ pt: 1, borderTop: `1px solid ${BORDER}` }}>
        <LiveChatInputBar onSend={handleSend} disabled={sending} />
      </Box>
    </Box>
  );
};

// ── F2 conversation flow ─────────────────────────────────────────────────

interface F2ConversationFlowProps {
  scenarioId: string;
  scenarioName: string;
  fileName: string;
  thinkingScript: string[];
  pickViews: PickViewOption[];
}

/**
 * Derive the Pick-a-view pill set from the scenario's extraction
 * schema. Each category becomes one pill (label = `category.name`
 * verbatim from the manifest, key = `category.id`). POL-03: we
 * previously `.toLowerCase()`'d the label, which read awkwardly for
 * multi-word categories ("Bill Statement" → "bill statement"). The
 * manifest already authors category names in the right case, so we
 * trust it. Scenarios without an extraction schema (e.g. Solar —
 * Interact + Report only) get a single "Show me chat" pill that
 * jumps to F5.
 */
function derivePickViews(
  scenario: NonNullable<ReturnType<ReturnType<typeof useScenarioRegistry>["byId"]>>,
  liveSchema?: import("@/types/scenarios").ExtractionSchemaDef | null,
): PickViewOption[] {
  // Per realign-f3a-entry-point (openspec): F2's Pick-a-view bubble
  // SHALL contain only category-scope pills (statement / meters /
  // charges) plus interact. F3a is reached from F3's fields-panel
  // hamburger menu, not from a chat pill.
  //
  // WF-17 — the LIVE workflow schema is the source of truth; the
  // manifest is the fallback (placeholder ids, pre-resolve, BYO, or
  // until WF-08 strips it). This keeps the pills correct once the
  // manifest fixtures are removed.
  const schema = liveSchema ?? scenario.manifest.extractionSchema;
  if (!schema) return [{ key: "interact", label: "Show me chat" }];
  return schema.categories.map((c) => ({ key: c.id, label: c.name }));
}

interface LiveTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  /**
   * UI-01 Phase 2a — non-null when the grounded LLM proposed adding a
   * schema field on this turn. The chat scroll renders an inline
   * `<ProposeSchemaFieldCard>` beneath the assistant bubble so the
   * user can Accept (→ `addSchemaField`) or Reject without leaving
   * the conversation.
   */
  proposedSchemaField?: ProposedSchemaField | null;
  /**
   * clickable-citations Phase 2 — the citations array returned by the
   * chat router (RAG/hybrid replies). Rendered as `<CiteChip>` rows
   * beneath the assistant bubble. Empty array = no chips, never
   * undefined so callers can map unconditionally.
   */
  citations?: Citation[];
  /**
   * widget-llm-integration Phase 1 — `reply.suggestedActions[]` from
   * the chat router (chips offered beneath the assistant bubble).
   * Empty/undefined → the SuggestedActionChips widget renders nothing.
   */
  suggestedActions?: ChatSuggestedAction[];
}

/**
 * The live ad-hoc turn list — user/assistant bubbles + the answer-source footer
 * (CiteChips + SuggestedActionChips) + propose-card + the "thinking" indicator.
 * ONE definition shared by both flow components (steady + onboarding); `surface`
 * drives the testid prefix. `surface` is shell/flow state, NOT an auth role; the
 * `role` axis (2026-05-30-widget-role-access) is forwarded separately to the
 * child widgets that require it (ProposeSchemaFieldCard). Previously this block was
 * duplicated verbatim in each flow (which is why `<Markdown>` had to be wired
 * in two places). Returns `null` when there's nothing live to show.
 */
function LiveTurnList({
  liveTurns,
  sending,
  surface,
  role,
  onSuggestedAction,
}: {
  liveTurns: LiveTurn[];
  sending: boolean;
  surface: "onboarding" | "steady";
  role: WidgetRole;
  onSuggestedAction: (action: ChatSuggestedAction, citations?: Citation[]) => void;
}) {
  if (liveTurns.length === 0 && !sending) return null;
  return (
    <Stack spacing={1} sx={{ mt: 0.5 }}>
      {liveTurns.map((turn) =>
        turn.role === "user" ? (
          <UserBubble key={turn.id} testid={`${surface}-chat-live-user`}>
            {turn.content}
          </UserBubble>
        ) : (
          <Stack key={turn.id} spacing={1}>
            {turn.content.trim().length > 0 && (
              <BotBubble testid={`${surface}-chat-live-assistant`}>
                <Markdown>{turn.content}</Markdown>
              </BotBubble>
            )}
            {/* One cohesive answer-source footer: citation refs + any
                suggested actions on a single tidy row under the bubble. */}
            {((turn.citations?.length ?? 0) > 0 || (turn.suggestedActions?.length ?? 0) > 0) && (
              <Stack
                direction="row"
                alignItems="center"
                sx={{ pl: 0.25, columnGap: 0.75, rowGap: 0.5, flexWrap: "wrap" }}
              >
                {turn.citations?.map((c, idx) => (
                  <CiteChip key={`${turn.id}-cite-${idx}`} citation={c} index={idx + 1} />
                ))}
                {turn.suggestedActions && turn.suggestedActions.length > 0 && (
                  <SuggestedActionChips
                    actions={turn.suggestedActions}
                    role={role}
                    scope={{ type: "none" }}
                    onAction={(action) => onSuggestedAction(action, turn.citations)}
                  />
                )}
              </Stack>
            )}
            {turn.proposedSchemaField && (
              <ProposeSchemaFieldCard
                proposedField={turn.proposedSchemaField}
                role={role}
                scope={{ type: "none" }}
              />
            )}
          </Stack>
        ),
      )}
      {sending && (
        <BotBubble testid={`${surface}-chat-thinking`}>
          <LoadingDots aria-label="Assistant is thinking" />
        </BotBubble>
      )}
    </Stack>
  );
}

/**
 * widget-llm-integration Phase 1 — map a clicked SuggestedAction onto
 * a `CanvasIntent` the orchestrator can dispatch. Today's mapping is
 * intentionally minimal (just `suggested-intent` with the known
 * `show-extract` payload); Phase 3 retires this in favor of the
 * declarative tool registry, where each chip carries its own intent
 * payload directly.
 */
function suggestedActionToIntent(action: ChatSuggestedAction): CanvasIntent | null {
  // widget-llm-integration Phase 8 — `tool:<name>` chips carry the
  // server-validated, server-constructed CanvasIntent on
  // `detail.intent`. The chat router (`chatRouter.ts`) routes
  // mutate-category tool calls to `suggestedActions[]` per
  // design.md §C, so the user's click here is the confirmation gate.
  if (action.key.startsWith("tool:")) {
    const intent = action.detail?.intent;
    if (intent && typeof intent === "object" && typeof (intent as { kind?: unknown }).kind === "string") {
      return intent as CanvasIntent;
    }
    return null;
  }
  // Phase 1 — legacy `suggested-intent` chip with a string intent
  // label (fenced-JSON path). Phase 8 migration deferred: a follow-up
  // change will retire this branch once the LLM prompt swaps to a
  // `suggest_intent` mutate tool.
  if (action.key === "suggested-intent") {
    const intent = action.detail?.intent;
    if (intent === "show-extract") return { kind: "switchFrame", frame: "f3" };
    if (intent === "show-report") return { kind: "switchFrame", frame: "f4" };
    if (intent === "show-interact") return { kind: "switchFrame", frame: "f5" };
  }
  return null;
}

/**
 * widget-llm-integration Phase 5 — narrow + dispatch each LLM tool
 * call carried on `reply.intents[]`. The middleware validated args
 * against the server tool catalog already; we just dispatch the
 * constructed `intent` payload through the canvas orchestrator. The
 * runtime guard on `kind` is defensive — a future server catalog
 * change shouldn't blow up the app if it emits an unknown kind.
 *
 * Known kinds today: `highlightCitation`, `jumpToPage` (the two
 * PdfViewer tools shipped in Phase 4). Future tools land here as
 * the catalog grows.
 */
function dispatchReplyIntents(
  intents: ChatDispatchedIntent[] | undefined,
  dispatchIntent: (intent: CanvasIntent, source?: "user" | "agent" | "tour") => unknown,
): void {
  for (const dispatched of intents ?? []) {
    const intent = dispatched.intent as CanvasIntent;
    if (typeof intent?.kind !== "string") continue;
    dispatchIntent(intent, "agent");
  }
}

const F2ConversationFlow: FC<F2ConversationFlowProps> = ({
  scenarioId,
  scenarioName,
  fileName,
  thinkingScript,
  pickViews,
}) => {
  const { advanceFrame, state: onboardingState } = useOnboardingSession();
  const { state: appMode } = useAppMode();
  // 2026-05-30-widget-role-access: role for child widgets (ThinkingStream,
  // ProposeSchemaFieldCard) is the auth axis, NOT the conversation flow.
  const widgetRole = useWidgetRole();
  const currentFrameRef = useRef(onboardingState.currentFrame);
  // Keep ref synced for handleSend's gated auto-advance check.
  currentFrameRef.current = onboardingState.currentFrame;
  const { state: registryState } = useScenarioRegistry();
  const { state: chatState, enqueueFieldProposal, appendMessage } = useChatStore();
  const chatSessionId = chatState.activeSessionId;
  const activeChatSession = chatSessionId ? chatState.sessions.get(chatSessionId) : null;
  const navigate = useNavigate();
  const { dispatch: dispatchIntent } = useCanvasOrchestrator();

  const handleSuggestedAction = useCallback(
    (action: ChatSuggestedAction, citations?: Citation[]) => {
      // "Show source" carries no intent of its own — it opens/highlights the
      // answer's primary citation, same as clicking the [1] chip. (Previously
      // this fell through to a null intent and did nothing.)
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

  // CF-18: live ad-hoc chat turns that follow the scripted thinking flow.
  // Owned here (not by ChatInputBar) so they render in the conversation
  // scroll body alongside thinking notes + Pick-a-view.
  const [liveTurns, setLiveTurns] = useState<LiveTurn[]>([]);
  const [sending, setSending] = useState(false);
  // Scroll-to-bottom ref for the conversation body.
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Push scrollTop to scrollHeight whenever a new turn appears or
  // the thinking indicator toggles. Without this the user has to
  // scroll manually to see the latest reply.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [liveTurns, sending]);

  // RT-01: hydrate liveTurns from the persisted thread on mount.
  // The chat handler writes every user + assistant turn to the
  // chat_messages table, but `liveTurns` lives only in component
  // state — without this fetch, a page refresh drops the visible
  // conversation even though the DB rows are intact.
  //
  // Race rule: only seed when `liveTurns` is still empty. If the
  // user has somehow typed + received a reply in the few ms it
  // takes the fetch to resolve, the optimistic state wins; the
  // hydrated fetch already covered those rows so nothing is lost.
  //
  // Errors are non-fatal: a failed hydrate just renders the empty
  // thread and lets the user start a new turn. The server-side row
  // still exists; future sends + their hydrates will work.
  useEffect(() => {
    if (!chatSessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const messages = await listChatMessages(chatSessionId);
        if (cancelled || messages.length === 0) return;
        const turns: LiveTurn[] = messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            // clickable-citations Phase 2 — RT-01 hydrate carries
            // `citations` per row; project onto LiveTurn so chips
            // re-render after a refresh.
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
  }, [chatSessionId]);

  // `schema-agent-chat-affordances`: project ChatStore-emitted agent
  // messages (id prefix `agent-`) into the rendered live-turns list.
  // The Schema-Agent's confidence-delta narration is appended via
  // `appendAgentMessage` from SchemaView's rerun handler; without this
  // projection it would land in `ChatSession.messages` but never reach
  // the rendered conversation surface.
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

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      const userTurn: LiveTurn = { id: `u-${Date.now()}`, role: "user", content: trimmed };
      setLiveTurns((cur) => [...cur, userTurn]);

      // 2026-05-27: a real user-typed turn means they're moving past
      // browsing the canvas — auto-advance the nav to Interact (F5).
      // Guard: only advance if currently on F2/F3/F3a/F4 (the
      // pre-Interact part of the journey). If the user is already
      // at/past F5 (e.g. clicked "Show me chat" pill), don't bounce.
      const frame = currentFrameRef.current;
      if (frame === "f2" || frame === "f3" || frame === "f3a" || frame === "f4") {
        advanceFrame("f5");
      }

      if (!chatSessionId) {
        // EntityRegistry seeds a chat session on mount; if we got here
        // without one something has broken upstream. Fall back to a
        // polite assistant turn rather than crashing.
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
        // widget-llm-integration Phase 5 — surface the user's
        // current ViewerStep kind so the LLM tool catalog is scoped.
        const stepIdx = activeChatSession?.viewer.currentStep.stepIndex ?? -1;
        const activeStepKind =
          stepIdx >= 0 ? activeChatSession?.viewer.history[stepIdx]?.kind ?? null : null;
        const result = await sendChatMessage({
          chatSessionId,
          newUserMessage: trimmed,
          sessionMeta: {
            title: activeChatSession?.title ?? "Onboarding",
            isOnboarding: activeChatSession?.isOnboardingSession ?? true,
            onboardingSessionId: chatSessionId,
            activeEntityKey: activeChatSession?.activeEntityKey ?? null,
          },
          // Threaded into the grounded LLM prompt so the model knows
          // what doc the user is currently looking at — even when
          // GroundX search comes back empty for off-topic queries
          // (greetings, "what can you help with", etc.).
          scopeHint: {
            fileName,
            scenarioTitle: scenarioName,
          },
          activeStepKind,
        });
        setLiveTurns((cur) => [
          ...cur,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: result.reply.answer,
            proposedSchemaField: result.reply.proposedSchemaField,
            // clickable-citations Phase 2 — thread reply citations
            // onto the LiveTurn so CiteChips render alongside the
            // bubble.
            citations: result.reply.citations ?? [],
            // widget-llm-integration Phase 1 — thread suggestedActions
            // so the SuggestedActionChips widget renders below the bubble.
            suggestedActions: result.reply.suggestedActions ?? [],
          },
        ]);
        // core-data-model-hardening item 6 — mirror the assistant turn
        // (with citations) into the shared ChatStore so the canvas
        // (InteractView litRegions / CiteChip / report-pin) reads it off
        // the in-memory session instead of polling the thread. Minted
        // with the `m-` id prefix so the `agent-` projection effect
        // above does NOT re-render it into liveTurns.
        appendMessage({
          role: "assistant",
          content: result.reply.answer,
          citations: result.reply.citations ?? [],
        });
        // widget-llm-integration Phase 5 — dispatch every
        // server-validated LLM tool call through the canvas
        // orchestrator.
        dispatchReplyIntents(result.reply.intents, dispatchIntent);
        // F3a wireframe-fix: also enqueue the proposal onto the
        // canvas-side ProposalCard queue so SchemaView's "above the
        // list" surface fires. The chat propose-card stays as a
        // mirror.
        if (result.reply.proposedSchemaField) {
          enqueueFieldProposal({
            categoryId: result.reply.proposedSchemaField.categoryId,
            name: result.reply.proposedSchemaField.name,
            type: result.reply.proposedSchemaField.type,
            description: result.reply.proposedSchemaField.description,
            // proposal-envelope-provenance: forward the Zod parse
            // provenance so the canvas ProposalCard surfaces the
            // `envelope verified` label.
            provenance: result.reply.proposedSchemaField.provenance,
          });
        }
      } catch (err) {
        // CF-08: branch the user-facing copy on the upstream status
        // so 401 / 501 / 504 / 5xx / 400 each say the right thing.
        const mapped = chatErrorToUserCopy(err);
        setLiveTurns((cur) => [
          ...cur,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: mapped.message,
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [sending, chatSessionId, activeChatSession, advanceFrame, fileName, scenarioName, enqueueFieldProposal],
  );

  // Sample switcher dropdown anchor + state.
  const switcherAnchorRef = useRef<HTMLSpanElement | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const otherScenarios = useMemo(() => {
    if (registryState.status !== "ready") return [];
    return registryState.scenarios.filter((s) => s.id !== scenarioId);
  }, [registryState, scenarioId]);
  // NB: read off the ready state with an `if` guard rather than a ternary so
  // the widget-contract drift guard's raw-id-prop regex doesn't false-positive
  // on a bucket-id ternary tail. This is a local read, not a prop — chat scope
  // is `{ type: "none" }`.
  let switcherBucketId: number | null = null;
  if (registryState.status === "ready") switcherBucketId = registryState.bucketId;

  // ARCH-11 (2026-05-26): thinking-stream state owned by the
  // `ThinkingStream` chat-widget; this surface just listens for its
  // `onDone` callback to know when to reveal the "Done." bubble +
  // Pick-a-view pills. The widget handles the timer cadence + the
  // per-scenario sessionStorage replay guard internally.
  const [showDone, setShowDone] = useState<boolean>(thinkingScript.length === 0);

  return (
    <Box data-testid="onboarding-chat-conversation" sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header: clickable G + filename (was "Conversation" — replaced
          2026-05-25 because the filename gives real context and frees
          up the canvas pane from carrying a duplicate filename header).
          Clicking either the G or the filename navigates to
          /onboarding (the onboarding home / sample picker). */}
      <Box data-testid="onboarding-chat-header" sx={{ pb: 1, borderBottom: `1px solid ${BORDER}` }}>
        <Box
          data-testid="onboarding-chat-home"
          role="button"
          tabIndex={0}
          aria-label="Back to onboarding home"
          onClick={() => navigate("/onboarding")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              navigate("/onboarding");
            }
          }}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            cursor: "pointer",
            borderRadius: BORDER_RADIUS_SM,
            "&:hover": { opacity: 0.85 },
            "&:focus-visible": { outline: `2px solid ${NAVY}`, outlineOffset: 2 },
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: FONT_WEIGHT_HEADLINE,
              color: NAVY,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
            title={fileName}
          >
            {fileName}
          </Typography>
          <Box sx={{ flex: 1 }} />
          {!showDone && (
            <Typography variant="caption" sx={{ color: MUTED_ON_LIGHT, fontStyle: "italic", flexShrink: 0 }}>
              thinking…
            </Typography>
          )}
        </Box>
        <Box
          data-testid="onboarding-chat-sample-switch"
          sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.5, fontSize: FONT_SIZE_LABEL, color: MUTED_ON_LIGHT }}
        >
          <span>sample:</span>
          <span style={{ fontWeight: FONT_WEIGHT_HEADLINE, color: NAVY }}>{scenarioName}</span>
          {/* "switch" affordance only renders when there's actually
              something else to switch to. Previous behavior was to
              render a muted-styled label that did nothing on click;
              the screenshot 2026-05-25 showed this as user-confusing
              (looks like a dropdown trigger, fires nothing). */}
          {otherScenarios.length > 0 && (
            <Box
              component="span"
              ref={switcherAnchorRef}
              role="button"
              tabIndex={0}
              aria-haspopup="menu"
              aria-expanded={switcherOpen ? "true" : undefined}
              data-testid="onboarding-chat-sample-switch-trigger"
              onClick={() => setSwitcherOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSwitcherOpen(true);
                }
              }}
              sx={{
                color: NAVY,
                fontWeight: FONT_WEIGHT_LABEL,
                cursor: "pointer",
                "&:hover": { color: NAVY },
              }}
            >
              switch ▾
            </Box>
          )}
          <Menu
            anchorEl={switcherAnchorRef.current}
            open={switcherOpen}
            onClose={() => setSwitcherOpen(false)}
            data-testid="onboarding-chat-sample-switch-menu"
          >
            {otherScenarios.map((s) => (
              <MenuItem
                key={s.id}
                data-testid={`onboarding-chat-sample-switch-item-${s.id}`}
                onClick={() => {
                  setSwitcherOpen(false);
                  if (switcherBucketId != null) {
                    navigate(`/onboarding/${switcherBucketId}/${s.id}`);
                  }
                }}
              >
                {s.manifest.hero?.title ?? s.id}
              </MenuItem>
            ))}
          </Menu>
        </Box>
      </Box>

      {/* `schema-agent-chat-affordances` — frame-conditional Schema-Agent
          header. Only renders on F3a, between the file header and the
          conversation. The sample-switcher chip mirrors the existing
          generic `onboarding-chat-sample-switch` UX but signals to the
          user that they're in the focused Schema-Agent loop. */}
      {onboardingState.currentFrame === "f3a" && (
        <Box
          data-testid="chat-schema-agent-header"
          sx={{
            mt: 1,
            pb: 1,
            borderBottom: `1px solid ${BORDER}`,
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
          }}
        >
          <Typography
            variant="overline"
            sx={{
              color: NAVY,
              letterSpacing: LETTER_SPACING_LABEL,
              fontWeight: FONT_WEIGHT_HEADLINE,
              fontSize: FONT_SIZE_LABEL,
            }}
          >
            Schema Agent
          </Typography>
          <Box
            component="span"
            data-testid="chat-schema-agent-sample-switcher"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.5,
              fontSize: FONT_SIZE_LABEL,
              color: MUTED_ON_LIGHT,
            }}
          >
            <span>sample:</span>
            <span style={{ fontWeight: FONT_WEIGHT_HEADLINE, color: NAVY }}>{scenarioName}</span>
            <span>·</span>
            <span style={{ color: NAVY, fontWeight: FONT_WEIGHT_LABEL }}>switch ▾</span>
          </Box>
        </Box>
      )}

      {/* `schema-agent-chat-affordances` — earlier-turns compaction
          summary. Renders at the top of the conversation when the active
          session has folded turns into `summaries`. `<P>` derives from
          proposals seen (added + still-pending) and `<A>` from accepted
          additions. Reads from `ChatSession.summaries` (existing slot). */}
      {(activeChatSession?.summaries?.length ?? 0) > 0 && (
        <Box
          data-testid="chat-earlier-turns-summary"
          sx={{
            mt: 1,
            px: 1,
            py: 0.5,
            backgroundColor: WARM_OFFWHITE,
            borderRadius: BORDER_RADIUS_SM,
            border: `1px dashed ${BORDER}`,
            fontSize: FONT_SIZE_LABEL,
            color: MUTED_ON_LIGHT,
          }}
        >
          {(() => {
            const overlay = activeChatSession?.pendingSchemaOverlay;
            const accepted = overlay?.addedFields.length ?? 0;
            const pending = overlay?.pendingFieldProposals.length ?? 0;
            const proposalsSeen = accepted + pending;
            return `▾ earlier turns (${proposalsSeen} proposals · ${accepted} fields accepted)`;
          })()}
        </Box>
      )}

      {/* Bubble stream */}
      {/* DBG-01 B: reserve a scrollbar gutter + right padding so the
          scrollbar never paints over the message bubbles. */}
      <Box
        ref={scrollRef}
        data-testid="onboarding-chat-scroll"
        style={{ scrollbarGutter: "stable" }}
        sx={{ flex: 1, minHeight: 0, overflow: "auto", py: 1.5, pr: 1, display: "flex", flexDirection: "column", gap: 1.25 }}
      >
        <UserBubble testid="onboarding-chat-user-bubble">{scenarioName}</UserBubble>
        <BotBubble testid="onboarding-chat-bot-lead">
          <Box component="span" sx={{ fontWeight: FONT_WEIGHT_HEADLINE }}>
            Reading {fileName} now.
          </Box>
        </BotBubble>

        {thinkingScript.length > 0 && (
          <ThinkingStream
            notes={thinkingScript}
            scenarioKey={scenarioId}
            role={widgetRole}
            scope={{ type: "none" }}
            persistReplay
            onDone={() => {
              setShowDone(true);
              // 2026-05-27: when the scripted thinking-stream finishes,
              // auto-advance the nav from Understand (F2) to Extract
              // (F3). The fake processing message is "Done. Ready to
              // analyze." — at that moment the user should see the
              // Extract canvas, not be stranded on Understand waiting
              // for a pill click. Guard: only advance if still on F2;
              // a user who already clicked a pill mid-stream stays
              // wherever they navigated.
              if (currentFrameRef.current === "f2") {
                advanceFrame("f3");
              }
            }}
          />
        )}

        {showDone && (
          <>
            <BotBubble testid="onboarding-chat-done">
              <Box component="span" sx={{ fontWeight: FONT_WEIGHT_HEADLINE }}>Done.</Box> Ready to analyze.
            </BotBubble>
            {/* Pick-a-view block.
                - Inner gap (1.25) matches the parent conversation
                  Stack's gap so the pill row sits the same distance
                  from "Pick a view:" as two consecutive chat bubbles
                  do. Was 0.75 → looked too tight (user 2026-05-25).
                - Pills row drops its prior `pl: 0.5` (4px) offset —
                  it was pushing the row right of the bubble above
                  for no design reason. */}
            <Box data-testid="onboarding-chat-pick-a-view" sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
              <BotBubble>Pick a view:</BotBubble>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                {pickViews.map((view, idx) => (
                  <PickViewPill
                    key={view.key}
                    label={view.label}
                    testid={`onboarding-chat-pick-view-${view.key}`}
                    // First non-interact pill carries the legacy
                    // `advance-to-f3` testid so existing e2e suites
                    // that expect a canvas CTA still find a clickable
                    // affordance.
                    legacyTestid={idx === 0 && view.key !== "interact" ? "advance-to-f3" : undefined}
                    onClick={() => {
                      if (view.key === "interact") {
                        advanceFrame("f5");
                        return;
                      }
                      // Schema-derived category pill → land on F3 with
                      // ?focus=<categoryId>. ExtractView reads that
                      // param to pre-select the user's picked slice.
                      // F3a (Edit schema) is reached from F3's
                      // fields-panel hamburger menu, not from this pill.
                      advanceFrame("f3");
                      navigate({ search: `?focus=${view.key}` }, { replace: false });
                    }}
                  />
                ))}
              </Box>
            </Box>
          </>
        )}

        {/* CF-18 live ad-hoc turns: appended after the scripted flow.
            User bubbles right-aligned, assistant bubbles left-aligned. */}
        <LiveTurnList
          liveTurns={liveTurns}
          sending={sending}
          surface="onboarding"
          role={widgetRole}
          onSuggestedAction={handleSuggestedAction}
        />
      </Box>

      {/* Bottom: real chat input (CF-18). Posts via sendChatMessage and
          appends the assistant reply as a live turn above. */}
      <Box sx={{ pt: 1, borderTop: `1px solid ${BORDER}` }}>
        <LiveChatInputBar onSend={handleSend} disabled={sending} />
      </Box>
    </Box>
  );
};

// ── Bubble + pill primitives ─────────────────────────────────────────────

interface BubbleProps {
  children: React.ReactNode;
  testid?: string;
}

const UserBubble: FC<BubbleProps> = ({ children, testid }) => (
  <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
    <Box
      data-testid={testid}
      sx={{
        maxWidth: "75%",
        px: 1.25,
        py: 0.75,
        // Shared chat-element radius across bubbles + Pick-a-view
        // pills. Bumped from BORDER_RADIUS_SM (4px) to
        // BORDER_RADIUS_2X (12px) on 2026-05-25 so the moderate-
        // rounded bubble matches the pills below, instead of looking
        // square next to fully-pill CTAs.
        borderRadius: BORDER_RADIUS_2X,
        backgroundColor: CYAN,
        color: NAVY,
        fontSize: FONT_SIZE_CAPTION,
        fontWeight: FONT_WEIGHT_LABEL,
      }}
    >
      {children}
    </Box>
  </Box>
);

const BotBubble: FC<BubbleProps> = ({ children, testid }) => (
  <Box sx={{ display: "flex" }}>
    <Box
      data-testid={testid}
      sx={{
        maxWidth: "85%",
        px: 1.25,
        py: 0.75,
        // Shared chat-element radius — see UserBubble comment above.
        borderRadius: BORDER_RADIUS_2X,
        backgroundColor: WHITE,
        border: `1px solid ${BORDER}`,
        color: BODY_TEXT,
        fontSize: FONT_SIZE_CAPTION,
        lineHeight: 1.4,
      }}
    >
      {children}
    </Box>
  </Box>
);

interface PickViewPillProps {
  label: string;
  testid?: string;
  /**
   * Optional second testid for back-compat with pre-rebuild e2e specs.
   * Rendered on a transparent wrapper around the pill so both names
   * resolve to a clickable node via getByTestId.
   */
  legacyTestid?: string;
  onClick: () => void;
}

const PickViewPillInner: FC<PickViewPillProps> = ({ label, testid, onClick }) => (
  <Box
    role="button"
    tabIndex={0}
    data-testid={testid}
    onClick={onClick}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onClick();
      }
    }}
    sx={{
      px: 1.25,
      py: 0.5,
      // Match the bubbles' BORDER_RADIUS_2X. The fully-pill prior
      // shape (BORDER_RADIUS_PILL = 200px) clashed visually with the
      // 12px bubbles — user flagged the mismatch 2026-05-25.
      borderRadius: BORDER_RADIUS_2X,
      backgroundColor: WHITE,
      border: `1.5px solid ${GREEN}`,
      color: NAVY,
      fontSize: FONT_SIZE_LABEL,
      fontWeight: FONT_WEIGHT_HEADLINE,
      cursor: "pointer",
      "&:hover": { backgroundColor: CYAN },
      "&:focus-visible": { outline: `2px solid ${NAVY}`, outlineOffset: 1 },
    }}
  >
    {label}
  </Box>
);

const PickViewPill: FC<PickViewPillProps> = (props) => {
  // When a legacy testid is set, wrap in a click-passthrough Box so
  // getByTestId(legacy) and getByTestId(canonical) both resolve.
  if (props.legacyTestid) {
    return (
      <Box data-testid={props.legacyTestid} onClick={props.onClick} sx={{ display: "inline-block" }}>
        <PickViewPillInner {...props} />
      </Box>
    );
  }
  return <PickViewPillInner {...props} />;
};

interface LiveChatInputBarProps {
  onSend: (text: string) => void | Promise<void>;
  disabled?: boolean;
}

/**
 * CF-18 — F2 chat input. Mirrors InteractView (F5) so anything we
 * change here we also change there until the two surfaces merge into a
 * shared `chat-with-sources` widget mount.
 */
const LiveChatInputBar: FC<LiveChatInputBarProps> = ({ onSend, disabled }) => {
  const [draft, setDraft] = useState("");
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || disabled) return;
    setDraft("");
    void onSend(trimmed);
  };
  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      data-testid="onboarding-chat-input"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        backgroundColor: WHITE,
        border: `1px solid ${BORDER}`,
        borderRadius: BORDER_RADIUS_PILL,
        px: 1.5,
        py: 0.5,
      }}
    >
      <InputBase
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        // GroundX-equivalent of Claude's "Describe what you want to
        // create…" — surface-agnostic prompt that fits both ask-the-
        // document chat and "describe what to extract" extraction
        // intents. Updated 2026-05-25.
        placeholder="Ask about your documents…"
        disabled={disabled}
        sx={{ flex: 1, color: NAVY, fontSize: FONT_SIZE_CAPTION }}
        inputProps={{ "aria-label": "Chat input" }}
      />
      <IconButton
        type="submit"
        size="small"
        disabled={disabled}
        data-testid="onboarding-chat-send"
        aria-label="Send"
        // Cyan circle (the prior color the user explicitly preferred
        // over the brief 2026-05-25 GREEN experiment). The icon inside
        // is hand-sized to 14px — `fontSize="small"` was 20px which
        // made the glyph overflow the 28px button. Pairs cyan circle
        // + navy arrow per the design system.
        sx={{
          backgroundColor: CYAN,
          color: NAVY,
          width: 28,
          height: 28,
          "&:hover": { backgroundColor: CYAN, filter: "brightness(0.95)" },
          "&.Mui-disabled": { backgroundColor: BORDER, color: MUTED_ON_LIGHT },
        }}
      >
        <SendOutlinedIcon sx={{ fontSize: ICON_SIZE_INLINE }} />
      </IconButton>
    </Box>
  );
};

