import { act, waitFor } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import { vi } from "vitest";

import type { ChatReply } from "@/api/chatSessions";
import { useCanvasOrchestrator, type CanvasIntent } from "@/contexts/CanvasOrchestratorContext";
import { useChatStore } from "@/contexts/ChatStoreContext";
import { useOnboardingSessionOptional } from "@/contexts/OnboardingSessionContext";
import { useConversation } from "@/conversation/useConversation";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";
import type { CanvasIntentKind } from "@groundx/shared/intent-catalog";

import type { HarnessState, IntentFixture, OverlayView, ScriptContext } from "./types";

/**
 * Replay engine (TEST-ONLY). Fires a fixture's trigger through the REAL
 * derivation → orchestrator → sink pipeline with the LLM mocked, then waits for
 * the fixture's `assert` to hold against the resulting sink state. Zero LLM.
 */

function makeSendResult(reply: ChatReply) {
  return { userMessageId: "u-replay", assistantMessageId: "a-replay", compressionRan: false, reply };
}

// Minimal structural views of the ChatStore overlays we read.
interface OverlayShape {
  pendingFieldProposals: ReadonlyArray<unknown>;
  addedFields: ReadonlyArray<unknown>;
  editedFields: ReadonlyMap<string, unknown>;
  removedFieldIds: ReadonlySet<string>;
}
function overlayView(o: OverlayShape | undefined): OverlayView {
  return {
    pendingProposals: o?.pendingFieldProposals.length ?? 0,
    addedFields: o?.addedFields.length ?? 0,
    editedIds: o ? [...o.editedFields.keys()] : [],
    removedIds: o ? [...o.removedFieldIds] : [],
  };
}

interface ProbeRefs {
  stateRef: { current: HarnessState };
  actionsRef: {
    current: {
      sessionId: string | null;
      dispatch: (intent: CanvasIntent, source: "user" | "agent" | "tour") => void;
      send: (text: string) => Promise<void>;
      getSession: () => unknown;
    } | null;
  };
  spyKind: CanvasIntentKind;
}

const EMPTY_OVERLAY: OverlayView = { pendingProposals: 0, addedFields: 0, editedIds: [], removedIds: [] };

function HarnessProbe({ stateRef, actionsRef, spyKind }: ProbeRefs) {
  const { state } = useChatStore();
  const { dispatch, registerAdapter } = useCanvasOrchestrator();
  const onboarding = useOnboardingSessionOptional();
  const sessionId = state.activeSessionId;
  const conv = useConversation(sessionId);
  const [capturedKind, setCapturedKind] = useState<string | null>(null);

  // Register a spy adapter for the fixture's kind so adapter-routed intents
  // (showSample, openDocument, wizard*, …) have an observable sink. Harmless
  // for built-in kinds (the adapter fires after the built-in side effect).
  useEffect(() => {
    const unregister = registerAdapter({
      kind: spyKind,
      apply: (intent: CanvasIntent) => setCapturedKind(intent.kind),
    });
    return unregister;
  }, [registerAdapter, spyKind]);

  const session = sessionId ? state.sessions.get(sessionId) : null;
  const idx = session?.viewer.currentStep.stepIndex ?? -1;
  const top = idx >= 0 ? session?.viewer.history[idx] : null;
  const sessionUnknown = session as unknown as
    | { pendingSchemaOverlay?: OverlayShape; reportOverlay?: OverlayShape }
    | null;

  stateRef.current = {
    docViewerStep:
      top && top.kind === "doc-viewer"
        ? {
            documentId: top.documentId,
            page: top.page,
            hasHighlight: Boolean(top.highlight),
            hasBbox: Boolean(top.highlight?.bbox),
            litRegionCount: top.litRegions?.length ?? 0,
          }
        : null,
    frame: onboarding?.state.currentFrame ?? null,
    gateStatus: onboarding?.state.gate?.status ?? null,
    schemaOverlay: sessionUnknown ? overlayView(sessionUnknown.pendingSchemaOverlay) : EMPTY_OVERLAY,
    reportOverlay: sessionUnknown ? overlayView(sessionUnknown.reportOverlay) : EMPTY_OVERLAY,
    bookCallActive:
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("bookCall") === "1",
    adapterCapturedKind: capturedKind,
  };
  actionsRef.current = {
    sessionId,
    dispatch,
    send: (t) => conv.send(t),
    getSession: () => session ?? null,
  };

  return <div data-testid="harness-session">{sessionId ?? "none"}</div>;
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function replayIntentFixture(fixture: IntentFixture): Promise<void> {
  const stateRef: ProbeRefs["stateRef"] = {
    current: {
      docViewerStep: null,
      frame: null,
      gateStatus: null,
      schemaOverlay: EMPTY_OVERLAY,
      reportOverlay: EMPTY_OVERLAY,
      bookCallActive: false,
      adapterCapturedKind: null,
    },
  };
  const actionsRef: ProbeRefs["actionsRef"] = { current: null };

  // Reset the `bookCall` URL param so a prior openBookCall fixture doesn't leak
  // a true reading into this one (window.location is global across fixtures).
  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    url.searchParams.delete("bookCall");
    window.history.replaceState({}, "", url.toString());
  }

  const sendChatMessage = vi.fn();
  if (fixture.trigger.via === "reply") {
    sendChatMessage.mockResolvedValue(makeSendResult(fixture.trigger.reply));
  }

  renderWithOnboardingProviders(
    <HarnessProbe stateRef={stateRef} actionsRef={actionsRef} spyKind={fixture.kind} />,
    { initialFrame: "f5", initialScenario: "utility", api: { chat: { sendChatMessage } } },
  );

  await waitFor(() => {
    if (!actionsRef.current?.sessionId) throw new Error("no active chat session yet");
  });

  const trigger = fixture.trigger;
  if (trigger.via === "script") {
    // Script triggers do multi-step seed→mutate work and must READ committed
    // state between steps. Each dispatch/flush is its OWN act() (not a single
    // outer act) so React commits the re-render before the next read.
    const ctx: ScriptContext = {
      dispatch: (intent, source) => {
        act(() => {
          actionsRef.current!.dispatch(intent, source);
        });
      },
      getSession: () => actionsRef.current!.getSession(),
      flush: () =>
        act(async () => {
          await flush();
        }),
    };
    await trigger.run(ctx);
  } else {
    await act(async () => {
      if (trigger.via === "reply") {
        await actionsRef.current!.send("replay this intent");
      } else {
        actionsRef.current!.dispatch(trigger.intent, trigger.source);
      }
    });
  }

  await waitFor(() => fixture.assert(stateRef.current));
}
