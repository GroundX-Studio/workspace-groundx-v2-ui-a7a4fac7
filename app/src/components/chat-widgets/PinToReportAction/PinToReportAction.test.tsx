/**
 * PinToReportAction — 2026-05-29-smart-report-screen Phase 5.
 *
 * The `📌 pin to report` affordance carried on every assistant turn. Clicking
 * it pins the turn's literal text as a report section (existing-or-new UX, NO
 * silent auto-create) via `ChatStore.pinToReport`. It is DISABLED mid-stream;
 * a click while streaming QUEUES and fires once streaming ends.
 */

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("@/api/chatSessions", async () => {
  const actual = await vi.importActual<typeof import("@/api/chatSessions")>("@/api/chatSessions");
  return { ...actual, ensureServerChatSession: vi.fn().mockResolvedValue(undefined) };
});

import { ChatStoreProvider, useChatStore } from "@/contexts/ChatStoreContext";

import { PinToReportAction } from "./PinToReportAction";

function Harness({ streaming }: { streaming: boolean }) {
  return (
    <PinToReportAction
      role="anonymous"
      scope={{ type: "none" }}
      turnId="m-7"
      turnText="Total due is $142.18, driven by the delivery charge."
      streaming={streaming}
    />
  );
}

function Probe({ onReady }: { onReady: (store: ReturnType<typeof useChatStore>) => void }) {
  const store = useChatStore();
  onReady(store);
  return null;
}

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe("PinToReportAction", () => {
  it("renders the pin affordance on an assistant turn", () => {
    render(
      <ChatStoreProvider autoSeedDefaultSession>
        <Harness streaming={false} />
      </ChatStoreProvider>,
    );
    expect(screen.getByTestId("pin-to-report-action")).toBeTruthy();
    expect(screen.getByTestId("pin-to-report-button").textContent).toMatch(/pin to report/i);
  });

  it("clicking pins the turn's literal text as a section", () => {
    let store!: ReturnType<typeof useChatStore>;
    render(
      <ChatStoreProvider autoSeedDefaultSession>
        <Probe onReady={(s) => (store = s)} />
        <Harness streaming={false} />
      </ChatStoreProvider>,
    );
    act(() => {
      screen.getByTestId("pin-to-report-button").click();
    });
    const session = store.state.sessions.get(store.state.activeSessionId!)!;
    expect(session.reportOverlay.addedFields).toHaveLength(1);
    expect(session.reportOverlay.addedFields[0]).toMatchObject({
      question: "Total due is $142.18, driven by the delivery charge.",
      pinnedFromTurnId: "m-7",
    });
  });

  it("queues a mid-stream click and drains it when streaming ends", () => {
    let store!: ReturnType<typeof useChatStore>;
    const wrap = (streaming: boolean, children: ReactNode) => (
      <ChatStoreProvider autoSeedDefaultSession>
        <Probe onReady={(s) => (store = s)} />
        {children}
        <Harness streaming={streaming} />
      </ChatStoreProvider>
    );
    const { rerender } = render(wrap(true, null));

    const btn = screen.getByTestId("pin-to-report-button");
    // Mid-stream the affordance is announced disabled (aria), but a click is
    // QUEUED rather than ignored.
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    act(() => {
      btn.click();
    });
    let session = store.state.sessions.get(store.state.activeSessionId!)!;
    // Nothing landed yet — the click is queued, waiting for stream-end.
    expect(session.reportOverlay.addedFields).toHaveLength(0);

    // Stream ends → the queued click drains and the section lands.
    act(() => {
      rerender(wrap(false, null));
    });
    session = store.state.sessions.get(store.state.activeSessionId!)!;
    expect(session.reportOverlay.addedFields).toHaveLength(1);
    expect(session.reportOverlay.addedFields[0]).toMatchObject({
      question: "Total due is $142.18, driven by the delivery charge.",
      pinnedFromTurnId: "m-7",
    });
  });

  it("does not pin when streaming ends WITHOUT a mid-stream click", () => {
    let store!: ReturnType<typeof useChatStore>;
    const wrap = (streaming: boolean) => (
      <ChatStoreProvider autoSeedDefaultSession>
        <Probe onReady={(s) => (store = s)} />
        <Harness streaming={streaming} />
      </ChatStoreProvider>
    );
    const { rerender } = render(wrap(true));
    act(() => {
      rerender(wrap(false));
    });
    const session = store.state.sessions.get(store.state.activeSessionId!)!;
    // No queued click → stream-end is a no-op (the drain is click-gated).
    expect(session.reportOverlay.addedFields).toHaveLength(0);
  });
});
