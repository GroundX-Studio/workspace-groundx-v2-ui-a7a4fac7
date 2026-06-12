/**
 * ARCH-11 (2026-05-26): ThinkingStream chat-widget contract tests.
 *
 * The widget owns the timed reveal of a list of "the model is
 * thinking" notes, plus the per-scenario sessionStorage replay guard.
 * Extracted from `OnboardingChatColumn`'s F2ConversationFlow so the
 * same beat can play in steady mode when a real document is parsing.
 *
 * 2026-05-30-widget-role-access Phase 2b: migrated from the binary
 * `mode: "onboarding" | "steady"` prop to the role+scope contract.
 *   • `role: WidgetRole` — required, cosmetic here (no affordance lock).
 *     The widget is all-roles (matrix §1: anonymous ✅ / member ✅).
 *   • `scope: WidgetScope` — required, `{ type: "none" }` (display
 *     widget — matrix §1b).
 *   • `persistReplay` — the replay/remount guard, RE-SOURCED from the
 *     old `mode` to the widget's own replay concern. NOT role: a member
 *     replaying a unique upload persists nothing; an anonymous user
 *     replaying scripted onboarding notes persists. The host decides.
 */

import { act, render, screen } from "@testing-library/react";
import type { WidgetRole } from "@groundx/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThinkingStream } from "./ThinkingStream";

/**
 * Drain a cascade of fake setTimeouts where each timer's callback
 * schedules the next via a React useEffect. vi.runAllTimersAsync
 * alone returns after the current queue empties — it doesn't loop to
 * pick up timers scheduled by React effects that committed during
 * the drain. We loop until two consecutive drains add nothing new.
 */
async function drainCascadingTimers(maxIterations = 50): Promise<void> {
  for (let i = 0; i < maxIterations; i++) {
    const pendingBefore = vi.getTimerCount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    const pendingAfter = vi.getTimerCount();
    if (pendingBefore === 0 && pendingAfter === 0) return;
  }
}

const NOTES = [
  "parsing layout · 8 rows",
  "found header · account 1023456",
  "extracting line items",
  "done.",
];

const ROLES: WidgetRole[] = ["anonymous", "member"];

beforeEach(() => {
  vi.useFakeTimers();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  window.sessionStorage.clear();
});

