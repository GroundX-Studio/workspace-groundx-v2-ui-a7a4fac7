import { StrictMode } from "react";
import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { OnboardingShell } from "./OnboardingShell";

const apiMocks = vi.hoisted(() => ({
  getGroundXDocument: vi.fn(async () => ({
    document: {
      documentId: "utility-bill-2026-04",
      fileName: "April 2026 Statement.pdf",
      filter: {},
    },
  })),
  getGroundXDocumentXray: vi.fn(async () => ({
    fileName: "utility-bill-april-2026.pdf",
    fileType: "pdf",
    fileSummary: "City of Windom utility bill",
    language: "English",
    sourceUrl: "https://upload.eyelevel.ai/prod/file/ssp/abc.pdf",
    documentPages: [
      {
        pageNumber: 1,
        pageUrl: "https://upload.eyelevel.ai/prod/page/1.jpg",
        width: 1700,
        height: 2200,
        chunks: [],
      },
    ],
    chunks: [],
  })),
  recordIntent: vi.fn(async () => {}),
}));

describe("anon session ordering (#8)", () => {
  it("waits for anon-session establishment before ensuring the chat row", async () => {
    const order: string[] = [];
    let resolveEstablish!: (value: { sessionId: string; anonymous: boolean }) => void;
    const establishPromise = new Promise<{ sessionId: string; anonymous: boolean }>((resolve) => {
      resolveEstablish = resolve;
    });
    const ensureAnonSession = vi.fn(async () => {
      order.push("establish");
      return establishPromise;
    });
    const ensureServerChatSession = vi.fn(async () => {
      order.push("ensure-chat-row");
    });

    renderWithOnboardingProviders(
      <StrictMode>
        <OnboardingShell />
      </StrictMode>,
      {
        initialFrame: "f2",
        initialScenario: "utility",
        api: {
          session: {
            ensureAnonSession,
          },
          chat: {
            ensureServerChatSession,
          },
          groundxDocuments: {
            getGroundXDocument: apiMocks.getGroundXDocument,
            getGroundXDocumentXray: apiMocks.getGroundXDocumentXray,
          },
          intent: {
            recordIntent: apiMocks.recordIntent,
          },
        },
      },
    );

    await waitFor(() => expect(ensureAnonSession).toHaveBeenCalled());
    expect(ensureServerChatSession).not.toHaveBeenCalled();

    resolveEstablish({ sessionId: "anon-session-1", anonymous: true });

    await waitFor(() => expect(ensureServerChatSession).toHaveBeenCalled());
    expect(order.at(-1)).toBe("ensure-chat-row");
  });
});
