import { MotionConfig } from "framer-motion";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./AppShell";

// MUI ButtonBase ripple + framer-motion AnimatePresence both schedule
// deferred state updates that arrive after vitest tears down the harness.
// Override the global "throw on console.error" spy with a silent stub
// for this spec only.
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// Framer Motion runs deferred animations that fire setState after the test
// completes, triggering act() warnings. Forcing the reduced-motion path keeps
// all transitions instantaneous so the tests are deterministic.
const renderShell = (props: Partial<React.ComponentProps<typeof AppShell>> = {}) =>
  render(
    <MotionConfig reducedMotion="always">
      <AppShell
        nav={<div data-testid="nav">NAV</div>}
        chat={<div data-testid="chat">CHAT</div>}
        canvas={<div data-testid="canvas">CANVAS</div>}
        {...props}
      />
    </MotionConfig>
  );

describe("AppShell", () => {
  it("renders all three columns by default", () => {
    renderShell();
    expect(screen.getByTestId("nav")).toBeInTheDocument();
    expect(screen.getByTestId("chat")).toBeInTheDocument();
    expect(screen.getByTestId("canvas")).toBeInTheDocument();
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("hides nav when hideNav=true (F1)", () => {
    renderShell({ hideNav: true });
    // The nav column animates out; it doesn't render the nav children at all
    // once collapsed (AnimatePresence + key). Aria label should be missing.
    expect(screen.queryByLabelText("Primary navigation")).not.toBeInTheDocument();
  });

  it("nav column animates to the navWidth prop so collapsed-nav doesn't leave a ghost gap", () => {
    // Bug fix — when the OnboardingNav internally toggles to its
    // collapsed (48px) mode, the AppShell's surrounding <aside> stayed
    // pinned to 180px because the AppShell hardcoded NAV_WIDTH.
    // The result was a 132px-wide empty band of offwhite between the
    // nav items and the chat pane. Fix: accept `navWidth` from the
    // caller and animate the aside to that width.
    //
    // framer-motion under jsdom doesn't write the animate target to
    // inline `style.width`, so we sniff the prop it was given by
    // grabbing the rendered aside and reading the `data-app-shell-nav-width`
    // attribute we emit specifically to make this contract testable.
    renderShell({ navWidth: 48 });
    const aside = screen.getByLabelText("Primary navigation");
    expect(aside.getAttribute("data-app-shell-nav-width")).toBe("48");
  });

  it("falls back to the design default 180px nav width when navWidth is not passed", () => {
    renderShell();
    const aside = screen.getByLabelText("Primary navigation");
    expect(aside.getAttribute("data-app-shell-nav-width")).toBe("180");
  });

  it("hides canvas when mounted in focus-chat mode", () => {
    renderShell({ initialFocus: "focus-chat" });
    expect(screen.queryByTestId("appshell-canvas")).not.toBeInTheDocument();
  });

  it("focus-canvas hides chat (chat puck only)", () => {
    renderShell({ initialFocus: "focus-canvas" });
    // chat unmounts in focus-canvas
    expect(screen.queryByTestId("appshell-chat")).not.toBeInTheDocument();
  });

  it("separator carries role + a11y attributes", () => {
    renderShell();
    const separator = screen.getByRole("separator");
    expect(separator).toHaveAttribute("aria-orientation", "vertical");
    expect(separator).toHaveAttribute("aria-valuemin", "0");
    expect(separator).toHaveAttribute("aria-valuemax", "1200");
    expect(separator).toHaveAttribute("aria-valuenow", "360");
  });

  it("ArrowRight bumps the separator value (+16)", async () => {
    const user = userEvent.setup();
    renderShell();
    const separator = screen.getByRole("separator");
    separator.focus();
    await user.keyboard("{ArrowRight}");
    expect(separator).toHaveAttribute("aria-valuenow", "376");
  });

  it("ArrowLeft + Shift bumps with smaller step (-8)", async () => {
    const user = userEvent.setup();
    renderShell();
    const separator = screen.getByRole("separator");
    separator.focus();
    await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    expect(separator).toHaveAttribute("aria-valuenow", "352");
  });

  // ────────────────────────────────────────────────────────────────────────
  // Compact mode — applies below md (900px) on mobile + tablet portrait.
  //
  // Below md, the three-column split breaks: chat is pinned 360px and
  // canvas crushes to 0 width on a 375px mobile. Compact mode forces
  // focus-chat as the default, hides the nav into a hamburger-revealed
  // drawer, and exposes a chat/canvas swap button so the canvas is still
  // reachable. Pass `compact` explicitly in tests because jsdom's
  // matchMedia stub always returns false.
  // ────────────────────────────────────────────────────────────────────────
  describe("compact mode", () => {
    it("defaults to focus-chat so the chat pane fills the viewport", () => {
      renderShell({ compact: true });
      // canvas is hidden by default in compact mode; chat is visible
      expect(screen.queryByTestId("appshell-canvas")).not.toBeInTheDocument();
      expect(screen.getByTestId("chat")).toBeInTheDocument();
    });

    it("hides the nav from the inline flex row (it lives in the drawer)", () => {
      renderShell({ compact: true });
      // No <aside> — the nav slot isn't in the flex row in compact mode
      expect(screen.queryByLabelText("Primary navigation")).not.toBeInTheDocument();
      // The nav children are also NOT rendered until the drawer opens
      expect(screen.queryByTestId("nav")).not.toBeInTheDocument();
    });

    it("renders a sticky top bar with hamburger + chat/canvas swap buttons", () => {
      renderShell({ compact: true });
      expect(screen.getByTestId("appshell-compact-topbar")).toBeInTheDocument();
      expect(screen.getByTestId("appshell-compact-nav-toggle")).toBeInTheDocument();
      expect(screen.getByTestId("appshell-compact-view-toggle")).toBeInTheDocument();
    });

    it("does NOT render the compact top bar in desktop mode", () => {
      renderShell({ compact: false });
      expect(screen.queryByTestId("appshell-compact-topbar")).not.toBeInTheDocument();
    });

    it("clicking the hamburger reveals the nav drawer + its contents", async () => {
      const user = userEvent.setup();
      renderShell({ compact: true });
      // Drawer is closed at first; nav children unmounted
      expect(screen.queryByTestId("nav")).not.toBeInTheDocument();
      await user.click(screen.getByTestId("appshell-compact-nav-toggle"));
      // Drawer is open; nav children mounted
      expect(screen.getByTestId("appshell-compact-nav-drawer")).toBeInTheDocument();
      expect(screen.getByTestId("nav")).toBeInTheDocument();
    });

    it("clicking the backdrop closes the nav drawer", async () => {
      const user = userEvent.setup();
      renderShell({ compact: true });
      await user.click(screen.getByTestId("appshell-compact-nav-toggle"));
      expect(screen.getByTestId("appshell-compact-nav-drawer")).toBeInTheDocument();
      await user.click(screen.getByTestId("appshell-compact-nav-backdrop"));
      expect(screen.queryByTestId("appshell-compact-nav-drawer")).not.toBeInTheDocument();
    });

    it("clicking the view-swap button toggles between focus-chat and focus-canvas", async () => {
      const user = userEvent.setup();
      renderShell({ compact: true });
      // Starts in focus-chat — canvas is hidden
      expect(screen.queryByTestId("appshell-canvas")).not.toBeInTheDocument();
      expect(screen.getByTestId("chat")).toBeInTheDocument();
      // Click swap → focus-canvas
      await user.click(screen.getByTestId("appshell-compact-view-toggle"));
      expect(screen.queryByTestId("chat")).not.toBeInTheDocument();
      expect(screen.getByTestId("appshell-canvas")).toBeInTheDocument();
      // Click swap again → back to focus-chat
      await user.click(screen.getByTestId("appshell-compact-view-toggle"));
      expect(screen.getByTestId("chat")).toBeInTheDocument();
      expect(screen.queryByTestId("appshell-canvas")).not.toBeInTheDocument();
    });
  });
});
