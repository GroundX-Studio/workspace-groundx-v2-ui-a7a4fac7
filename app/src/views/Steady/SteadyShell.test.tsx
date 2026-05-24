import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatStoreProvider, useChatStore } from "@/contexts/ChatStoreContext";
import { ROUTER_PATHS } from "@/router/routerPaths";
import { GxThemeProvider } from "@/ThemeProvider";

import { SteadyShell } from "./SteadyShell";

function Harness({ initialUrl, children }: { initialUrl: string; children: React.ReactNode }) {
  return (
    <GxThemeProvider>
      <ChatStoreProvider ownerKey="anon-test" autoSeedDefaultSession>
        <MemoryRouter initialEntries={[initialUrl]}>
          <Routes>
            <Route path={ROUTER_PATHS.STEADY_SESSION} element={children} />
          </Routes>
        </MemoryRouter>
      </ChatStoreProvider>
    </GxThemeProvider>
  );
}

function Seeder({ onReady }: { onReady: (api: ReturnType<typeof useChatStore>) => void }) {
  const api = useChatStore();
  onReady(api);
  return null;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  window.localStorage.clear();
});

describe("SteadyShell (/c/:sessionId)", () => {
  it("renders the steady shell chrome with the sessionId from the URL", () => {
    render(
      <Harness initialUrl="/c/c-abc123">
        <SteadyShell />
      </Harness>,
    );
    expect(screen.getByTestId("steady-shell")).toBeInTheDocument();
    expect(screen.getByTestId("steady-shell-session-id")).toHaveTextContent("c-abc123");
  });

  it("switches ChatStore.activeSessionId to the URL session if it exists locally", () => {
    let api: ReturnType<typeof useChatStore> | null = null;
    let createdId = "";
    function SeedAndRender() {
      api = useChatStore();
      return null;
    }

    function Inner() {
      return (
        <>
          <SeedAndRender />
          <SteadyShell />
        </>
      );
    }
    // First mount a no-route Harness just to get an api handle for
    // seeding, then re-render with the URL pointed at the new session.
    const { rerender } = render(
      <Harness initialUrl="/c/placeholder">
        <Inner />
      </Harness>,
    );
    expect(api).not.toBeNull();
    act(() => {
      createdId = api!.newSession({ title: "Alpha" });
    });

    // Re-render at the URL for the just-created session. The
    // SteadyShell's useEffect calls switchTo(id) since the session
    // exists in the local store.
    rerender(
      <Harness initialUrl={`/c/${createdId}`}>
        <Inner />
      </Harness>,
    );
    expect(api!.state.activeSessionId).toBe(createdId);
    // Title from the seeded session shows in the shell heading.
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  it("surfaces an unknown-session hint when the URL points at a session not in the store", () => {
    render(
      <Harness initialUrl="/c/c-not-in-store">
        <SteadyShell />
      </Harness>,
    );
    expect(screen.getByTestId("steady-shell-unknown-session")).toBeInTheDocument();
  });
});
