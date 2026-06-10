import { createContext, useCallback, useContext, useMemo, useRef, useState, type FC, type ReactNode } from "react";

import type { NormalizedBbox } from "@groundx/shared";
import { useApi } from "@/contexts/ApiContext";
import { useChatStoreOptional } from "@/contexts/ChatStoreContext";
import { useOnboardingSessionOptional } from "@/contexts/OnboardingSessionContext";

import type { CanvasAdapter, CanvasIntent, CanvasOrchestratorApi, IntentSource, StampedIntent } from "./types";

const CanvasOrchestratorContext = createContext<CanvasOrchestratorApi | null>(null);

/**
 * Exhaustiveness sentinel for the `dispatch()` switch over `CanvasIntent`.
 *
 * The dispatch switch's `default` arm narrows `intent` to `never` and passes
 * it here. Adding a new `CanvasIntent` kind without a matching `case` leaves
 * `intent` as a non-`never` value in that arm, so this call fails `tsc` with
 * an error naming the unhandled kind — the compile-time drift signal required
 * by the app-architecture spec ("a new intent kind without a handler fails
 * type-checking"). The throw is defensive: it is unreachable in a sound build,
 * but guards against a kind smuggled past the type system at runtime.
 */
export function assertNeverIntent(intent: never): never {
  throw new Error(`unhandled CanvasIntent kind: ${JSON.stringify(intent)}`);
}

interface CanvasOrchestratorProviderProps {
  children: ReactNode;
  /** Override the clock for deterministic testing. */
  now?: () => number;
}

