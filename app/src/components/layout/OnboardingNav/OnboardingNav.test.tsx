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

  it("logo is clickable and fires onLogoClick (shell wires it to /onboarding navigate)", () => {
    let logoClicks = 0;
    render(
      <OnboardingNav
        accountState="loggedOut"
        collapsed={false}
        onToggleCollapsed={() => {}}
        onLogoClick={() => {
          logoClicks += 1;
        }}
      />,
    );
    const logo = screen.getByTestId("onboarding-nav-logo-button");
    expect(logo).toBeInTheDocument();
    // It's a button-equivalent — accessible name covers "home" intent.
    expect(logo.getAttribute("aria-label") ?? "").toMatch(/home|onboarding|groundx/i);
    fireEvent.click(logo);
    expect(logoClicks).toBe(1);
  });

  it("logo click is keyboard-activatable (Enter)", () => {
    let logoClicks = 0;
    render(
      <OnboardingNav
        accountState="loggedOut"
        collapsed={false}
        onToggleCollapsed={() => {}}
        onLogoClick={() => {
          logoClicks += 1;
        }}
      />,
    );
    const logo = screen.getByTestId("onboarding-nav-logo-button");
    fireEvent.keyDown(logo, { key: "Enter" });
    expect(logoClicks).toBe(1);
  });

  it("section-divider hairlines render as 1px high lines, not full-height gray rectangles", () => {
    // Bug fix — the JSX `<Box sx={{ height: 1, background: BORDER }} />`
    // LOOKED like a 1px hairline divider, but in MUI's sx system
    // `height: 1` means 100% of the parent (it's a fraction shorthand,
    // not "1px"). Two dividers each grabbed ~150px of column space and
    // showed up as big gray slabs in the live nav. The fix is the
    // string form `height: "1px"`.
    //
    // jsdom doesn't lay out, and MUI/Emotion serializes sx into
    // generated CSS rules rather than inline `style="height: …"`. So
    // we crack open the document's CSS stylesheets and find every rule
    // whose declarations claim the BORDER color background. Each one
    // is a divider candidate — its `height` declaration must read
    // "1px" (the fix) and never "100%" (the unitless-1 bug).
    const { container } = render(
      <OnboardingNav accountState="loggedOut" collapsed={false} onToggleCollapsed={() => {}} />,
    );
    expect(container.querySelector('[data-testid="onboarding-nav"]')).not.toBeNull();

    type DividerRule = { selector: string; height: string };
    const dividerRules: DividerRule[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = (sheet as CSSStyleSheet).cssRules;
      } catch {
        continue;
      }
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSStyleRule)) continue;
        const bg = rule.style.background || rule.style.backgroundColor;
        // BORDER is `rgba(41,51,92,0.1)`. Emotion may emit the literal
        // string or a normalized form; substring match is sufficient.
        const looksLikeBorderBg =
          /41,\s*51,\s*92/.test(bg) || /rgba\(41/.test(bg);
        if (!looksLikeBorderBg) continue;
        dividerRules.push({ selector: rule.selectorText, height: rule.style.height });
      }
    }
    // Sanity: we expect to find at least one divider rule. If none,
    // the test setup changed and this assertion is meaningless.
    expect(dividerRules.length).toBeGreaterThan(0);
    const offenders = dividerRules.filter(
      (r) => r.height !== "1px" && r.height !== "0" && r.height !== "0px",
    );
    expect(offenders).toEqual([]);
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

  it("no longer renders a chevron collapse toggle (dead UI removed 2026-05-25)", () => {
    // The chevron toggle was the manual collapse → 48px-rail
    // affordance. It became dead UI when:
    //   • the OnboardingShell now force-overrides collapsed=false
    //     whenever the viewport is ≥ md (900px); and
    //   • below 900px the AppShell hides the nav entirely behind a
    //     drawer (so a chevron inside the nav is unreachable).
    // Removing it both decludders the bottom of the nav and frees up
    // ~28px of vertical space for the items above.
    render(<OnboardingNav accountState="loggedOut" collapsed={false} onToggleCollapsed={() => {}} />);
    expect(screen.queryByTestId("onboarding-nav-toggle")).not.toBeInTheDocument();
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
