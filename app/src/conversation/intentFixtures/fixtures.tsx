import type { ChatReply } from "@/api/chatSessions";

import { assert } from "./assert";
import type { IntentFixture } from "./types";

/**
 * Intent fixtures — keyed by catalog `kind`. The ONE place that says "for this
 * intent, here's a realistic trigger and what its sink should do."
 *
 * Consumed by the replay tests, the completeness guard, and the dev harness.
 * Vitest-free on purpose (see `assert`): the harness imports this module.
 */

const DOC = "c3bfff49-6640-4213-822b-e81c3a771e45";
const DOC_SCOPE = { type: "documents", documentIds: [DOC] } as const;

/** Poll the live session for the first pending proposal's id (handles the
 *  re-render lag after a propose dispatch). */
async function firstPendingProposalId(
  getSession: () => unknown,
  overlayKey: "pendingSchemaOverlay" | "reportOverlay",
  flush: () => Promise<void>,
): Promise<string | undefined> {
  for (let i = 0; i < 20; i += 1) {
    const session = getSession() as
      | Record<string, { pendingFieldProposals?: Array<{ id: string }> }>
      | null;
    const id = session?.[overlayKey]?.pendingFieldProposals?.[0]?.id;
    if (id) return id;
    await flush();
  }
  return undefined;
}

/** A canned `ChatReply` whose single tool-call intent drives P4 derivation. */
function replyWithIntent(toolName: string, intent: Record<string, unknown>): ChatReply {
  return {
    mode: "rag",
    answer: "",
    citations: [],
    suggestedActions: [],
    tools: [],
    intents: [{ name: toolName, arguments: {}, intent }],
    toolFailures: [],
    proposedSchemaField: null,
  };
}

