/**
 * standardized-viewer-control T6 — `useJourneyStage` / `useIsPreIntegrateStage`
 * derive the journey stage from the ACTIVE VIEWER STEP (via the single-source
 * `VIEWER_STEP_TO_JOURNEY`), with NO frame read. These guard the shared chrome
 * predicate that GateChatRail + SignUpWidget + ChatColumn read.
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { withApiProvider } from "@/test/withApiProvider";
import { ChatStoreProvider, useChatStore } from "@/contexts/ChatStoreContext";

import { useJourneyStage, useIsPreIntegrateStage } from "./useJourneyStage";

const withChatStoreApi = (children: ReactNode) =>
  withApiProvider(children, {
    session: { ensureAnonSession: vi.fn() },
    chat: { ensureServerChatSession: vi.fn() },
  });

const wrapper = ({ children }: { children: ReactNode }) => (
  withChatStoreApi(<ChatStoreProvider>{children}</ChatStoreProvider>)
);

function useProbe() {
  const store = useChatStore();
  return { store, stage: useJourneyStage(), preIntegrate: useIsPreIntegrateStage() };
}

describe("useJourneyStage (T6)", () => {
  it("returns null when no session/step is active (journey not started → pre-Integrate)", () => {
    const { result } = renderHook(() => useProbe(), { wrapper });
    expect(result.current.stage).toBeNull();
    expect(result.current.preIntegrate).toBe(true);
  });

  it("maps the active extract-workbench step to the analyze stage (pre-Integrate)", () => {
    const { result } = renderHook(() => useProbe(), { wrapper });
    act(() => {
      result.current.store.newSession();
    });
    act(() => {
      result.current.store.pushStep({ kind: "extract-workbench", scenarioId: "utility" });
    });
    expect(result.current.stage).toBe("analyze");
    expect(result.current.preIntegrate).toBe(true);
  });

  it("maps the active integrate step to the integrate stage (NOT pre-Integrate)", () => {
    const { result } = renderHook(() => useProbe(), { wrapper });
    act(() => {
      result.current.store.newSession();
    });
    act(() => {
      result.current.store.pushStep({ kind: "integrate" });
    });
    expect(result.current.stage).toBe("integrate");
    expect(result.current.preIntegrate).toBe(false);
  });

  it("follows the active step as it moves (extract → integrate)", () => {
    const { result } = renderHook(() => useProbe(), { wrapper });
    act(() => {
      result.current.store.newSession();
    });
    act(() => {
      result.current.store.pushStep({ kind: "extract-workbench", scenarioId: "utility" });
    });
    expect(result.current.preIntegrate).toBe(true);
    act(() => {
      result.current.store.pushStep({ kind: "integrate" });
    });
    expect(result.current.preIntegrate).toBe(false);
  });
});
