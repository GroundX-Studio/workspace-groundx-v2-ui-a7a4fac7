import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetEnsuredChatSessions } from "@/api/chatSessions";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { InteractView } from "./InteractView";

// The real PdfViewerWidget only paints once the page image (X-Ray) loads,
// which never happens in jsdom. Stub it so the `litRegions` it receives are
// observable as a serialized attr — that's how we assert citation geometry
// threads into the canvas without depending on PDF rendering.
vi.mock("@/components/viewer-widgets/PdfViewer/PdfViewerWidget", () => ({
  PdfViewerWidget: ({ litRegions, targetPage }: { litRegions?: unknown[]; targetPage?: number | null }) => (
    <div
      data-testid="pdf-viewer-widget"
      data-lit-regions={JSON.stringify(litRegions ?? [])}
      data-target-page={targetPage == null ? undefined : String(targetPage)}
    />
  ),
}));

const originalFetch = global.fetch;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  __resetEnsuredChatSessions();
  if (typeof document !== "undefined") {
    document.cookie = "csrf_token=test-csrf-token; path=/";
  }
});

afterEach(() => {
  global.fetch = originalFetch;
});

type Bbox = { x: number; y: number; w: number; h: number };
type WireCitation = { documentId: string; page: number; snippet?: string; bbox?: Bbox };
type HydrateRow = {
  id: string;
  chatSessionId: string;
  turnIndex: number;
  role: "user" | "assistant" | "system";
  content: string;
  errorCode: string | null;
  citations: WireCitation[];
};

/**
 * URL-routed fetch mock. The canvas reads the shared chat thread via
 * `listChatMessages` (GET …/messages) to derive its lit regions.
 */
function routeFetch(opts: { hydrate?: HydrateRow[] } = {}) {
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/chat-sessions/") && url.endsWith("/messages")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ messages: opts.hydrate ?? [] }),
      } as Response);
    }
    if (url === "/api/chat-sessions") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ chatSessionId: "x", ownerUserId: null, ownerAnonId: "anon-x" }),
      } as Response);
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as Response);
  }) as unknown as typeof fetch;
}

const SessionProbe = ({ onSnapshot }: { onSnapshot: (snapshot: { frame: string; gateStatus: string }) => void }) => {
  const session = useOnboardingSession();
  onSnapshot({ frame: session.state.currentFrame, gateStatus: session.state.gate.status });
  return null;
};

