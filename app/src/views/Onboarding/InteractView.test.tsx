import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetEnsuredChatSessions } from "@/api/chatSessions";
import { useChatStore } from "@/contexts/ChatStoreContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";
import type { Citation } from "@groundx/shared";

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

/**
 * Exposes the ChatStore `appendMessage` action so a test can write an
 * assistant turn (with citations) directly into the in-memory store —
 * the way ChatColumn now does — without any network round-trip.
 */
const AppendProbe = ({ onReady }: { onReady: (append: (content: string, citations: Citation[]) => void) => void }) => {
  const { appendMessage } = useChatStore();
  onReady((content, citations) => appendMessage({ role: "assistant", content, citations }));
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

  it("lights the canvas from the latest assistant turn's citations (real bbox), no chat text leak", async () => {
    routeFetch({ hydrate: [] });
    let append: ((content: string, citations: Citation[]) => void) | null = null;
    renderWithOnboardingProviders(
      <>
        <InteractView />
        <AppendProbe onReady={(fn) => (append = fn)} />
      </>,
      { initialFrame: "f5", initialScenario: "utility" },
    );

    await waitFor(() => expect(screen.getByTestId("pdf-viewer-widget")).toBeInTheDocument());
    act(() => {
      append?.("The service address is 123 Main St.", [
        { documentId: "c3bfff49-6640-4213-822b-e81c3a771e45", page: 1, snippet: "Service address 123 Main St", bbox: { x: 0.088, y: 0.201, w: 0.855, h: 0.319 } },
      ]);
    });

    // The real bbox from the appended turn threads into the canvas
    // litRegions (page 1, green primary) — no chat turns rendered here.
    await waitFor(() => {
      const regions = JSON.parse(screen.getByTestId("pdf-viewer-widget").getAttribute("data-lit-regions") ?? "[]");
      expect(regions).toEqual([{ page: 1, x: 0.088, y: 0.201, w: 0.855, h: 0.319, color: "green" }]);
    });
    expect(screen.queryByText("The service address is 123 Main St.")).not.toBeInTheDocument();
  });

  // The demo hack (UTILITY_AMOUNT_DUE_REGION + isUtilityAmountDue regex
  // override) is REMOVED per item 6 — the lit region now renders the answer
  // citation's REAL bbox, even for the utility "amount due" answer. (If that
  // box is too coarse, the fix is word-level geometry, WF-05 `-118-map`, a
  // separate ticket — not a hardcoded box.)
  it("utility 'amount due' answer renders the REAL citation bbox (no curated override)", async () => {
    routeFetch({ hydrate: [] });
    let append: ((content: string, citations: Citation[]) => void) | null = null;
    renderWithOnboardingProviders(
      <>
        <InteractView />
        <AppendProbe onReady={(fn) => (append = fn)} />
      </>,
      { initialFrame: "f5", initialScenario: "utility" },
    );

    await waitFor(() => expect(screen.getByTestId("pdf-viewer-widget")).toBeInTheDocument());
    act(() => {
      append?.("The total amount due is $7,613.20.", [
        { documentId: "c3bfff49-6640-4213-822b-e81c3a771e45", page: 1, snippet: "Amount Due        $ 7,613.20", bbox: { x: 0.088, y: 0.201, w: 0.855, h: 0.319 } },
      ]);
    });

    await waitFor(() => {
      const regions = JSON.parse(screen.getByTestId("pdf-viewer-widget").getAttribute("data-lit-regions") ?? "[]");
      // The REAL bbox, NOT the retired cyan curated box.
      expect(regions).toEqual([{ page: 1, x: 0.088, y: 0.201, w: 0.855, h: 0.319, color: "green" }]);
    });
  });

  // Item 6 (core-data-model-hardening): citations are promoted onto the
  // in-memory ChatMessage. A citation written on append (the way ChatColumn
  // now writes assistant turns) must be read by InteractView WITHOUT polling
  // the API. We route the messages endpoint to ALWAYS return an empty thread,
  // so if InteractView still depended on the poll the regions would stay [].
  it("lights the canvas from a ChatStore-appended assistant turn, no API poll", async () => {
    routeFetch({ hydrate: [] }); // poll, if any, yields zero citations
    let append: ((content: string, citations: Citation[]) => void) | null = null;

    renderWithOnboardingProviders(
      <>
        <InteractView />
        <AppendProbe onReady={(fn) => (append = fn)} />
      </>,
      { initialFrame: "f5", initialScenario: "utility" },
    );

    await waitFor(() => expect(screen.getByTestId("pdf-viewer-widget")).toBeInTheDocument());
    // No poll has produced any region yet.
    expect(
      JSON.parse(screen.getByTestId("pdf-viewer-widget").getAttribute("data-lit-regions") ?? "[]"),
    ).toEqual([]);

    // Write the assistant turn + its real-bbox citation straight into
    // ChatStore (no network).
    act(() => {
      append?.("The service address is 123 Main St.", [
        {
          documentId: "c3bfff49-6640-4213-822b-e81c3a771e45",
          page: 1,
          snippet: "Service address 123 Main St",
          bbox: { x: 0.088, y: 0.201, w: 0.855, h: 0.319 },
        },
      ]);
    });

    // The lit region reflects the appended citation's real bbox — proving
    // the consumer read from ChatStore, not the (empty) poll.
    await waitFor(() => {
      const regions = JSON.parse(
        screen.getByTestId("pdf-viewer-widget").getAttribute("data-lit-regions") ?? "[]",
      );
      expect(regions).toEqual([{ page: 1, x: 0.088, y: 0.201, w: 0.855, h: 0.319, color: "green" }]);
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
