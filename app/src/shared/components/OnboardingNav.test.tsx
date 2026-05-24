import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { OnboardingNav, useOnboardingNavCollapsed } from "./OnboardingNav";

const STORAGE_KEY = "groundx-onboarding.nav-collapsed.v1";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("OnboardingNav", () => {
  it("renders in expanded mode by default, showing labeled W/P/Docs + the Book-a-call CTA", () => {
    render(<OnboardingNav accountState="loggedOut" collapsed={false} onToggleCollapsed={() => {}} />);
    // Top section: Workspaces + Projects, labeled, but visually disabled for loggedOut.
    const workspaces = screen.getByTestId("onboarding-nav-item-workspaces");
    expect(workspaces).toHaveTextContent(/Workspaces/);
    expect(workspaces).toHaveAttribute("aria-disabled", "true");
    const projects = screen.getByTestId("onboarding-nav-item-projects");
    expect(projects).toHaveTextContent(/Projects/);
    expect(projects).toHaveAttribute("aria-disabled", "true");
    // Bottom: Book a call CTA + Docs.
    expect(screen.getByTestId("onboarding-nav-cta-call")).toHaveTextContent(/Book a call/i);
    expect(screen.getByTestId("onboarding-nav-item-docs")).toHaveTextContent(/Docs/);
  });

  it("expanded rows show ONLY the label, not the initial letter (mutually exclusive)", () => {
    // Bug fix — expanded rows previously showed both "W  Workspaces"
    // which read as a redundant prefix. Spec: initial when
    // collapsed, label when expanded; never both.
    render(<OnboardingNav accountState="loggedOut" collapsed={false} onToggleCollapsed={() => {}} />);
    const workspaces = screen.getByTestId("onboarding-nav-item-workspaces");
    // No standalone "W" initial in the expanded row.
    expect(workspaces.textContent ?? "").not.toMatch(/^W\s+Workspaces/);
    // Just the label.
    expect((workspaces.textContent ?? "").trim()).toBe("Workspaces");
    const docs = screen.getByTestId("onboarding-nav-item-docs");
    expect((docs.textContent ?? "").trim()).toBe("Docs");
  });

  it("hides text labels in collapsed mode, leaving icon initials", () => {
    render(<OnboardingNav accountState="loggedOut" collapsed={true} onToggleCollapsed={() => {}} />);
    // In collapsed mode the visible label text is replaced by the initial.
    // Workspaces becomes "W" only; the long word should not be visible.
    const workspaces = screen.getByTestId("onboarding-nav-item-workspaces");
    expect(workspaces.textContent ?? "").not.toMatch(/Workspaces/);
    expect(workspaces.textContent ?? "").toMatch(/^W$/);
    // The CTA collapses to just the star initial too.
    const cta = screen.getByTestId("onboarding-nav-cta-call");
    expect(cta.textContent ?? "").not.toMatch(/Book a call/i);
  });

  it("calls onToggleCollapsed when the chevron is clicked", () => {
    let toggled = 0;
    render(
      <OnboardingNav
        accountState="loggedOut"
        collapsed={false}
        onToggleCollapsed={() => {
          toggled += 1;
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("onboarding-nav-toggle"));
    expect(toggled).toBe(1);
  });

  it("clicking Workspaces while signed in fires onItemClick (hard-reload handler lives in the shell)", () => {
    let clicked: string | null = null;
    render(
      <OnboardingNav
        accountState="free"
        collapsed={false}
        onToggleCollapsed={() => {}}
        onItemClick={(key) => {
          clicked = key;
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("onboarding-nav-item-workspaces"));
    expect(clicked).toBe("workspaces");
  });

  it("logged-out disabled items do not fire onItemClick", () => {
    let clicked: string | null = null;
    render(
      <OnboardingNav
        accountState="loggedOut"
        collapsed={false}
        onToggleCollapsed={() => {}}
        onItemClick={(key) => {
          clicked = key;
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("onboarding-nav-item-workspaces"));
    fireEvent.click(screen.getByTestId("onboarding-nav-item-projects"));
    expect(clicked).toBeNull();
    // But Docs IS enabled even when logged out.
    fireEvent.click(screen.getByTestId("onboarding-nav-item-docs"));
    expect(clicked).toBe("docs");
  });
});

describe("useOnboardingNavCollapsed", () => {
  function Harness() {
    const [collapsed, setCollapsed] = useOnboardingNavCollapsed();
    return (
      <>
        <span data-testid="state">{collapsed ? "collapsed" : "expanded"}</span>
        <button data-testid="toggle" onClick={() => setCollapsed(!collapsed)}>
          toggle
        </button>
      </>
    );
  }

  it("defaults to expanded when localStorage is empty", () => {
    render(<Harness />);
    expect(screen.getByTestId("state")).toHaveTextContent("expanded");
  });

  it("rehydrates from localStorage on mount", () => {
    window.localStorage.setItem(STORAGE_KEY, "true");
    render(<Harness />);
    expect(screen.getByTestId("state")).toHaveTextContent("collapsed");
  });

  it("writes through to localStorage on change", () => {
    render(<Harness />);
    act(() => {
      screen.getByTestId("toggle").click();
    });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("true");
    expect(screen.getByTestId("state")).toHaveTextContent("collapsed");
  });
});