describe("ThinkingStream", () => {
  it("renders only the first note initially (timer-driven reveal)", () => {
    render(
      <ThinkingStream notes={NOTES} scenarioKey="utility" role="anonymous" scope={{ type: "none" }} />,
    );
    expect(screen.getByTestId("thinking-note-0")).toBeInTheDocument();
    expect(screen.queryByTestId("thinking-note-1")).not.toBeInTheDocument();
  });

  it("renders all notes after enough time has advanced", async () => {
    render(
      <ThinkingStream notes={NOTES} scenarioKey="utility" role="anonymous" scope={{ type: "none" }} />,
    );
    // runAllTimersAsync handles the React-effect → schedule-next-
    // timer chain that plain advanceTimersByTime races against:
    // each note's setNoteCount triggers a re-render, the new
    // useEffect schedules the next setTimeout, runAllTimersAsync
    // continues processing until the queue drains.
    await drainCascadingTimers();
    expect(screen.getByTestId("thinking-note-0")).toBeInTheDocument();
    expect(screen.getByTestId("thinking-note-1")).toBeInTheDocument();
    expect(screen.getByTestId("thinking-note-2")).toBeInTheDocument();
    expect(screen.getByTestId("thinking-note-3")).toBeInTheDocument();
  });

  it("fires onDone after the last note + DONE_REVEAL_DELAY_MS", async () => {
    const onDone = vi.fn();
    render(
      <ThinkingStream
        notes={NOTES}
        scenarioKey="utility"
        role="anonymous"
        scope={{ type: "none" }}
        onDone={onDone}
      />,
    );
    await drainCascadingTimers();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("persists the done state in sessionStorage when persistReplay (per scenarioKey)", async () => {
    const { unmount } = render(
      <ThinkingStream
        notes={NOTES}
        scenarioKey="utility"
        role="anonymous"
        scope={{ type: "none" }}
        persistReplay
      />,
    );
    await drainCascadingTimers();
    unmount();
    // Key is namespaced so two scenarios don't collide.
    expect(
      window.sessionStorage.getItem("groundx-onboarding.thinking-stream-done.utility"),
    ).toBe("1");
  });

  it("subsequent mount with the same scenarioKey skips the reveal (replay guard)", () => {
    // Seed the persisted flag — simulates a previous mount that played to done.
    window.sessionStorage.setItem("groundx-onboarding.thinking-stream-done.utility", "1");
    const onDone = vi.fn();
    render(
      <ThinkingStream
        notes={NOTES}
        scenarioKey="utility"
        role="anonymous"
        scope={{ type: "none" }}
        persistReplay
        onDone={onDone}
      />,
    );
    // All notes visible immediately, onDone fires on mount (no timer dance).
    expect(screen.getByTestId("thinking-note-0")).toBeInTheDocument();
    expect(screen.getByTestId("thinking-note-3")).toBeInTheDocument();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  // Canvas↔chat coherence (2026-06-11): when the stream is about to ANIMATE
  // from scratch (not a replay-restore), the host must be able to react —
  // e.g. the onboarding Intro snaps the canvas back to Understand so the
  // scan narration never plays over a later frame. `onWillPlay` fires once
  // on mount IFF the reveal will actually animate.
  it("fires onWillPlay once on mount when the reveal will animate", () => {
    const onWillPlay = vi.fn();
    render(
      <ThinkingStream
        notes={NOTES}
        scenarioKey="utility"
        role="anonymous"
        scope={{ type: "none" }}
        persistReplay
        onWillPlay={onWillPlay}
      />,
    );
    expect(onWillPlay).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire onWillPlay on a replay-restore (doneness persisted)", () => {
    window.sessionStorage.setItem("groundx-onboarding.thinking-stream-done.utility", "1");
    const onWillPlay = vi.fn();
    render(
      <ThinkingStream
        notes={NOTES}
        scenarioKey="utility"
        role="anonymous"
        scope={{ type: "none" }}
        persistReplay
        onWillPlay={onWillPlay}
      />,
    );
    expect(onWillPlay).not.toHaveBeenCalled();
  });

  it("does NOT fire onWillPlay when notes is empty (nothing to animate)", () => {
    const onWillPlay = vi.fn();
    render(
      <ThinkingStream
        notes={[]}
        scenarioKey="utility"
        role="anonymous"
        scope={{ type: "none" }}
        onWillPlay={onWillPlay}
      />,
    );
    expect(onWillPlay).not.toHaveBeenCalled();
  });

  it("renders nothing when notes is empty (fires onDone immediately)", () => {
    const onDone = vi.fn();
    render(
      <ThinkingStream
        notes={[]}
        scenarioKey="utility"
        role="anonymous"
        scope={{ type: "none" }}
        onDone={onDone}
      />,
    );
    expect(screen.queryByTestId("thinking-note-0")).not.toBeInTheDocument();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("does NOT persist done state when persistReplay is false/omitted (each upload is unique)", async () => {
    const { unmount } = render(
      <ThinkingStream
        notes={NOTES}
        scenarioKey="upload-abc"
        role="member"
        scope={{ type: "none" }}
      />,
    );
    await drainCascadingTimers();
    unmount();
    expect(
      window.sessionStorage.getItem("groundx-onboarding.thinking-stream-done.upload-abc"),
    ).toBeNull();
  });

  // --- Role + scope contract (2026-05-30-widget-role-access §1, §1b) ---

  it.each(ROLES)(
    "mounts under role=%s — all-roles widget, no affordance lock (matrix §1)",
    (role) => {
      render(
        <ThinkingStream
          notes={NOTES}
          scenarioKey={`role-${role}`}
          role={role}
          scope={{ type: "none" }}
        />,
      );
      // Same render for every role: ThinkingStream locks no affordance
      // by role. The first note shows regardless of role.
      expect(screen.getByTestId("thinking-note-0")).toBeInTheDocument();
    },
  );

  it("persistReplay is role-independent (re-sourced from replay concern, not role)", async () => {
    // A member can persist (scripted replay) and an anonymous user can
    // skip persistence (unique stream) — proving persistReplay is NOT
    // derived from role.
    const { unmount } = render(
      <ThinkingStream
        notes={NOTES}
        scenarioKey="member-persists"
        role="member"
        scope={{ type: "none" }}
        persistReplay
      />,
    );
    await drainCascadingTimers();
    unmount();
    expect(
      window.sessionStorage.getItem("groundx-onboarding.thinking-stream-done.member-persists"),
    ).toBe("1");
  });

  it("declares scope { type: \"none\" } per the matrix (display widget)", () => {
    // Type-level + render smoke: a non-`none` scope is not this widget's
    // contract. `{ type: "none" }` is the only sensible scope here.
    render(
      <ThinkingStream
        notes={NOTES}
        scenarioKey="scope-none"
        role="anonymous"
        scope={{ type: "none" }}
      />,
    );
    expect(screen.getByTestId("thinking-note-0")).toBeInTheDocument();
  });
});