export const intentFixtures: IntentFixture[] = [
  // ── highlightCitation (P1 — auto-cite) ──────────────────────────
  {
    kind: "highlightCitation",
    trigger: {
      via: "reply",
      reply: {
        mode: "rag",
        answer: "The total amount due is $7,613.20.",
        citations: [{ documentId: DOC, page: 2, bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.01 }, tier: "exact" }],
        suggestedActions: [],
        tools: [],
        intents: [],
        toolFailures: [],
        proposedSchemaField: null,
      },
    },
    assert: (s) => {
      assert(s.docViewerStep !== null, "expected an active doc-viewer step");
      assert(s.docViewerStep!.documentId === DOC, `documentId was ${s.docViewerStep!.documentId}`);
      assert(s.docViewerStep!.page === 2, `page was ${s.docViewerStep!.page}`);
      assert(s.docViewerStep!.hasBbox, "expected a bbox highlight");
    },
  },

  // ── Batch A: frame-advance (P4 → OnboardingSession.advanceFrame) ─
  {
    kind: "showExtract",
    trigger: { via: "reply", reply: replyWithIntent("show_extraction", { kind: "showExtract", scope: DOC_SCOPE, schemaId: "schema-1" }) },
    assert: (s) => assert(s.frame === "f3", `frame was ${s.frame}`),
  },
  {
    kind: "showIntegrate",
    trigger: { via: "reply", reply: replyWithIntent("show_integrate", { kind: "showIntegrate", scope: DOC_SCOPE }) },
    assert: (s) => assert(s.frame === "f7", `frame was ${s.frame}`),
  },
  {
    kind: "showReport",
    trigger: { via: "reply", reply: replyWithIntent("show_smart_report_render", { kind: "showReport", templateId: "tmpl-1", scope: DOC_SCOPE }) },
    assert: (s) => assert(s.frame === "f4", `frame was ${s.frame}`),
  },
  {
    kind: "editTemplate",
    trigger: { via: "reply", reply: replyWithIntent("show_smart_report_edit", { kind: "editTemplate", templateId: "tmpl-1" }) },
    assert: (s) => assert(s.frame === "f4a", `frame was ${s.frame}`),
  },

  // ── Batch C: viewer built-in (jumpToPage / showCitations) ───────
  {
    kind: "jumpToPage",
    trigger: { via: "reply", reply: replyWithIntent("jump_to_page", { kind: "jumpToPage", documentId: DOC, page: 3 }) },
    assert: (s) => {
      assert(s.docViewerStep !== null, "expected a doc-viewer step");
      assert(s.docViewerStep!.page === 3, `page was ${s.docViewerStep!.page}`);
      assert(!s.docViewerStep!.hasBbox, "jumpToPage should carry no bbox highlight");
    },
  },
  {
    kind: "showCitations",
    trigger: {
      via: "dispatch",
      source: "user",
      intent: {
        kind: "showCitations",
        documentId: DOC,
        page: 1,
        regions: [
          { page: 1, x: 0.1, y: 0.2, w: 0.3, h: 0.02, color: "green" },
          { page: 2, x: 0.2, y: 0.3, w: 0.4, h: 0.02, color: "coral" },
        ],
      },
    },
    assert: (s) => {
      assert(s.docViewerStep !== null, "expected a doc-viewer step");
      assert(s.docViewerStep!.litRegionCount === 2, `litRegions was ${s.docViewerStep!.litRegionCount}`);
    },
  },

  // ── Batch E: window-routed (openBookCall) ───────────────────────
  {
    kind: "openBookCall",
    trigger: { via: "reply", reply: replyWithIntent("book_call", { kind: "openBookCall" }) },
    assert: (s) => assert(s.bookCallActive, "expected ?bookCall=1 on the URL"),
  },

  // ── Batch F: adapter-routed (spy adapter captures the kind) ─────
  // Non-emittable (UI-originated) → via:dispatch.
  {
    kind: "showSample",
    trigger: { via: "dispatch", source: "user", intent: { kind: "showSample", scenario: "utility" } },
    assert: (s) => assert(s.adapterCapturedKind === "showSample", `captured ${s.adapterCapturedKind}`),
  },
  {
    kind: "openDocument",
    trigger: { via: "dispatch", source: "user", intent: { kind: "openDocument", documentId: DOC } },
    assert: (s) => assert(s.adapterCapturedKind === "openDocument", `captured ${s.adapterCapturedKind}`),
  },
  {
    kind: "editSchema",
    trigger: { via: "dispatch", source: "user", intent: { kind: "editSchema", schemaId: "schema-1" } },
    assert: (s) => assert(s.adapterCapturedKind === "editSchema", `captured ${s.adapterCapturedKind}`),
  },
  // Emittable adapter kinds → via:reply (P4).
  {
    kind: "switchFrame",
    trigger: { via: "reply", reply: replyWithIntent("suggest_intent", { kind: "switchFrame", frame: "f3" }) },
    assert: (s) => assert(s.adapterCapturedKind === "switchFrame", `captured ${s.adapterCapturedKind}`),
  },
  {
    kind: "submitSignup",
    trigger: {
      via: "reply",
      reply: replyWithIntent("submit_signup", {
        kind: "submitSignup",
        first: "Pat",
        last: "Lee",
        email: "pat@example.com",
        password: "pw123456",
        confirmPassword: "pw123456",
      }),
    },
    assert: (s) => assert(s.adapterCapturedKind === "submitSignup", `captured ${s.adapterCapturedKind}`),
  },
  {
    kind: "wizardNext",
    trigger: { via: "reply", reply: replyWithIntent("wizard_next", { kind: "wizardNext" }) },
    assert: (s) => assert(s.adapterCapturedKind === "wizardNext", `captured ${s.adapterCapturedKind}`),
  },
  {
    kind: "wizardBack",
    trigger: { via: "reply", reply: replyWithIntent("wizard_back", { kind: "wizardBack" }) },
    assert: (s) => assert(s.adapterCapturedKind === "wizardBack", `captured ${s.adapterCapturedKind}`),
  },
  {
    kind: "wizardFinish",
    trigger: { via: "reply", reply: replyWithIntent("wizard_finish", { kind: "wizardFinish" }) },
    assert: (s) => assert(s.adapterCapturedKind === "wizardFinish", `captured ${s.adapterCapturedKind}`),
  },
  {
    kind: "dismissWizard",
    trigger: { via: "reply", reply: replyWithIntent("dismiss_wizard", { kind: "dismissWizard" }) },
    assert: (s) => assert(s.adapterCapturedKind === "dismissWizard", `captured ${s.adapterCapturedKind}`),
  },
  {
    kind: "closeDialog",
    trigger: { via: "reply", reply: replyWithIntent("close_dialog", { kind: "closeDialog" }) },
    assert: (s) => assert(s.adapterCapturedKind === "closeDialog", `captured ${s.adapterCapturedKind}`),
  },

  // ── Batch B: gate (OnboardingSession.gate) ──────────────────────
  {
    kind: "openGate",
    trigger: { via: "reply", reply: replyWithIntent("save_to_account", { kind: "openGate", trigger: "save" }) },
    assert: (s) => assert(s.gateStatus === "open", `gate was ${s.gateStatus}`),
  },
  {
    kind: "commitGate",
    trigger: { via: "reply", reply: replyWithIntent("commit_gate", { kind: "commitGate", method: "register" }) },
    assert: (s) => assert(s.gateStatus === "committed", `gate was ${s.gateStatus}`),
  },
  {
    // dismissGate is guarded on status==="open", so open first.
    kind: "dismissGate",
    trigger: {
      via: "script",
      run: async ({ dispatch, flush }) => {
        dispatch({ kind: "openGate", trigger: "save" }, "agent");
        await flush();
        dispatch({ kind: "dismissGate" }, "user");
        await flush();
      },
    },
    assert: (s) => assert(s.gateStatus === "dismissed", `gate was ${s.gateStatus}`),
  },

  // ── Batch D: schema proposals (ChatStore pendingSchemaOverlay) ──
  {
    kind: "proposeSchemaField",
    trigger: {
      via: "reply",
      reply: replyWithIntent("propose_schema_field", {
        kind: "proposeSchemaField",
        categoryId: "meters",
        name: "Test Field",
        type: "STRING",
        description: "A proposed field.",
      }),
    },
    assert: (s) => assert(s.schemaOverlay.pendingProposals >= 1, `pending was ${s.schemaOverlay.pendingProposals}`),
  },
  {
    kind: "acceptSchemaField",
    trigger: {
      via: "script",
      run: async ({ dispatch, getSession, flush }) => {
        dispatch({ kind: "proposeSchemaField", categoryId: "meters", name: "F", type: "STRING", description: "d" }, "agent");
        const id = await firstPendingProposalId(getSession, "pendingSchemaOverlay", flush);
        if (id) dispatch({ kind: "acceptSchemaField", proposalId: id }, "agent");
        await flush();
      },
    },
    assert: (s) => assert(s.schemaOverlay.addedFields >= 1, `addedFields was ${s.schemaOverlay.addedFields}`),
  },
  {
    kind: "rejectSchemaField",
    trigger: {
      via: "script",
      run: async ({ dispatch, getSession, flush }) => {
        dispatch({ kind: "proposeSchemaField", categoryId: "meters", name: "F", type: "STRING", description: "d" }, "agent");
        const id = await firstPendingProposalId(getSession, "pendingSchemaOverlay", flush);
        if (id) dispatch({ kind: "rejectSchemaField", proposalId: id }, "agent");
        await flush();
      },
    },
    assert: (s) => {
      assert(s.schemaOverlay.pendingProposals === 0, `pending was ${s.schemaOverlay.pendingProposals}`);
      assert(s.schemaOverlay.addedFields === 0, "rejected field must not be added");
    },
  },

  // ── Batch G: report sections (ChatStore reportOverlay) ──────────
  {
    kind: "proposeReportSection",
    trigger: {
      via: "reply",
      reply: replyWithIntent("propose_report_section", {
        kind: "proposeReportSection",
        name: "Summary",
        renderAs: "PARAGRAPH",
        question: "What is the total?",
      }),
    },
    assert: (s) => assert(s.reportOverlay.pendingProposals >= 1, `pending was ${s.reportOverlay.pendingProposals}`),
  },
  {
    kind: "acceptReportSection",
    trigger: {
      via: "script",
      run: async ({ dispatch, getSession, flush }) => {
        dispatch({ kind: "proposeReportSection", name: "S", renderAs: "PARAGRAPH", question: "q" }, "agent");
        const id = await firstPendingProposalId(getSession, "reportOverlay", flush);
        if (id) dispatch({ kind: "acceptReportSection", proposalId: id }, "agent");
        await flush();
      },
    },
    assert: (s) => assert(s.reportOverlay.addedFields >= 1, `addedFields was ${s.reportOverlay.addedFields}`),
  },
  {
    kind: "rejectReportSection",
    trigger: {
      via: "script",
      run: async ({ dispatch, getSession, flush }) => {
        dispatch({ kind: "proposeReportSection", name: "S", renderAs: "PARAGRAPH", question: "q" }, "agent");
        const id = await firstPendingProposalId(getSession, "reportOverlay", flush);
        if (id) dispatch({ kind: "rejectReportSection", proposalId: id }, "agent");
        await flush();
      },
    },
    assert: (s) => assert(s.reportOverlay.pendingProposals === 0, `pending was ${s.reportOverlay.pendingProposals}`),
  },
  {
    kind: "editReportSection",
    trigger: { via: "reply", reply: replyWithIntent("edit_report_section", { kind: "editReportSection", sectionId: "sec-1", name: "Renamed" }) },
    assert: (s) => assert(s.reportOverlay.editedIds.includes("sec-1"), `editedIds were ${JSON.stringify(s.reportOverlay.editedIds)}`),
  },
  {
    kind: "deleteReportSection",
    trigger: { via: "reply", reply: replyWithIntent("delete_report_section", { kind: "deleteReportSection", sectionId: "sec-1" }) },
    assert: (s) => assert(s.reportOverlay.removedIds.includes("sec-1"), `removedIds were ${JSON.stringify(s.reportOverlay.removedIds)}`),
  },
  {
    kind: "pinToReport",
    trigger: { via: "reply", reply: replyWithIntent("pin_to_report", { kind: "pinToReport", turnId: "turn-1", text: "The total is $7,613.20." }) },
    assert: (s) => assert(s.reportOverlay.addedFields >= 1, `addedFields was ${s.reportOverlay.addedFields}`),
  },
];
