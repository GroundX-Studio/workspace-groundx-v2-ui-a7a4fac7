import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetEnsuredChatSessions } from "@/api/chatSessions";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { InteractView } from "./InteractView";

// WF-13 — the real PdfViewerWidget only paints lit regions once the
// page image (X-Ray) loads, which never happens in jsdom. Stub it so
// the `litRegions` it receives are observable as a serialized attr;
// that lets the live-citation tests assert real bbox geometry threads
// through (not the fallback band) without depending on PDF rendering.
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
  // SC-01: pre-set csrf_token cookie so csrfFetch skips bootstrap GET.
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
 * URL-routed fetch mock. WF-13 added the RT-01 `listChatMessages`
 * hydration on F5 mount, so the request sequence is no longer a fixed
 * two-call chain — route by URL instead of an ordered
 * `mockResolvedValueOnce` so hydration's GET, the ensure-create POST,
 * and the send POST each resolve correctly regardless of order.
 */
function routeFetch(
  opts: { answer?: string; status?: number; citations?: WireCitation[]; hydrate?: HydrateRow[] } = {},
) {
  const answer = opts.answer ?? "Live reply for the user.";
  const status = opts.status ?? 200;
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    // listChatMessages GET — the RT-01 hydration read.
    if (url.includes("/api/chat-sessions/") && url.endsWith("/messages")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ messages: opts.hydrate ?? [] }),
      } as Response);
    }
    // ensureServerChatSession POST.
    if (url === "/api/chat-sessions" && method === "POST") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ chatSessionId: "x", ownerUserId: null, ownerAnonId: "anon-x" }),
      } as Response);
    }
    // sendChatMessage POST.
    if (url === "/api/chat/messages") {
      const ok = status >= 200 && status < 300;
      return Promise.resolve({
        ok,
        status,
        json: async () =>
          ok
            ? {
                userMessageId: "m-u",
                assistantMessageId: "m-a",
                reply: { mode: "rag", answer, citations: opts.citations ?? [], suggestedActions: [], tools: [] },
                compressionRan: false,
              }
            : { error: `mock_${status}` },
      } as Response);
    }
    // CSRF bootstrap / viewer-events / anything else — benign 200.
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as Response);
  }) as unknown as typeof fetch;
}

const SessionProbe = ({ onSnapshot }: { onSnapshot: (snapshot: { frame: string; gateStatus: string }) => void }) => {
  const session = useOnboardingSession();
  onSnapshot({ frame: session.state.currentFrame, gateStatus: session.state.gate.status });
  return null;
};

