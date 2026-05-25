import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetEnsuredChatSessions } from "@/api/chatSessions";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { InteractView } from "./InteractView";

const originalFetch = global.fetch;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  __resetEnsuredChatSessions();
});

afterEach(() => {
  global.fetch = originalFetch;
});

function mockChatNetwork(reply: { answer: string; status?: number } = { answer: "Live reply for the user." }) {
  const ensure = { ok: true, status: 200, json: async () => ({ chatSessionId: "x", ownerUserId: null, ownerAnonId: "anon-x" }) };
  const status = reply.status ?? 200;
  const send = {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({
      userMessageId: "m-u",
      assistantMessageId: "m-a",
      reply: { mode: "rag", answer: reply.answer, citations: [], suggestedActions: [], tools: [] },
      compressionRan: false,
    }),
  };
  global.fetch = vi.fn().mockResolvedValueOnce(ensure).mockResolvedValueOnce(send);
}

const SessionProbe = ({ onSnapshot }: { onSnapshot: (snapshot: { frame: string; gateStatus: string }) => void }) => {
  const session = useOnboardingSession();
  onSnapshot({ frame: session.state.currentFrame, gateStatus: session.state.gate.status });
  return null;
};

describe("InteractView (F5)", () => {
  it("renders scenario chat script with citation chips", () => {
    renderWithOnboardingProviders(<InteractView />, { initialFrame: "f5", initialScenario: "loan" });

    expect(screen.getByText("Does this applicant meet our 35% DTI threshold?")).toBeInTheDocument();
    expect(screen.getByText(/Estimated DTI is 22%/)).toBeInTheDocument();
    expect(screen.getByTestId("cite-chip-1")).toHaveAttribute("data-citation-doc", "loan-doc-1");
  });

  it("posts the user turn to /api/chat/messages and renders the live assistant reply", async () => {
    mockChatNetwork({ answer: "Page 3 shows the value." });
    const user = userEvent.setup();

    renderWithOnboardingProviders(<InteractView />, { initialFrame: "f5", initialScenario: "utility" });

    await user.type(screen.getByLabelText("Chat input"), "Which page proves this?");
    await user.click(screen.getByLabelText("Send"));

    // User turn is optimistic — renders immediately.
    expect(screen.getByText("Which page proves this?")).toBeInTheDocument();
    expect(screen.getByLabelText("Chat input")).toHaveValue("");

    // Network fires: ensure-create + send.
    await waitFor(() => {
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual([
        "/api/chat-sessions",
        "/api/chat/messages",
      ]);
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

  it("falls back to a polite error message when the chat endpoint fails", async () => {
    // ensure-create succeeds; send returns 502.
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ chatSessionId: "x", ownerUserId: null, ownerAnonId: "anon-x" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: "router_failed:upstream" }),
      });

    const user = userEvent.setup();
    renderWithOnboardingProviders(<InteractView />, { initialFrame: "f5", initialScenario: "utility" });

    await user.type(screen.getByLabelText("Chat input"), "Will this fail?");
    await user.click(screen.getByLabelText("Send"));

    await waitFor(() => {
      expect(screen.getByText(/couldn'?t reach the chat service/i)).toBeInTheDocument();
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
});
