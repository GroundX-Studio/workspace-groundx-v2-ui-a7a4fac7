import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useChatStore } from "@/contexts/ChatStoreContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { IntentDebugPanel } from "./IntentDebugPanel";

/** Surfaces the active doc-viewer step so we can prove a Fire moved the canvas. */
function ViewerProbe() {
  const { state } = useChatStore();
  const sid = state.activeSessionId;
  const session = sid ? state.sessions.get(sid) : null;
  const idx = session?.viewer.currentStep.stepIndex ?? -1;
  const top = idx >= 0 ? session?.viewer.history[idx] : null;
  return (
    <div data-testid="viewer-step">
      {top && top.kind === "doc-viewer" ? `${top.documentId}|${top.page}` : "none"}
    </div>
  );
}

/** Surfaces the active session's added schema fields (script-fixture sink). */
function SchemaProbe() {
  const { state } = useChatStore();
  const sid = state.activeSessionId;
  const session = sid ? (state.sessions.get(sid) as { pendingSchemaOverlay?: { addedFields: unknown[] } } | undefined) : null;
  return <div data-testid="added-fields">{session?.pendingSchemaOverlay?.addedFields.length ?? 0}</div>;
}

describe("IntentDebugPanel", () => {
  it("lists every fixture and fires one INTO the live canvas sink (no network)", async () => {
    renderWithOnboardingProviders(
      <>
        <IntentDebugPanel />
        <ViewerProbe />
      </>,
      { initialFrame: "f5", initialScenario: "utility" },
    );

    expect(screen.getByTestId("intent-debug-panel")).toBeInTheDocument();
    const fire = screen.getByTestId("intent-debug-fire-highlightCitation");

    await act(async () => {
      fire.click();
    });

    await waitFor(() =>
      expect(screen.getByTestId("viewer-step")).toHaveTextContent(
        "c3bfff49-6640-4213-822b-e81c3a771e45|2",
      ),
    );
  });

  // Adversarial-review fix: a `script` fixture (acceptSchemaField) must fire its
  // FULL seed→accept in the live harness — not just the seed. Needs the live
  // `getSession` + a real `flush` the panel now provides.
  it("fires a script fixture (acceptSchemaField) fully — seed then accept", async () => {
    // The harness script dispatches outside act() + awaits a real setTimeout;
    // suppress the act-warning spy for this async path (same as DebugOverlay Reset).
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderWithOnboardingProviders(
      <>
        <IntentDebugPanel />
        <SchemaProbe />
      </>,
      { initialFrame: "f3a", initialScenario: "utility" },
    );

    await act(async () => {
      screen.getByTestId("intent-debug-fire-acceptSchemaField").click();
    });

    // The proposal was seeded AND accepted → a field landed in addedFields.
    await waitFor(() => expect(screen.getByTestId("added-fields")).toHaveTextContent("1"), {
      timeout: 3000,
    });
    errSpy.mockRestore();
  });
});