describe("InteractView (F5) — doc-only canvas", () => {
  // P3.b (2026-05-29): the F5 canvas is the source-document viewer, NOT a
  // chat. The conversation lives in the shell's ChatColumn (single chat
  // surface). The canvas must NOT render a chat input, Send, or turns.
  it("renders the PdfViewerWidget and NO chat input / Send / turns in the canvas", async () => {
    routeFetch({ hydrate: [] });
    renderWithOnboardingProviders(<InteractView />, { initialFrame: "f5", initialScenario: "utility" });

    await waitFor(() => expect(screen.getByTestId("pdf-viewer-widget")).toBeInTheDocument());
    // No duplicate chat surface in the canvas (the "weird chat input" is gone).
    expect(screen.queryByLabelText("Chat input")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Send")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chat-turn-user")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chat-turn-assistant")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cite-chip-1")).not.toBeInTheDocument();
  });

  it("lights the canvas from the latest assistant turn's citations (real bbox, not a fixture)", async () => {
    routeFetch({
      hydrate: [
        { id: "m-u", chatSessionId: "x", turnIndex: 0, role: "user", content: "What is the service address?", errorCode: null, citations: [] },
        {
          id: "m-a",
          chatSessionId: "x",
          turnIndex: 1,
          role: "assistant",
          content: "The service address is 123 Main St.",
          errorCode: null,
          citations: [
            { documentId: "c3bfff49-6640-4213-822b-e81c3a771e45", page: 1, snippet: "Service address 123 Main St", bbox: { x: 0.088, y: 0.201, w: 0.855, h: 0.319 } },
          ],
        },
      ],
    });
    renderWithOnboardingProviders(<InteractView />, { initialFrame: "f5", initialScenario: "utility" });

    // The real bbox from the persisted thread threads into the canvas
    // litRegions (page 1, green primary) — no chat turns rendered here.
    await waitFor(() => {
      const regions = JSON.parse(screen.getByTestId("pdf-viewer-widget").getAttribute("data-lit-regions") ?? "[]");
      expect(regions).toEqual([{ page: 1, x: 0.088, y: 0.201, w: 0.855, h: 0.319, color: "green" }]);
    });
    expect(screen.queryByText("The service address is 123 Main St.")).not.toBeInTheDocument();
  });

  it("TODO(WF-05) TEMP: utility 'amount due' answer lights the curated cyan box (overrides the coarse X-Ray bbox)", async () => {
    routeFetch({
      hydrate: [
        { id: "m-u", chatSessionId: "x", turnIndex: 0, role: "user", content: "What is the total amount due?", errorCode: null, citations: [] },
        {
          id: "m-a",
          chatSessionId: "x",
          turnIndex: 1,
          role: "assistant",
          content: "The total amount due is $7,613.20.",
          errorCode: null,
          // A bbox IS present (WF-03 join) but coarse/wrong — the temp override
          // must replace it with the hand-placed amount-due box.
          citations: [
            { documentId: "c3bfff49-6640-4213-822b-e81c3a771e45", page: 1, snippet: "Amount Due        $ 7,613.20", bbox: { x: 0.088, y: 0.201, w: 0.855, h: 0.319 } },
          ],
        },
      ],
    });
    renderWithOnboardingProviders(<InteractView />, { initialFrame: "f5", initialScenario: "utility" });

    await waitFor(() => {
      const regions = JSON.parse(screen.getByTestId("pdf-viewer-widget").getAttribute("data-lit-regions") ?? "[]");
      // Curated cyan box, NOT the coarse X-Ray bbox.
      expect(regions).toEqual([{ page: 1, x: 0.548, y: 0.218, w: 0.4, h: 0.046, color: "cyan" }]);
    });
  });

  it("does NOT seed lit regions from a manifest chat script (live-only)", async () => {
    routeFetch({ hydrate: [] }); // empty live thread → no regions
    renderWithOnboardingProviders(<InteractView />, { initialFrame: "f5", initialScenario: "loan" });

    await waitFor(() => expect(screen.getByTestId("pdf-viewer-widget")).toBeInTheDocument());
    const regions = JSON.parse(screen.getByTestId("pdf-viewer-widget").getAttribute("data-lit-regions") ?? "[]");
    expect(regions).toEqual([]);
  });

  it("opens the save gate and advances to F6 from click", async () => {
    routeFetch();
    const user = userEvent.setup();
    let snapshot = { frame: "", gateStatus: "" };

    renderWithOnboardingProviders(
      <>
        <InteractView />
        <SessionProbe onSnapshot={(next) => (snapshot = next)} />
      </>,
      { initialFrame: "f5", initialScenario: "utility" },
    );

    await user.click(screen.getByTestId("advance-to-f6"));

    await waitFor(() => {
      expect(snapshot.frame).toBe("f6");
      expect(snapshot.gateStatus).toBe("open");
    });
  });

  it("opens the save gate from keyboard Space activation", async () => {
    routeFetch();
    const user = userEvent.setup();
    let snapshot = { frame: "", gateStatus: "" };

    renderWithOnboardingProviders(
      <>
        <InteractView />
        <SessionProbe onSnapshot={(next) => (snapshot = next)} />
      </>,
      { initialFrame: "f5", initialScenario: "utility" },
    );

    screen.getByTestId("advance-to-f6").focus();
    await user.keyboard(" ");

    await waitFor(() => {
      expect(snapshot.frame).toBe("f6");
      expect(snapshot.gateStatus).toBe("open");
    });
  });
});
