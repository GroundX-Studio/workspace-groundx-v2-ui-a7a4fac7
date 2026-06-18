import { createContext, useCallback, useContext, useMemo, useRef, useState, type FC, type ReactNode } from "react";

import type { ContentScope, NormalizedBbox } from "@groundx/shared";
import { useApi } from "@/contexts/ApiContext";
import { useChatStoreOptional } from "@/contexts/ChatStoreContext";
import { useOnboardingSessionOptional } from "@/contexts/OnboardingSessionContext";

import type { CanvasAdapter, CanvasIntent, CanvasOrchestratorApi, IntentSource, StampedIntent } from "./types";
import { togglesOffOnRepeat } from "./togglesOffOnRepeat";

/**
 * The active doc-viewer step off the ChatStore's current viewer position, or
 * null when no session is active / the top step isn't a doc-viewer. Shared by
 * both citation toggles (Task 5).
 */
function activeDocViewerStep(chatStore: NonNullable<ReturnType<typeof useChatStoreOptional>>) {
  const activeSession = chatStore.state.activeSessionId
    ? chatStore.state.sessions.get(chatStore.state.activeSessionId)
    : null;
  const stepIdx = activeSession?.viewer.currentStep.stepIndex ?? -1;
  const top = stepIdx >= 0 ? activeSession?.viewer.history[stepIdx] : null;
  return top?.kind === "doc-viewer" ? top : null;
}

/**
 * The active extract-workbench step off the ChatStore's current viewer
 * position, or null when no session is active / the top step isn't an
 * extract-workbench. standardized-viewer-control T4 uses it so a `showExtract`
 * while ALREADY on the workbench re-focuses in place instead of pushing.
 */
function activeExtractWorkbenchStep(chatStore: NonNullable<ReturnType<typeof useChatStoreOptional>>) {
  const activeSession = chatStore.state.activeSessionId
    ? chatStore.state.sessions.get(chatStore.state.activeSessionId)
    : null;
  const stepIdx = activeSession?.viewer.currentStep.stepIndex ?? -1;
  const top = stepIdx >= 0 ? activeSession?.viewer.history[stepIdx] : null;
  return top?.kind === "extract-workbench" ? top : null;
}

/**
 * standardized-viewer-control T5 — the scope's primary document, or null when
 * the scope carries none (`bucket`/`group`/`none`). `showInteract` resolves it
 * onto the `interact-chat` step so the shared PdfViewer canvas isn't doc-less in
 * STEADY (where the shell narrows the canvas scope to a document only for steps
 * that carry one).
 */
