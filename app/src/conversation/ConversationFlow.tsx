/**
 * 2026-05-30-unified-conversation-flow Phase 2 — the SINGLE chat view.
 *
 * There is NO `mode` and NO entry-context. With no `experience` you get the
 * bare chat (what used to be "steady"): the live-turn list + the input bar
 * over the durable `useConversation` engine. An OPTIONAL `experience` layers
 * a scripted `Intro` (above the thread), a one-shot `seedTurns`, an
 * `onFirstUserSend` lifecycle hook, and a render-null `Choreography` director
 * — none of which the engine knows about.
 *
 * `Intro`/`Choreography` are rendered as COMPONENTS (never called as hooks),
 * so the layer is Rules-of-Hooks-safe when the experience is absent.
 */
import Box from "@mui/material/Box";
import { useEffect, useRef, type FC } from "react";

import { useWidgetRole } from "@/lib/widgetRole";

import type { ChatExperience } from "./ChatExperience";
import { LiveChatInputBar, LiveTurnList } from "./chatPrimitives";
import { BORDER } from "@/constants";
import { useConversation } from "./useConversation";

export interface ConversationFlowProps {
  chatSessionId: string | null;
  /**
   * OPTIONAL directed experience. Absent → the bare chat. The presence/shape
   * of this is the ONLY thing that varies behavior — there is no `mode`.
   */
  experience?: ChatExperience;
}

export const ConversationFlow: FC<ConversationFlowProps> = ({ chatSessionId, experience }) => {
  // `role` is the auth axis (2026-05-30-widget-role-access) forwarded to the
  // child widgets that require it — NEVER a flow surface.
  const role = useWidgetRole();

  // The engine's `onFirstUserSend` fires once per hook instance; route it to
  // the experience's convenience hook. (The experience's `Choreography` may
  // also observe lifecycle directly; both paths fire at the same moment.)
  const conversation = useConversation(chatSessionId, {
    onFirstUserSend: () => experience?.onFirstUserSend?.(),
    // Forward the experience's grounding inputs verbatim. The onboarding
    // experience supplies a scopeHint (scenario file/title) so the grounded
    // LLM can answer/redirect off-topic queries even when GroundX returns 0
    // snippets; a bare chat supplies neither.
    ...(experience?.scopeHint ? { scopeHint: experience.scopeHint } : {}),
    ...(experience?.title ? { title: experience.title } : {}),
  });
  const { liveTurns, sending, send, handleSuggestedAction, seedTurns } = conversation;

  // Seed the experience's one-shot turns exactly once on mount.
  const seededRef = useRef(false);
  const seedFnRef = useRef(experience?.seedTurns);
  seedFnRef.current = experience?.seedTurns;
  useEffect(() => {
    if (seededRef.current) return;
    const seeds = seedFnRef.current?.();
    if (seeds && seeds.length > 0) {
      seededRef.current = true;
      seedTurns(seeds);
    }
  }, [seedTurns]);

  // Scroll the conversation body to the newest message on each turn / when
  // the thinking indicator toggles.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [liveTurns, sending]);

  const Intro = experience?.Intro;
  const Choreography = experience?.Choreography;

  return (
    <Box
      data-testid="conversation-flow"
      sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}
    >
      <Box
        ref={scrollRef}
        data-testid="chat-live-scroll"
        style={{ scrollbarGutter: "stable" }}
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          py: 1.5,
          pr: 1,
          display: "flex",
          flexDirection: "column",
          gap: 1.25,
        }}
      >
        {Intro && (
          <Box data-testid="conversation-intro">
            <Intro conversation={conversation} />
          </Box>
        )}
        <LiveTurnList
          liveTurns={liveTurns}
          sending={sending}
          role={role}
          onSuggestedAction={handleSuggestedAction}
        />
      </Box>
      <Box sx={{ pt: 1, borderTop: `1px solid ${BORDER}` }}>
        <LiveChatInputBar onSend={send} disabled={sending} />
      </Box>
      {/* Render-null director — observes engine lifecycle, fires side-effects
          (e.g. onboarding frame advances). Mounted last so the chat renders
          regardless. */}
      {Choreography && <Choreography conversation={conversation} />}
    </Box>
  );
};
