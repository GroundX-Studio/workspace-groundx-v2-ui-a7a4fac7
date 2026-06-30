/**
 * IntentDebugPanel — the intent-firing section of the single dev menu
 * (DebugOverlay). NOT self-gated and NOT floating: DebugOverlay decides when
 * to show it (`?debug=true` + an appropriate screen) and positions it.
 *
 * Lists every FE intent fixture grouped by catalog class with a "Fire" button.
 * Firing **dispatches the fixture's computed intent directly** to the live
 * CanvasOrchestrator (via the SAME exported derivation helpers `useConversation`
 * uses for reply-triggered fixtures) and NEVER routes through
 * `useConversation.send` — so it makes no real LLM call in the running app.
 *
 * Off-brand inline styles (debug hex) → on the `no-hardcoded-styles` allowlist,
 * same rationale as DebugOverlay.
 */

import { useRef, type FC } from "react";

import { intentFixtures } from "@/conversation/intentFixtures/fixtures";
import type { IntentFixture } from "@/conversation/intentFixtures/types";
import {
  citationToHighlightIntent,
  dispatchReplyIntents,
  suggestedActionToIntent,
} from "@/conversation/useConversation";
import { useCanvasOrchestrator } from "@/contexts/CanvasOrchestratorContext";
import { useChatStore } from "@/contexts/ChatStoreContext";
import { intentCatalogEntry, type IntentClass } from "@groundx/shared/intent-catalog";

type Dispatch = ReturnType<typeof useCanvasOrchestrator>["dispatch"];

/**
 * Fire a fixture by dispatching its computed intent(s) — NO network.
 * `getSession`/`flush` let `script` triggers (accept/reject) seed a proposal,
 * wait a tick for the re-render, read its generated id, then mutate — so those
 * fire fully (not just their seed) in the live harness.
 */
function fireFixture(
  fixture: IntentFixture,
  dispatch: Dispatch,
  getSession: () => unknown,
): void {
  const trigger = fixture.trigger;
  if (trigger.via === "dispatch") {
    dispatch(trigger.intent, trigger.source);
    return;
  }
  if (trigger.via === "script") {
    void trigger.run({
      dispatch: (intent, source) => dispatch(intent, source),
      getSession,
      flush: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
    });
    return;
  }
  const { reply } = trigger;
  if (reply.citations[0]) dispatch(citationToHighlightIntent(reply.citations[0]), "user");
  for (const action of reply.suggestedActions) {
    const intent = suggestedActionToIntent(action);
    if (intent) dispatch(intent, "agent");
  }
  dispatchReplyIntents(reply.intents, dispatch);
}

const CLASS_ORDER: IntentClass[] = ["viewer-loading", "ux-interaction"];

export const IntentDebugPanel: FC = () => {
  const { dispatch } = useCanvasOrchestrator();
  // Live read of the active session for `script` triggers. A ref (updated every
  // render) so the onClick reads the LATEST session after a seed dispatch +
  // `flush` re-render — not a stale render-time closure.
  const { state } = useChatStore();
  const sessionRef = useRef<unknown>(null);
  sessionRef.current = state.activeSessionId ? state.sessions.get(state.activeSessionId) ?? null : null;

  return (
    <div
      data-testid="intent-debug-panel"
      style={{
        maxHeight: "60vh",
        overflowY: "auto",
        width: 260,
        padding: "8px 10px",
        background: "#1b1f24",
        color: "#e6edf3",
        border: "1px solid #30363d",
        borderRadius: 6,
        font: "11px/1.5 ui-monospace, Menlo, monospace",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, color: "#d29922" }}>
        FIRE INTENT ({intentFixtures.length})
      </div>
      {CLASS_ORDER.map((cls) => {
        const group = intentFixtures.filter((f) => intentCatalogEntry(f.kind).class === cls);
        if (group.length === 0) return null;
        return (
          <div key={cls} style={{ marginBottom: 8 }}>
            <div style={{ color: "#8b949e", marginBottom: 2 }}>{cls}</div>
            {group.map((fixture) => (
              <button
                key={fixture.kind}
                type="button"
                data-testid={`intent-debug-fire-${fixture.kind}`}
                onClick={() => fireFixture(fixture, dispatch, () => sessionRef.current)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  margin: "2px 0",
                  padding: "3px 6px",
                  background: "#21262d",
                  color: "#e6edf3",
                  border: "1px solid #30363d",
                  borderRadius: 4,
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                ▶ {fixture.kind}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
};
