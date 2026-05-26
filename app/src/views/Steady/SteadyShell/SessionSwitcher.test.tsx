import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatStoreProvider, useChatStore } from "@/contexts/ChatStoreContext";

import { SessionSwitcher } from "./SessionSwitcher";

function Harness({ children }: { children: React.ReactNode }) {
  return (
    <ChatStoreProvider initialOwnerKey="anon-test" autoSeedDefaultSession>
      {children}
    </ChatStoreProvider>
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

describe("SessionSwitcher", () => {
  it("hides the onboarding session by default (steady-mode list)", () => {
    render(
      <Harness>
        <SessionSwitcher />
      </Harness>,
    );
    // Auto-seeded onboarding session is hidden.
    expect(screen.getByText(/No sessions yet/i)).toBeInTheDocument();
  });

  it("shows non-onboarding sessions and marks the active one", () => {
    let api: ReturnType<typeof useChatStore> | null = null;
    render(
      <Harness>
        <Seeder onReady={(a) => (api = a)} />
        <SessionSwitcher />
      </Harness>,
    );
    expect(api).not.toBeNull();
    let firstId = "";
    act(() => {
      firstId = api!.newSession({ title: "Alpha" });
    });
    let secondId = "";
    act(() => {
      secondId = api!.newSession({ title: "Beta" });
    });
    // Beta was created most recently → switchTo set it active.
    expect(screen.getByTestId(`session-switcher-item-${secondId}`)).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId(`session-switcher-item-${firstId}`)).not.toHaveAttribute("data-active");

    fireEvent.click(screen.getByTestId(`session-switcher-item-${firstId}`));
    // Now Alpha is active.
    expect(screen.getByTestId(`session-switcher-item-${firstId}`)).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId(`session-switcher-item-${secondId}`)).not.toHaveAttribute("data-active");
  });

  it("creates and activates a new session when the New button is clicked", () => {
    let api: ReturnType<typeof useChatStore> | null = null;
    let createdId: string | null = null;
    render(
      <Harness>
        <Seeder onReady={(a) => (api = a)} />
        <SessionSwitcher onCreated={(id) => (createdId = id)} />
      </Harness>,
    );
    expect(api).not.toBeNull();
    fireEvent.click(screen.getByTestId("session-switcher-new"));
    expect(createdId).not.toBeNull();
    // The new session shows up in the list and is active.
    expect(screen.getByTestId(`session-switcher-item-${createdId}`)).toHaveAttribute("data-active", "true");
  });

  it("renders the onboarding session when hideOnboardingSession is false", () => {
    render(
      <Harness>
        <SessionSwitcher hideOnboardingSession={false} />
      </Harness>,
    );
    // The seeded onboarding session shows up.
    expect(screen.queryByText(/No sessions yet/i)).not.toBeInTheDocument();
    // Its title is whatever the seeder put — Onboarding-ish copy is the
    // default. We just check that at least one item exists.
    const items = screen.getAllByTestId(/session-switcher-item-/);
    expect(items.length).toBeGreaterThan(0);
  });
});