function primaryDocumentFromScope(scope: ContentScope): string | null {
  return scope.type === "documents" ? scope.documentIds[0] ?? null : null;
}

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
      const activeSession = chatStore?.state.activeSessionId
        ? chatStore.state.sessions.get(chatStore.state.activeSessionId)
        : null;
      const routeThroughOnboarding = Boolean(onboardingSession && activeSession?.isOnboardingSession);

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
            // (Task 5: shared togglesOffOnRepeat predicate.)
            //
            // multi-region-citations: the compared slot is the citation's WHOLE
            // region set, NOT just its first {page, bbox}. Many distinct
            // citations on a tabular/list answer legitimately share the same
            // first region (the container chunk dozens of values fall inside);
            // comparing only the first box made clicking a DIFFERENT citation
            // look like a re-click of the active one, so it cleared instead of
            // switching. A compact per-region signature distinguishes citations
            // reliably while staying cheap to stringify (regions are small after
            // dedupe). Legacy single-bbox citations fall back to a one-region
            // signature, so their toggle behavior is unchanged.
            const regionSig = (
              rs?: ReadonlyArray<{ page: number; bbox?: NormalizedBbox | null; tier?: string }> | null,
            ) =>
              (rs ?? []).map(
                (r) =>
                  `${r.page}:${r.bbox ? `${r.bbox.x},${r.bbox.y},${r.bbox.w},${r.bbox.h}` : ""}:${r.tier ?? ""}`,
              );
            const activeDocViewer = activeDocViewerStep(chatStore);
            const currentRegions = activeDocViewer?.highlight
              ? (activeDocViewer.highlight.regions ??
                (activeDocViewer.highlight.bbox
                  ? [
                      {
                        page: activeDocViewer.highlight.page,
                        bbox: activeDocViewer.highlight.bbox,
                        tier: activeDocViewer.highlight.tier,
                      },
                    ]
                  : []))
              : null;
            const incomingRegions =
              intent.regions ??
              (intent.bbox ? [{ page: intent.page, bbox: intent.bbox, tier: intent.tier }] : []);
            const matchesActiveHighlight = togglesOffOnRepeat({
              source,
              activeDocViewer,
              documentId: intent.documentId,
              current: currentRegions ? regionSig(currentRegions) : null,
              incoming: regionSig(incomingRegions),
            });
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
                // multi-region-citations P2.1 — all the citation's regions so the
                // viewer lights every place its claim is supported, each at its tier.
                ...(intent.regions && intent.regions.length > 0 ? { regions: intent.regions } : {}),
              });
            }
          }
          break;
        // "Show all sources" — draw every citation region at once on the cited
        // document. Distinct from highlightCitation (single region).
        case "showCitations":
          if (chatStore) {
            // show-all-sources toggle (2026-06-11) — a USER re-click of "Show
            // all sources" while those same regions are already lit CLEARS
            // them (mirrors the highlightCitation toggle above). An
            // agent-sourced dispatch always sets, never toggles.
            // (Task 5: same shared predicate; the compared slot here is the
            // lit-regions array, with empty mapped to null.)
            const activeDocViewer = activeDocViewerStep(chatStore);
            const matchesLitRegions = togglesOffOnRepeat({
              source,
              activeDocViewer,
              documentId: intent.documentId,
              current:
                activeDocViewer?.litRegions != null && activeDocViewer.litRegions.length > 0
                  ? activeDocViewer.litRegions
                  : null,
              incoming: intent.regions,
            });
            if (matchesLitRegions) {
              chatStore.clearCitationRegions();
            } else {
              chatStore.showCitationRegions({
                documentId: intent.documentId,
                page: intent.page,
                regions: intent.regions,
              });
            }
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
        // standardized-viewer-control T5 — the `show_extraction` canvas-dispatch
        // tool MOVES the canvas to the extraction workbench. ONE outcome (both
        // experiences): push/mutate the `extract-workbench` step honoring the
        // intent payload (D6 — `schemaId` is the workbench's scenarioId; no more
        // hardcoded "utility"). Onboarding LAYERS journey-progress (the analyze
        // stage) + the Extract first-reach analytic on top — it does not fork
        // the canvas move by experience.
        case "showExtract": {
          // T4/T5 — a re-entry while the workbench is ALREADY the active step
          // mutates IN PLACE (history unchanged). Two sub-position rules,
          // distinguished by whether the intent carries a category focus:
          //   • WITH focusedCategoryId — a re-FOCUS (the category dropdown). It
          //     PRESERVES the active surface so re-focusing inside the schema
          //     DESIGN surface stays in design (and inside fields stays in fields).
          //   • WITHOUT focusedCategoryId — "show the FIELDS workbench" (the
          //     "← back" from the design surface, T5/R7): return surface to
          //     "fields", keeping the existing focus.
          const activeExtract = chatStore ? activeExtractWorkbenchStep(chatStore) : null;
          if (chatStore && activeExtract) {
            if (intent.focusedCategoryId) {
              if (intent.focusedCategoryId !== activeExtract.focusedCategoryId) {
                chatStore.mutateActiveStep({ ...activeExtract, focusedCategoryId: intent.focusedCategoryId });
              }
            } else if ((activeExtract.surface ?? "fields") !== "fields") {
              chatStore.mutateActiveStep({ ...activeExtract, surface: "fields" });
            }
          } else if (chatStore) {
            chatStore.pushStep({
              kind: "extract-workbench",
              scenarioId: intent.schemaId,
              ...(intent.focusedCategoryId ? { focusedCategoryId: intent.focusedCategoryId } : {}),
            });
          }
          // Onboarding-only side effects, layered on top of the one outcome.
          // (Focus is a sub-position carried on the pushed step above, not a
          // journey-state input — `markStageReached` only tracks the stage, which
          // is `analyze` for any extract-workbench step.)
          if (routeThroughOnboarding && onboardingSession) {
            onboardingSession.markStageReached({ kind: "extract-workbench", scenarioId: intent.schemaId });
            // R1 — `understand.completed` on the Extract first-reach (ref-gated).
            onboardingSession.notifyExtractReached();
          }
          break;
        }
        // standardized-viewer-control T5 — `showInteract` MOVES the canvas to the
        // Interact (chat-with-sources) surface. ONE outcome (both experiences):
        // push an `interact-chat` step RESOLVING the document from `intent.scope`
        // so the shared PdfViewer canvas isn't doc-less in steady. Onboarding
        // layers the Interact journey stage on top.
        case "showInteract": {
          if (chatStore) {
            const docId = primaryDocumentFromScope(intent.scope);
            chatStore.pushStep({
              kind: "interact-chat",
              scenarioId: onboardingSession?.state.scenario ?? "utility",
              ...(docId ? { documentId: docId } : {}),
            });
          }
          if (routeThroughOnboarding) {
            onboardingSession?.markStageReached({
              kind: "interact-chat",
              scenarioId: onboardingSession.state.scenario ?? "utility",
            });
          }
          break;
        }
        // standardized-viewer-control T5 — `showIntegrate` MOVES the canvas to the
        // Integrate connectors surface. ONE outcome (both experiences): push the
        // `integrate` step. Onboarding layers the Integrate journey stage on top
        // (which also pops a stale sign-up overlay).
        case "showIntegrate":
          if (chatStore) chatStore.pushStep({ kind: "integrate" });
          if (routeThroughOnboarding) onboardingSession?.markStageReached({ kind: "integrate" });
          break;
        // 2026-05-29-smart-report-screen Phase 5 / standardized-viewer-control T5
        // — the canvas-dispatch `show_*` report tools MOVE the canvas. ONE outcome
        // (both experiences): `show_smart_report_render` (`showReport`) pushes the
        // render step; `show_smart_report_edit` (`editTemplate`) pushes the builder
        // step threading the section to pre-open. Onboarding layers the Report
        // journey stage on top (the render vs builder distinction lives on the
        // `report` step's `surface` field, not a journey stage).
        case "showReport":
          if (chatStore) chatStore.pushStep({ kind: "report", surface: "render" });
          if (routeThroughOnboarding) {
            onboardingSession?.markStageReached({ kind: "report", surface: "render" });
          }
          break;
        case "editTemplate":
          if (chatStore) {
            chatStore.pushStep({
              kind: "report",
              surface: "builder",
              ...(intent.selectedSectionId !== undefined ? { selectedSectionId: intent.selectedSectionId } : {}),
            });
          }
          if (routeThroughOnboarding) {
            // markStageReached reads the report-builder's pre-selected section
            // off the step itself (frame-free) — thread it on.
            onboardingSession?.markStageReached({
              kind: "report",
              surface: "builder",
              ...(intent.selectedSectionId !== undefined ? { selectedSectionId: intent.selectedSectionId } : {}),
            });
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
        // OnboardingShell watches `?bookCall=1` to overlay `BookCallView`
        // on the active viewer while the normal chat timeline stays mounted.
        // We just set the URL param; react-router handles the surface update.
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
        // 2026-06-10 formerly-silent kinds — a live-canvas audit found these
        // kinds dispatching (intent_log row written) with NO registered adapter
        // in the production tree, i.e. silent no-ops. Each now routes to the
        // SAME mutator the on-screen control calls (no parallel path),
        // soft-failing in the steady tree like the other onboarding cases.
        // (standardized-viewer-control T7 retired the generic any-destination
        // navigator — per-destination navigation intents
        // (`showExtract`/`showReport`/`showInteract`/`showIntegrate`) replace it.)
        // standardized-viewer-control T5 (R7) — `showSample` is EXPLICITLY
        // ONBOARDING-SCOPED: it activates a demo sample via the SAME
        // `pickScenario` the Ingest picker calls (idempotent on an
        // already-active entity). In STEADY there is no sample journey, so this
        // is an HONEST no-op WITH A REASON (not a silent dead intent) — the
        // authenticated experience navigates documents, not onboarding samples.
        case "showSample":
          if (onboardingSession) onboardingSession.pickScenario(intent.scenario);
          // else: steady — no sample journey; intentionally nothing to do.
          break;
        // standardized-viewer-control deletion-phase — the generic experience/
        // overlay-internal SCRIPTED viewer beat. ONBOARDING-SCOPED choreography
        // (the three residual backward/lateral onboarding transitions: Extract
        // save-and-return, OnboardingShell URL-return, the experience intro-snap)
        // routed through the ONE standard dispatch seam instead of
        // onboarding-specific destination intents. The typed `beat` discriminator
        // is the VALUES; this single kind is the MECHANISM. Soft-fails in the
        // steady tree (no provider) like the other onboarding cases — steady has
        // no scripted onboarding choreography.
        case "presentExperienceBeat":
          if (onboardingSession) {
            switch (intent.beat.kind) {
              case "ingest-picker":
                // Return to the picker AND deactivate the active entity (the
                // BACKWARD transition to ingest: gate reset + "left" event +
                // picker step). The optional attachedSchema rides onto the
                // picker step.
                onboardingSession.returnToIngestPicker(intent.beat.attachedSchema);
                break;
              case "understand-scanning": {
                // Snap to the Understand "GroundX is reading the doc" scanning
                // beat AND set the Understand journey edge. Push the scanning
                // doc-viewer step (the canvas outcome) then layer the journey
                // advance (the Understand stage edge) via markStageReached —
                // one seam, no fork.
                const scenario = onboardingSession.state.scenario;
                const scanStep = {
                  kind: "doc-viewer" as const,
                  documentId: scenario ? `scenario:${scenario}` : "scenario:unknown",
                  scanning: true,
                };
                if (chatStore) chatStore.pushStep(scanStep);
                onboardingSession.markStageReached(scanStep);
                break;
              }
              default:
                // Exhaustiveness over the beat discriminator — a new beat without
                // a case fails tsc here.
                intent.beat satisfies never;
            }
          }
          // else: steady — no scripted onboarding choreography; intentionally
          // nothing to do.
          break;
        // standardized-viewer-control T5 (R7) — the schema DESIGN surface is an
        // EXPERIENCE-AGNOSTIC sub-position on the `extract-workbench` step
        // (`surface: "design"`), MIRRORING how `editTemplate` pushes `report`
        // `surface: "builder"`. This CLOSES a production bug: authenticated
        // (steady) users could not reach the schema editor at all (the legacy
        // design-surface entry no-opped without an OnboardingSession). ONE
        // outcome both experiences: if the workbench is already active, flip it
        // to design in place; otherwise push a workbench step opened on the
        // design surface. The journey stage stays `analyze` (Extract) — design
        // is a sub-position, not a separate journey stage — so no
        // markStageReached.
        case "editSchema": {
          const activeExtract = chatStore ? activeExtractWorkbenchStep(chatStore) : null;
          if (chatStore && activeExtract) {
            if (activeExtract.surface !== "design") {
              chatStore.mutateActiveStep({ ...activeExtract, surface: "design" });
            }
          } else if (chatStore) {
            chatStore.pushStep({
              kind: "extract-workbench",
              scenarioId: intent.schemaId,
              surface: "design",
            });
          }
          break;
        }
        // Mirrors jumpToPage (same push/swap doc-viewer surface, no
        // highlight); the intent's page is optional → default to page 1.
        case "openDocument":
          if (chatStore) {
            chatStore.gotoDocViewer({ documentId: intent.documentId, page: intent.page ?? 1 });
          }
          break;
        // ── adapter-registry-only kinds (no built-in side effect) ────────
        // These intents carry no orchestrator-built-in behavior; they are
        // handled by a `registerAdapter`-registered adapter (the
        // `adaptersRef.get(intent.kind)` call below). Listed explicitly so the
        // exhaustiveness check names them — a future kind dropping out of the
        // switch still fails the compile.
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
