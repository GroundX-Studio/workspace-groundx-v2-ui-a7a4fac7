/**
 * ChatStore report-overlay actions — 2026-05-29-smart-report-screen Phase 4.
 *
 * The Report builder (`SmartReportBuilder`, f4a/S3a) is the **real second
 * consumer** that drives the editing-overlay generalization: the schema
 * overlay's shell (`PendingSchemaOverlay`) is factored into the generic
 * `PendingTemplateOverlay<TItem, TEdit, TProposal>` shell, and the report
 * builder instantiates it with `TemplateItem*` (report-section) types via a
 * parallel `reportOverlay` slot + report-section ChatStore actions.
 *
 * These tests pin the report-section actions (add / edit / remove / reorder)
 * against the stateful ChatStore. The Extract overlay's own tests
 * (`ChatStoreContext.test.tsx`, `SchemaView.test.tsx`) prove the schema arm is
 * untouched by the rename.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/chatSessions", async () => {
  const actual = await vi.importActual<typeof import("@/api/chatSessions")>("@/api/chatSessions");
  return { ...actual, ensureServerChatSession: vi.fn().mockResolvedValue(undefined) };
});

import { ChatStoreProvider, useChatStore } from "./ChatStoreContext";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ChatStoreProvider>{children}</ChatStoreProvider>
);

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  window.localStorage.clear();
});

describe("ChatStore reportOverlay (Phase 4 — generalized editing overlay)", () => {
  it("starts every session with an empty reportOverlay shell", () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });
    let id = "";
    act(() => {
      id = result.current.newSession();
    });
    const session = result.current.state.sessions.get(id)!;
    expect(session.reportOverlay.addedFields).toEqual([]);
    expect(session.reportOverlay.removedFieldIds.size).toBe(0);
    expect(session.reportOverlay.editedFields.size).toBe(0);
    expect(session.reportOverlay.pendingFieldProposals).toEqual([]);
  });

  it("addReportSection appends a section item to the active session's reportOverlay", () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });
    act(() => {
      result.current.newSession();
    });
    act(() => {
      result.current.addReportSection({
        id: "sec-1",
        name: "executive_summary",
        renderAs: "PARAGRAPH",
        question: "Summarize the bill.",
        instructions: [],
        variables: [],
      });
    });
    const session = result.current.state.sessions.get(result.current.state.activeSessionId!)!;
    expect(session.reportOverlay.addedFields).toHaveLength(1);
    expect(session.reportOverlay.addedFields[0]).toMatchObject({
      id: "sec-1",
      name: "executive_summary",
      renderAs: "PARAGRAPH",
      question: "Summarize the bill.",
    });
  });

  it("editReportSection shallow-merges a per-section edit", () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });
    act(() => {
      result.current.newSession();
    });
    act(() => {
      result.current.addReportSection({
        id: "sec-1",
        name: "executive_summary",
        renderAs: "PARAGRAPH",
        question: "Summarize the bill.",
        instructions: [],
        variables: [],
      });
    });
    act(() => {
      result.current.editReportSection("sec-1", { renderAs: "BULLETS", question: "List the charges." });
    });
    const session = result.current.state.sessions.get(result.current.state.activeSessionId!)!;
    const edit = session.reportOverlay.editedFields.get("sec-1");
    expect(edit).toMatchObject({ renderAs: "BULLETS", question: "List the charges." });
  });

  it("removeReportSection marks a section id removed", () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });
    act(() => {
      result.current.newSession();
    });
    act(() => {
      result.current.addReportSection({
        id: "sec-1",
        name: "executive_summary",
        renderAs: "PARAGRAPH",
        question: "Summarize the bill.",
        instructions: [],
        variables: [],
      });
    });
    act(() => {
      result.current.removeReportSection("sec-1");
    });
    const session = result.current.state.sessions.get(result.current.state.activeSessionId!)!;
    expect(session.reportOverlay.removedFieldIds.has("sec-1")).toBe(true);
  });

  it("makeSectionVariable records a literal-only manual variable on a section edit (#12)", () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });
    act(() => {
      result.current.newSession();
    });
    act(() => {
      result.current.addReportSection({
        id: "sec-1",
        name: "executive_summary",
        renderAs: "PARAGRAPH",
        question: "Summarize {project}.",
        instructions: [],
        variables: [],
      });
    });
    act(() => {
      result.current.editReportSection("sec-1", { variables: ["project"] });
    });
    const session = result.current.state.sessions.get(result.current.state.activeSessionId!)!;
    expect(session.reportOverlay.editedFields.get("sec-1")?.variables).toEqual(["project"]);
  });
});

// ── Phase 5: pin + section-proposal actions ──────────────────────────────

describe("ChatStore pinToReport (Phase 5 — existing-or-new, no auto-create)", () => {
  it("landing a pin appends a section carrying the literal turn text + provenance", () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });
    act(() => {
      result.current.newSession();
    });
    let resolution: ReturnType<typeof result.current.pinToReport>;
    act(() => {
      resolution = result.current.pinToReport({
        turnId: "m-7",
        text: "The total due is $142.18, driven by the delivery charge.",
      });
    });
    // With no existing templates, the resolution is prompt-new-only — but the
    // user confirmed (the affordance calls with no template = land into the
    // draft), so the section still lands (NO silent auto-create of a SAVED
    // template; the in-memory draft overlay is the v1 target).
    expect(resolution!.mode).toBe("prompt-new-only");
    const session = result.current.state.sessions.get(result.current.state.activeSessionId!)!;
    expect(session.reportOverlay.addedFields).toHaveLength(1);
    expect(session.reportOverlay.addedFields[0]).toMatchObject({
      question: "The total due is $142.18, driven by the delivery charge.",
      pinnedFromTurnId: "m-7",
    });
  });

  it("does NOT auto-create a section when only resolving the target (resolveOnly)", () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });
    act(() => {
      result.current.newSession();
    });
    let resolution: ReturnType<typeof result.current.pinToReport>;
    act(() => {
      resolution = result.current.pinToReport({
        turnId: "m-7",
        text: "literal",
        resolveOnly: true,
      });
    });
    expect(resolution!.mode).toBe("prompt-new-only");
    const session = result.current.state.sessions.get(result.current.state.activeSessionId!)!;
    expect(session.reportOverlay.addedFields).toHaveLength(0);
  });
});

describe("ChatStore report-section proposals (Phase 5 — shared family)", () => {
  it("enqueueReportProposal queues a section proposal; acceptReportProposal lands it", () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });
    act(() => {
      result.current.newSession();
    });
    act(() => {
      result.current.enqueueReportProposal({
        name: "anomalies",
        renderAs: "BULLETS",
        question: "List anomalies in the bill.",
      });
    });
    let session = result.current.state.sessions.get(result.current.state.activeSessionId!)!;
    expect(session.reportOverlay.pendingFieldProposals).toHaveLength(1);
    const proposalId = session.reportOverlay.pendingFieldProposals[0].id;

    act(() => {
      result.current.acceptReportProposal(proposalId);
    });
    session = result.current.state.sessions.get(result.current.state.activeSessionId!)!;
    expect(session.reportOverlay.pendingFieldProposals).toHaveLength(0);
    expect(session.reportOverlay.addedFields).toHaveLength(1);
    expect(session.reportOverlay.addedFields[0]).toMatchObject({
      name: "anomalies",
      renderAs: "BULLETS",
      question: "List anomalies in the bill.",
    });
  });

  it("dismissReportProposal drops a queued proposal without adding a section", () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });
    act(() => {
      result.current.newSession();
    });
    act(() => {
      result.current.enqueueReportProposal({
        name: "anomalies",
        renderAs: "BULLETS",
        question: "List anomalies.",
      });
    });
    let session = result.current.state.sessions.get(result.current.state.activeSessionId!)!;
    const proposalId = session.reportOverlay.pendingFieldProposals[0].id;
    act(() => {
      result.current.dismissReportProposal(proposalId);
    });
    session = result.current.state.sessions.get(result.current.state.activeSessionId!)!;
    expect(session.reportOverlay.pendingFieldProposals).toHaveLength(0);
    expect(session.reportOverlay.addedFields).toHaveLength(0);
  });
});
