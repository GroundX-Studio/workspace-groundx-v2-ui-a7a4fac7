/**
 * ARCH-11 (2026-05-26): ThinkingStream chat-widget contract tests.
 *
 * The widget owns the timed reveal of a list of "the model is
 * thinking" notes, plus the per-scenario sessionStorage replay guard.
 * Extracted from `OnboardingChatColumn`'s F2ConversationFlow so the
 * same beat can play in steady mode when a real document is parsing.
 */

import { act, render, screen } from "@testing-library/react";
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
    render(<ThinkingStream notes={NOTES} scenarioKey="utility" />);
    expect(screen.getByTestId("thinking-note-0")).toBeInTheDocument();
    expect(screen.queryByTestId("thinking-note-1")).not.toBeInTheDocument();
  });

  it("renders all notes after enough time has advanced", async () => {
    render(<ThinkingStream notes={NOTES} scenarioKey="utility" />);
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
    render(<ThinkingStream notes={NOTES} scenarioKey="utility" onDone={onDone} />);
    await drainCascadingTimers();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("persists the done state in sessionStorage (per scenarioKey)", async () => {
    const { unmount } = render(<ThinkingStream notes={NOTES} scenarioKey="utility" />);
    await drainCascadingTimers();
    unmount();
    // Key is namespaced so two scenarios don't collide.
    expect(window.sessionStorage.getItem("groundx-onboarding.thinking-stream-done.utility")).toBe("1");
  });

  it("subsequent mount with the same scenarioKey skips the reveal (replay guard)", () => {
    // Seed the persisted flag — simulates a previous mount that played to done.
    window.sessionStorage.setItem("groundx-onboarding.thinking-stream-done.utility", "1");
    const onDone = vi.fn();
    render(<ThinkingStream notes={NOTES} scenarioKey="utility" onDone={onDone} />);
    // All notes visible immediately, onDone fires on mount (no timer dance).
    expect(screen.getByTestId("thinking-note-0")).toBeInTheDocument();
    expect(screen.getByTestId("thinking-note-3")).toBeInTheDocument();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when notes is empty (fires onDone immediately)", () => {
    const onDone = vi.fn();
    render(<ThinkingStream notes={[]} scenarioKey="utility" onDone={onDone} />);
    expect(screen.queryByTestId("thinking-note-0")).not.toBeInTheDocument();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("mode='steady' does NOT persist done state (each upload is unique)", async () => {
    const { unmount } = render(<ThinkingStream notes={NOTES} scenarioKey="upload-abc" mode="steady" />);
    await drainCascadingTimers();
    unmount();
    expect(window.sessionStorage.getItem("groundx-onboarding.thinking-stream-done.upload-abc")).toBeNull();
  });

  it("accepts the `mode` prop per the widget contract", () => {
    // Just a type-level smoke test — if the prop accepted shape changes,
    // this file fails to compile. Both values valid.
    render(<ThinkingStream notes={NOTES} scenarioKey="a" mode="onboarding" />);
    render(<ThinkingStream notes={NOTES} scenarioKey="b" mode="steady" />);
    expect(true).toBe(true);
  });
});