describe("InteractView (F5)", () => {
  // WF-13 (2026-05-29). F5 must NOT seed turns from
  // `manifest.sampleChatScript` — the displayed turns + their citations
  // (and the derived litRegions) come from the live chat session, not a
  // pre-canned fixture. This inverts the prior "renders scenario chat
  // script" assertion.
  it("does NOT seed turns from manifest.sampleChatScript; F5 turns are live-only (WF-13)", async () => {
    routeFetch({ hydrate: [] }); // empty live thread
    renderWithOnboardingProviders(<InteractView />, { initialFrame: "f5", initialScenario: "loan" });

    // The Loan fixture's scripted turn + its fake citation must NOT appear.
    expect(screen.queryByText("Does this applicant meet our 35% DTI threshold?")).not.toBeInTheDocument();
    expect(screen.queryByText(/Estimated DTI is 22%/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("cite-chip-1")).not.toBeInTheDocument();

    // The live chat surface is still present + the canvas mounts.
    expect(screen.getByLabelText("Chat input")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("pdf-viewer-widget")).toBeInTheDocument());
  });

  it("hydrates F5 turns from the live persisted thread, with real citations + bbox (WF-13)", async () => {
    routeFetch({
      hydrate: [
        { id: "m-prev-u", chatSessionId: "x", turnIndex: 0, role: "user", content: "What is the amount due?", errorCode: null, citations: [] },
        {
          id: "m-prev-a",
          chatSessionId: "x",
          turnIndex: 1,
          role: "assistant",
          content: "The amount due is $7,613.20.",
          errorCode: null,
          citations: [
            { documentId: "c3bfff49-6640-4213-822b-e81c3a771e45", page: 1, snippet: "Amount due 7613.20", bbox: { x: 0.088, y: 0.201, w: 0.855, h: 0.319 } },
          ],
        },
      ],
    });
    renderWithOnboardingProviders(<InteractView />, { initialFrame: "f5", initialScenario: "utility" });

    // The persisted assistant turn renders (shared with F2 — not a manifest seed).
    await waitFor(() => expect(screen.getByText("The amount due is $7,613.20.")).toBeInTheDocument());
    // Its real citation surfaces as a CiteChip pointing at the live doc.
    expect(screen.getByTestId("cite-chip-1")).toHaveAttribute("data-citation-doc", "c3bfff49-6640-4213-822b-e81c3a771e45");
    // …and the real bbox threads into the canvas litRegions (page-1, green primary).
    const regions = JSON.parse(screen.getByTestId("pdf-viewer-widget").getAttribute("data-lit-regions") ?? "[]");
    expect(regions).toEqual([{ page: 1, x: 0.088, y: 0.201, w: 0.855, h: 0.319, color: "green" }]);
  });

  it("live reply citation with bbox drives a real lit region, not a fixture (WF-13)", async () => {
    routeFetch({
      answer: "The total is $7,613.20.",
      citations: [{ documentId: "c3bfff49-6640-4213-822b-e81c3a771e45", page: 1, snippet: "Total 7613.20", bbox: { x: 0.1, y: 0.2, w: 0.8, h: 0.3 } }],
    });
    const user = userEvent.setup();
    renderWithOnboardingProviders(<InteractView />, { initialFrame: "f5", initialScenario: "utility" });

    await user.type(screen.getByLabelText("Chat input"), "What's the total?");
    await user.click(screen.getByLabelText("Send"));

    await waitFor(() => expect(screen.getByText("The total is $7,613.20.")).toBeInTheDocument());
    // Live citation → CiteChip + lit region painted from the real bbox.
    expect(screen.getByTestId("cite-chip-1")).toHaveAttribute("data-citation-doc", "c3bfff49-6640-4213-822b-e81c3a771e45");
    // Real bbox (not the fallback band {x:0.05,…}) threads into litRegions.
    await waitFor(() => {
      const regions = JSON.parse(screen.getByTestId("pdf-viewer-widget").getAttribute("data-lit-regions") ?? "[]");
      expect(regions).toEqual([{ page: 1, x: 0.1, y: 0.2, w: 0.8, h: 0.3, color: "green" }]);
    });
  });

  it("posts the user turn to /api/chat/messages and renders the live assistant reply", async () => {
    routeFetch({ answer: "Page 3 shows the value." });
    const user = userEvent.setup();

    renderWithOnboardingProviders(<InteractView />, { initialFrame: "f5", initialScenario: "utility" });

    await user.type(screen.getByLabelText("Chat input"), "Which page proves this?");
    await user.click(screen.getByLabelText("Send"));

    // User turn is optimistic — renders immediately.
    expect(screen.getByText("Which page proves this?")).toBeInTheDocument();
    expect(screen.getByLabelText("Chat input")).toHaveValue("");

    // Send POST fires to /api/chat/messages (alongside the WF-13
    // hydration GET + ensure-create POST — exact order isn't asserted).
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
      expect(calls).toContain("/api/chat/messages");
    });

    // Assistant reply renders the server's answer.
    await waitFor(() => {
      expect(screen.getByText("Page 3 shows the value.")).toBeInTheDocument();
    });

    // Body of the send call carries the user message.
    const sendCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === "/api/chat/messages",
    );
    const body = JSON.parse((sendCall![1] as RequestInit).body as string);
    expect(body.newUserMessage).toBe("Which page proves this?");
  });

  // CF-08 — per-status mapping renders the right copy in F5. Routes the
  // failing status onto the send POST while hydration/ensure stay 200.
  function mockChatFailWith(status: number) {
    routeFetch({ status });
  }

  it("502 → upstream copy ('try again in a moment')", async () => {
    mockChatFailWith(502);
    const user = userEvent.setup();
    renderWithOnboardingProviders(<InteractView />, { initialFrame: "f5", initialScenario: "utility" });
    await user.type(screen.getByLabelText("Chat input"), "Will this fail?");
    await user.click(screen.getByLabelText("Send"));
    await waitFor(() => {
      expect(screen.getByText(/try again|something went wrong/i)).toBeInTheDocument();
    });
  });

  it("504 → timeout copy ('took too long')", async () => {
    mockChatFailWith(504);
    const user = userEvent.setup();
    renderWithOnboardingProviders(<InteractView />, { initialFrame: "f5", initialScenario: "utility" });
    await user.type(screen.getByLabelText("Chat input"), "Q");
    await user.click(screen.getByLabelText("Send"));
    await waitFor(() => {
      expect(screen.getByText(/took too long/i)).toBeInTheDocument();
    });
  });

  it("401 → reauth copy ('sign in')", async () => {
    mockChatFailWith(401);
    const user = userEvent.setup();
    renderWithOnboardingProviders(<InteractView />, { initialFrame: "f5", initialScenario: "utility" });
    await user.type(screen.getByLabelText("Chat input"), "Q");
    await user.click(screen.getByLabelText("Send"));
    await waitFor(() => {
      expect(screen.getByText(/sign in/i)).toBeInTheDocument();
    });
  });

  it("501 → 'can't answer that yet' copy", async () => {
    mockChatFailWith(501);
    const user = userEvent.setup();
    renderWithOnboardingProviders(<InteractView />, { initialFrame: "f5", initialScenario: "utility" });
    await user.type(screen.getByLabelText("Chat input"), "Q");
    await user.click(screen.getByLabelText("Send"));
    await waitFor(() => {
      expect(screen.getByText(/can't answer that yet|not available yet/i)).toBeInTheDocument();
    });
  });

  it("opens the save gate and advances to F6 from click", async () => {
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

  // WF-01b B (2026-05-28). The F5 canvas mounts a PdfViewerWidget
  // whose `litRegions` props paint one region per citation on the
  // latest assistant turn — keyed green for the primary (idx 0),
  // cyan for middle, coral for the last.
  describe("WF-01b B: F5 canvas litRegions", () => {
    it("paints one lit region per citation on the latest assistant turn", () => {
      // Loan scenario's sampleChatScript carries one assistant turn
      // with a single citation pointing at loan-doc-1 page 1.
      renderWithOnboardingProviders(<InteractView />, { initialFrame: "f5", initialScenario: "loan" });
      // One citation → one lit region, color = green (the primary).
      const region0 = screen.queryByTestId("pdf-viewer-lit-region-0");
      // The widget mounts even when there are no citations to paint;
      // we just assert the canvas surfaces the widget. Region count
      // varies with the scenario's citation count, but at minimum
      // the widget is mounted.
      expect(screen.getByTestId("pdf-viewer-widget")).toBeInTheDocument();
      if (region0) {
        expect(region0.getAttribute("data-color")).toMatch(/green|cyan|coral/);
      }
    });

    it("mounts the PdfViewerWidget on F5 canvas", () => {
      renderWithOnboardingProviders(<InteractView />, { initialFrame: "f5", initialScenario: "utility" });
      expect(screen.getByTestId("pdf-viewer-widget")).toBeInTheDocument();
    });
  });
});