export const CanvasOrchestratorProvider: FC<CanvasOrchestratorProviderProps> = ({ children, now = Date.now }) => {
  const apiClient = useApi();
  const adaptersRef = useRef(new Map<CanvasIntent["kind"], CanvasAdapter>());
  const intentCounterRef = useRef(0);
  const [lastAppliedIntentId, setLastAppliedIntentId] = useState<number | null>(null);
  // UI-10 — opt-in ChatStore wiring. When a `ChatStoreProvider` sits
  // above us in the tree, every dispatch flips currentIntent + appends
  // a viewer event. When no ChatStore is mounted (some standalone
  // tests, embedded canvases outside the session shell) dispatch just
  // works without the side effects — silent fallback.
  const chatStore = useChatStoreOptional();
  // widget-llm-integration follow-up B.2 — soft-optional access
  // to OnboardingSession so the orchestrator can route
  // `commit_gate` / `dismiss_gate` intents through the gate
  // lifecycle. Returns null in the steady tree (no provider);
  // those intents are no-ops there, which matches the design —
  // gate lifecycle is onboarding-only.
  const onboardingSession = useOnboardingSessionOptional();

  const registerAdapter = useCallback(<K extends CanvasIntent["kind"]>(adapter: CanvasAdapter<K>) => {
    // The map's value type is the union-narrowed CanvasAdapter; a specific
    // CanvasAdapter<K> is structurally narrower in its `apply` parameter, so
    // TypeScript can't directly upcast. The `unknown` hop lets us store any
    // kind-specific adapter and recover the right narrowing at dispatch time.
    const erased = adapter as unknown as CanvasAdapter;
    adaptersRef.current.set(adapter.kind, erased);
    return () => {
      const current = adaptersRef.current.get(adapter.kind);
      if (current === erased) {
        adaptersRef.current.delete(adapter.kind);
      }
    };
  }, []);

  const dispatch = useCallback(
    (intent: CanvasIntent, source: IntentSource = "user"): StampedIntent => {
      intentCounterRef.current += 1;
      const stamped: StampedIntent = { intentId: intentCounterRef.current, source, ts: now(), intent };

      // UI-10 — ChatStore triple-write, fired BEFORE the per-kind side
      // effects + the adapter so the active session sees the intent as
      // "current" while downstream handlers run (matters for adapters that
      // re-read ChatStore state mid-apply). All three writes are no-ops when
      // no ChatStore is mounted.
      if (chatStore) {
        chatStore.setCurrentIntent(intent);
        // entityKey on the viewer_events row reflects what the user
        // was looking at when the intent dispatched — read it from
        // the active ChatSession. The intent payload may name a
        // document/project, but converting that to a branded
        // EntityKey is the consumer's job, not the orchestrator's.
        const activeSession = chatStore.state.activeSessionId
          ? chatStore.state.sessions.get(chatStore.state.activeSessionId)
          : null;
        chatStore.appendViewerEvent({
          action: "intent-dispatched",
          source,
          entityKey: activeSession?.activeEntityKey ?? null,
          detail: intent,
        });
        // UI-10b — durable row in the server-side `intent_log` table.
        // Fire-and-forget: failure routes to Sentry inside recordIntent;
        // never blocks the dispatch path.
        if (chatStore.state.activeSessionId) {
          void apiClient.intent.recordIntent({
            chatSessionId: chatStore.state.activeSessionId,
            source,
            intent,
          });
        }
      }

      // §4d #14 — built-in per-kind side effects as ONE exhaustive switch over
      // `intent.kind`. The `default` arm narrows `intent` to `never` and calls
      // `assertNeverIntent`, so a newly-added `CanvasIntent` kind without a
      // `case` here FAILS `tsc` (the old if-chain silently no-op'd it). Every
      // case preserves its exact prior context guard + handler — behavior is
      // unchanged. Kinds with no built-in side effect (routed only through the
      // adapter registry below) are explicit no-op cases so the exhaustiveness
      // check still names them.
      switch (intent.kind) {
        // ── chatStore-routed side effects ────────────────────────────────
        // clickable-citations Phase 3 — built-in side effect for the
        // citation-jump flow. CiteChip dispatches `highlightCitation`
        // (currently the only sink); this routes the click to a
        // push-or-mutate doc-viewer step so the viewer pane reliably
        // surfaces the cited document + page + bbox. No registered
        // adapter is required — the orchestrator is the canonical handler.
        case "highlightCitation":
          if (chatStore) {
            // add-citation-toggle — a USER click on the citation that's already
            // the active highlight clears it (click again to dismiss). The
            // automatic `agent` highlight always sets, never toggles.
            const activeSession = chatStore.state.activeSessionId
              ? chatStore.state.sessions.get(chatStore.state.activeSessionId)
              : null;
            const stepIdx = activeSession?.viewer.currentStep.stepIndex ?? -1;
            const top = stepIdx >= 0 ? activeSession?.viewer.history[stepIdx] : null;
            const activeDocViewer = top?.kind === "doc-viewer" ? top : null;
            const matchesActiveHighlight =
              source === "user" &&
              activeDocViewer != null &&
              activeDocViewer.documentId === intent.documentId &&
              activeDocViewer.highlight != null &&
              activeDocViewer.highlight.page === intent.page &&
              JSON.stringify(activeDocViewer.highlight.bbox ?? null) ===
                JSON.stringify(intent.bbox ?? null);
            if (matchesActiveHighlight) {
              chatStore.clearCitationHighlight();
            } else {
              chatStore.gotoDocViewer({
                documentId: intent.documentId,
                page: intent.page,
                ...(intent.bbox ? { bbox: intent.bbox } : {}),
                // WF-06b — carry the citation tier so the viewer renders the
                // overlay at the right precision (or suppresses it for ambient).
                ...(intent.tier ? { tier: intent.tier } : {}),
              });
            }
          }
          break;
        // "Show all sources" — draw every citation region at once on the cited
        // document. Distinct from highlightCitation (single region).
        case "showCitations":
          if (chatStore) {
            chatStore.showCitationRegions({
              documentId: intent.documentId,
              page: intent.page,
              regions: intent.regions,
            });
          }
          break;
        // widget-llm-integration Phase 4 — lighter-weight cousin of the
        // citation handler above. `jump_to_page` (LLM tool) and future
        // page-navigation affordances dispatch `jumpToPage` when there's no
        // citation context (no bbox). Same push/swap surface, no highlight.
        case "jumpToPage":
          if (chatStore) {
            chatStore.gotoDocViewer({ documentId: intent.documentId, page: intent.page });
          }
          break;
        // widget-llm-integration follow-up B.1 — schema-field proposal flow.
        // The `propose_schema_field` / `accept_proposal` / `reject_proposal`
        // LLM tools produce these intents; the orchestrator routes them to the
        // existing ChatStore mutators so the chat scroll + canvas ProposalCard
        // surfaces stay in sync.
        case "proposeSchemaField":
          if (chatStore) {
            chatStore.enqueueFieldProposal({
              categoryId: intent.categoryId,
              name: intent.name,
              type: intent.type,
              description: intent.description,
            });
          }
          break;
        case "acceptSchemaField":
          if (chatStore) chatStore.acceptFieldProposal(intent.proposalId);
          break;
        case "rejectSchemaField":
          if (chatStore) chatStore.dismissFieldProposal(intent.proposalId);
          break;
        // 2026-05-29-smart-report-screen Phase 5 — report pin + section-proposal
        // routing. The `pin_to_report` / `propose_report_section` /
        // `accept_report_section` / `reject_report_section` LLM tools (and the
        // `📌 pin to report` chat affordance) produce these intents; the
        // orchestrator routes them to the SAME ChatStore actions the on-screen
        // controls call (the interim AgentToolBus bridge — Extract's pattern).
        // Pin uses the existing-or-new UX (no auto-create).
        case "pinToReport":
          if (chatStore) {
            chatStore.pinToReport({
              turnId: intent.turnId,
              text: intent.text,
              ...(intent.templateId !== undefined ? { templateId: intent.templateId } : {}),
            });
          }
          break;
        case "proposeReportSection":
          if (chatStore) {
            chatStore.enqueueReportProposal({
              name: intent.name,
              renderAs: intent.renderAs,
              question: intent.question,
            });
          }
          break;
        case "acceptReportSection":
          if (chatStore) chatStore.acceptReportProposal(intent.proposalId);
          break;
        case "rejectReportSection":
          if (chatStore) chatStore.dismissReportProposal(intent.proposalId);
          break;
        case "editReportSection":
          if (chatStore) {
            chatStore.editReportSection(intent.sectionId, {
              ...(intent.name !== undefined ? { name: intent.name } : {}),
              ...(intent.renderAs !== undefined ? { renderAs: intent.renderAs } : {}),
              ...(intent.question !== undefined ? { question: intent.question } : {}),
              ...(intent.instructions !== undefined ? { instructions: intent.instructions } : {}),
              ...(intent.variables !== undefined ? { variables: intent.variables } : {}),
            });
          }
          break;
        case "deleteReportSection":
          if (chatStore) chatStore.removeReportSection(intent.sectionId);
          break;
        // ── OnboardingSession-routed side effects ────────────────────────
        // widget-llm-integration follow-up B.2 — gate-lifecycle routing.
        // Soft-fail when no OnboardingSessionProvider is mounted (steady
        // tree); the LLM emitting commit_gate / dismiss_gate outside
        // onboarding is a no-op by design.
        case "commitGate":
          if (onboardingSession) onboardingSession.commitGate(intent.method);
          break;
        case "dismissGate":
          if (onboardingSession) onboardingSession.dismissGate();
          break;
        // 2026-05-30-onboarding-shell-shared-view Phase 3a — the
        // `show_extraction` canvas-dispatch tool MOVES the canvas to the
        // extraction workbench (frame f3). This is the SAME `advanceFrame` the
        // Extract step-strip sub-pill calls, so the tool drives the identical
        // canvas move as the on-screen control. Soft-fail in the steady tree
        // (no OnboardingSessionProvider).
        case "showExtract":
          if (onboardingSession) onboardingSession.advanceFrame("f3");
          break;
        // 2026-05-30-onboarding-shell-shared-view Phase 3b — the
        // `show_integrate` canvas-dispatch tool MOVES the canvas to the
        // Integrate connectors surface (frame f7). SAME `advanceFrame` the
        // Integrate step-strip pill calls. Soft-fail in the steady tree.
        case "showIntegrate":
          if (onboardingSession) onboardingSession.advanceFrame("f7");
          break;
        // 2026-05-29-smart-report-screen Phase 5 — the canvas-dispatch `show_*`
        // report tools MOVE the canvas. `show_smart_report_render` emits
        // `showReport` (→ render frame f4); `show_smart_report_edit` emits
        // `editTemplate` (→ builder frame f4a), threading the section to
        // pre-open via `advanceFrame`'s `selectedReportSectionId` option (read
        // back by `ReportBuilderView` → the builder's `selectedSectionId`
        // prop). SAME `advanceFrame` the step-strip pill / render `✎ edit §N`
        // affordance calls. Soft-fail in the steady tree (report frames are
        // onboarding-only).
        case "showReport":
          if (onboardingSession) onboardingSession.advanceFrame("f4");
          break;
        case "editTemplate":
          if (onboardingSession) {
            onboardingSession.advanceFrame(
              "f4a",
              intent.selectedSectionId !== undefined
                ? { selectedReportSectionId: intent.selectedSectionId }
                : undefined,
            );
          }
          break;
        // 2026-05-31-shared-canvas-affordance-restoration — route the
        // previously-DORMANT `openGate` intent to the onboarding gate. The
        // chat-driven successor to the retired F5 Interact "Save" button:
        // the `save_to_account` tool / `tool:save_to_account` chip emit
        // `{ kind: "openGate", trigger: "save" }`, and this is the SINGLE
        // mechanism that opens the gate on the shared canvas (no parallel
        // path). Soft-fails in the steady tree (no provider).
        case "openGate":
          if (onboardingSession) onboardingSession.openGate(intent.trigger);
          break;
        // ── window-routed side effect ────────────────────────────────────
        // widget-llm-integration follow-up B.3 — book-call routing. The
        // OnboardingShell watches `?bookCall=1` to swap the viewer to
        // `BookCallView` + the chat to `BookingStatusCard`. We just set the
        // URL param; the existing react-router navigation handles the swap.
        case "openBookCall":
          if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.searchParams.set("bookCall", "1");
            window.history.pushState({}, "", url.toString());
            // Fire a popstate event so react-router (and anyone subscribed to
            // location changes) re-reads the URL.
            window.dispatchEvent(new PopStateEvent("popstate"));
          }
          break;
        // ── adapter-registry-only kinds (no built-in side effect) ────────
        // These intents carry no orchestrator-built-in behavior; they are
        // handled by a `registerAdapter`-registered adapter (the
        // `adaptersRef.get(intent.kind)` call below). Listed explicitly so the
        // exhaustiveness check names them — a future kind dropping out of the
        // switch still fails the compile.
        case "showSample":
        case "openDocument":
        case "editSchema":
        case "switchFrame":
        case "submitSignup":
        case "wizardNext":
        case "wizardBack":
        case "wizardFinish":
        case "dismissWizard":
        case "closeDialog":
          break;
        default:
          assertNeverIntent(intent);
      }

      const adapter = adaptersRef.current.get(intent.kind);
      if (adapter) {
        // Fire-and-forget. Adapters that need async behavior return a Promise;
        // the caller can subscribe via telemetry channels (Phase 1+). Errors are
        // logged but do not block the dispatcher — server is source of truth.
        try {
          const maybe = adapter.apply(intent as never);
          if (maybe && typeof (maybe as Promise<void>).catch === "function") {
            (maybe as Promise<void>).catch((error) => {
              apiClient.telemetry.captureException(error, {
                context: "CanvasOrchestrator.adapter",
                phase: "async-rejection",
                intentKind: intent.kind,
              });
            });
          }
        } catch (error) {
          apiClient.telemetry.captureException(error, {
            context: "CanvasOrchestrator.adapter",
            phase: "sync-throw",
            intentKind: intent.kind,
          });
        }
      }
      setLastAppliedIntentId(stamped.intentId);
      return stamped;
    },
    [apiClient.intent, apiClient.telemetry, now, chatStore, onboardingSession]
  );

  // ── post-mvs-cleanup Phase A — chat↔viewer bus convenience channels ──
  //
  // Curated cross-side methods that formalize the seams previously
  // wired pointwise. Both close over `chatStore` (optional — the bus
  // is a no-op in test trees that don't mount ChatStore).

  const openCitation = useCallback(
    (documentId: string, page: number, bbox?: NormalizedBbox) => {
      if (!chatStore) return;
      chatStore.pushOverlay({ kind: "citation-peek", documentId, page, ...(bbox ? { bbox } : {}) });
    },
    [chatStore],
  );

  const docOpened = useCallback(
    (input: { documentId: string; fileName: string }) => {
      if (!chatStore) return;
      chatStore.appendAgentMessage(`Opened ${input.fileName}.`);
    },
    [chatStore],
  );

  const value = useMemo<CanvasOrchestratorApi>(
    () => ({ lastAppliedIntentId, dispatch, registerAdapter, openCitation, docOpened }),
    [lastAppliedIntentId, dispatch, registerAdapter, openCitation, docOpened]
  );

  return <CanvasOrchestratorContext.Provider value={value}>{children}</CanvasOrchestratorContext.Provider>;
};

export const useCanvasOrchestrator = (): CanvasOrchestratorApi => {
  const value = useContext(CanvasOrchestratorContext);
  if (!value) throw new Error("useCanvasOrchestrator must be used inside CanvasOrchestratorProvider");
  return value;
};

/**
 * Soft-optional orchestrator access — mirrors `useChatStoreOptional` /
 * `useOnboardingSessionOptional`. Returns `null` when no
 * `CanvasOrchestratorProvider` is mounted (standalone widget tests, embedded
 * canvases) so a widget can register an LLM-tool adapter without forcing a
 * provider into every render path. Adapter registration becomes a no-op there.
 */
export const useCanvasOrchestratorOptional = (): CanvasOrchestratorApi | null =>
  useContext(CanvasOrchestratorContext);
