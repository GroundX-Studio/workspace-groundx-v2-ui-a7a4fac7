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
