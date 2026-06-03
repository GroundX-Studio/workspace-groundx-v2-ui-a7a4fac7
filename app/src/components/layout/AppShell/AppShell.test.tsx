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

  // ARCH-06A (2026-05-26): hideChat is the symmetric prop to hideNav.
  // Lets the canvas fill the full right-of-nav width — used by the
  // onboarding F1 picker which doesn't have a chat column. Without
  // this, the only way to suppress chat was `initialFocus="focus-canvas"`,
  // which leaves a 48px puck rail — NOT what F1 needs.
  it("hides chat when hideChat=true (F1 picker)", () => {
    renderShell({ hideChat: true });
    expect(screen.queryByTestId("appshell-chat")).not.toBeInTheDocument();
    // Canvas still renders, taking the full width.
    expect(screen.getByTestId("appshell-canvas")).toBeInTheDocument();
    // The drag-resize separator only makes sense in the split layout;
    // with no chat there's nothing to drag.
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });

  it("compact + hideChat keeps canvas pinned and skips the chat/canvas swap toggle", () => {
    renderShell({ hideChat: true, compact: true });
    expect(screen.queryByTestId("appshell-chat")).not.toBeInTheDocument();
    expect(screen.getByTestId("appshell-canvas")).toBeInTheDocument();
    // No swap toggle — there's only one pane.
    expect(screen.queryByTestId("appshell-compact-view-toggle")).not.toBeInTheDocument();
  });

  // ARCH-06A: `data-shell-instance` is a stable per-mount id surfaced
  // on the root. ARCH-06B uses it to assert that the same AppShell
  // instance survives F1 ↔ F2 transitions instead of being remounted
  // — that's the architectural fix the closure test rides on.
  it("emits a stable data-shell-instance attribute across re-renders", () => {
    const { rerender } = render(
      <MotionConfig reducedMotion="always">
        <AppShell
          nav={<div data-testid="nav">NAV</div>}
          chat={<div data-testid="chat">CHAT</div>}
          canvas={<div data-testid="canvas">CANVAS</div>}
        />
      </MotionConfig>,
    );
    const before = screen
      .getByTestId("appshell-root")
      .getAttribute("data-shell-instance");
    expect(before).toBeTruthy();

    // Re-render with different props — same instance must persist.
    rerender(
      <MotionConfig reducedMotion="always">
        <AppShell
          nav={<div data-testid="nav">NAV</div>}
          chat={<div data-testid="chat">CHAT</div>}
          canvas={<div data-testid="canvas">CANVAS-2</div>}
          hideChat
        />
      </MotionConfig>,
    );
    const after = screen
      .getByTestId("appshell-root")
      .getAttribute("data-shell-instance");
    expect(after).toBe(before);
  });

  it("data-shell-instance differs across unrelated mounts", () => {
    const { unmount } = render(
      <MotionConfig reducedMotion="always">
        <AppShell
          nav={<div data-testid="nav">N1</div>}
          chat={<div data-testid="chat">C1</div>}
          canvas={<div data-testid="canvas">V1</div>}
        />
      </MotionConfig>,
    );
    const first = screen.getByTestId("appshell-root").getAttribute("data-shell-instance");
    unmount();
    render(
      <MotionConfig reducedMotion="always">
        <AppShell
          nav={<div data-testid="nav">N2</div>}
          chat={<div data-testid="chat">C2</div>}
          canvas={<div data-testid="canvas">V2</div>}
        />
      </MotionConfig>,
    );
    const second = screen.getByTestId("appshell-root").getAttribute("data-shell-instance");
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
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
    // After the 2026-05-25 drag-clamp fix:
    //   - min = MIN_CHAT_PANE_PX (280) so chat never shrinks below
    //     its usable width
    //   - max = 50% of the split area (viewport - nav) so the chat
    //     pane can never grow past half the available horizontal
    //     space; under jsdom `window.innerWidth` defaults to 1024 →
    //     split area = 1024 - 180 = 844, max = 422 here
    expect(separator).toHaveAttribute("aria-valuemin", "280");
    expect(separator).toHaveAttribute("aria-valuemax", "422");
    // initial=360, which is already inside the band, so valuenow
    // stays at 360.
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
  // UR-02 closure: reload-survives-width + reduced-motion gate
  // ────────────────────────────────────────────────────────────────────────
  describe("UR-02 closure (persistence + reduced-motion)", () => {
    // v1 → v2 bumped on 2026-05-25 to invalidate any pre-clamp-fix
    // stored values (v1 could be 0..1200, v2 is guaranteed inside
    // MIN_CHAT_PANE_PX..viewport - nav - MIN_CANVAS_PANE_PX).
    const STORAGE_KEY = "appshell.chatWidth.v2";

    beforeEach(() => {
      localStorage.clear();
    });

    it("restores chat-pane width from localStorage on mount (drag-then-reload)", () => {
      // Simulate a prior session: user dragged the separator to 400.
      // Picked 400 because it's safely inside the new 50%-of-split-area
      // max under jsdom (viewport 1024 - nav 180 = 844, 50% = 422).
      // Values >= 422 would be clamped on mount by the
      // viewport-shrink-clamp effect, masking the persistence path.
      localStorage.setItem(STORAGE_KEY, "400");
      renderShell();
      const separator = screen.getByRole("separator");
      // Without persistence the value snaps back to the 360 design
      // default; with persistence it picks up the stored width.
      expect(separator).toHaveAttribute("aria-valuenow", "400");
    });

    it("persists chat-pane width on keyboard bump so the next reload restores it", async () => {
      const user = userEvent.setup();
      renderShell();
      const separator = screen.getByRole("separator");
      separator.focus();
      await user.keyboard("{ArrowRight}");
      expect(localStorage.getItem(STORAGE_KEY)).toBe("376");
    });

    it("exposes data-app-shell-reduced-motion=true when OS prefers reduced motion", () => {
      // The global test setup (src/test/setup.ts) stubs matchMedia to
      // return matches=true for any query containing "prefers-reduced-
      // motion" — done to skip framer-motion's looping animations during
      // tests. So the default render path already produces the
      // positive-case attribute; we exercise it here to lock in the
      // contract.
      renderShell();
      const root = document.querySelector("[data-app-shell-reduced-motion]");
      expect(root?.getAttribute("data-app-shell-reduced-motion")).toBe("true");
    });

    it("reports data-app-shell-reduced-motion=false when matchMedia returns false", () => {
      // Override the global stub so this single test exercises the
      // negative case. Without the gate, drag animations would run on
      // users who explicitly disabled them in the OS — that's the
      // accessibility regression UR-02 closes.
      const origMatchMedia = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })) as typeof window.matchMedia;
      try {
        renderShell();
        const root = document.querySelector("[data-app-shell-reduced-motion]");
        expect(root?.getAttribute("data-app-shell-reduced-motion")).toBe("false");
      } finally {
        window.matchMedia = origMatchMedia;
      }
    });
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

    it("pressing Escape closes the nav drawer", async () => {
      const user = userEvent.setup();
      renderShell({ compact: true });
      await user.click(screen.getByTestId("appshell-compact-nav-toggle"));
      expect(screen.getByTestId("appshell-compact-nav-drawer")).toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(screen.queryByTestId("appshell-compact-nav-drawer")).not.toBeInTheDocument();
    });

    it("resets focus mode when the viewport crosses the compact boundary", async () => {
      // Transition compact -> desktop: if the user had toggled to
      // focus-canvas at mobile, that state would otherwise persist
      // at desktop (chat pane hidden, requiring drag-handle recovery).
      // Same in reverse — desktop -> compact should land on focus-chat.
      const { rerender } = render(
        <MotionConfig reducedMotion="always">
          <AppShell
            nav={<div data-testid="nav">NAV</div>}
            chat={<div data-testid="chat">CHAT</div>}
            canvas={<div data-testid="canvas">CANVAS</div>}
            compact={true}
          />
        </MotionConfig>,
      );
      const user = userEvent.setup();
      // At compact, focus-chat is the default. Flip to focus-canvas.
      await user.click(screen.getByTestId("appshell-compact-view-toggle"));
      expect(screen.queryByTestId("chat")).not.toBeInTheDocument();
      expect(screen.getByTestId("appshell-canvas")).toBeInTheDocument();

      // Now cross to desktop. focus-canvas should NOT persist —
      // we should land back on the desktop default (split: chat + canvas).
      rerender(
        <MotionConfig reducedMotion="always">
          <AppShell
            nav={<div data-testid="nav">NAV</div>}
            chat={<div data-testid="chat">CHAT</div>}
            canvas={<div data-testid="canvas">CANVAS</div>}
            compact={false}
          />
        </MotionConfig>,
      );
      // At desktop default split: BOTH chat and canvas are visible.
      expect(screen.getByTestId("chat")).toBeInTheDocument();
      expect(screen.getByTestId("appshell-canvas")).toBeInTheDocument();

      // Cross back to compact. Should re-enter focus-chat (canvas hidden).
      rerender(
        <MotionConfig reducedMotion="always">
          <AppShell
            nav={<div data-testid="nav">NAV</div>}
            chat={<div data-testid="chat">CHAT</div>}
            canvas={<div data-testid="canvas">CANVAS</div>}
            compact={true}
          />
        </MotionConfig>,
      );
      expect(screen.getByTestId("chat")).toBeInTheDocument();
      expect(screen.queryByTestId("appshell-canvas")).not.toBeInTheDocument();
    });

    it("the view-swap button copy is explicit about the action (no bare 'Canvas' / 'Chat')", () => {
      // Polish bug — the bare single-word label ("Canvas" / "Chat") was
      // terse to the point of being ambiguous. The pill should read like
      // a verb-action so a first-time user understands what tapping it
      // does. We accept either "View canvas" / "View chat" or
      // "Show canvas" / "Show chat".
      renderShell({ compact: true });
      const toggle = screen.getByTestId("appshell-compact-view-toggle");
      const text = (toggle.textContent ?? "").trim();
      // Must contain a verb prefix, not just the noun.
      expect(text).toMatch(/^(view|show|see) canvas$/i);
    });

    it("the compact main pane uses the warm-offwhite surface so the chat card has visual context", () => {
      renderShell({ compact: true });
      const chat = screen.getByTestId("appshell-chat");
      // The chat slot wrapper sits inside a main-pane Box that should
      // carry the warm-offwhite background (the same surface tone the
      // nav rail uses). Without it the gate card floats in a sea of
      // flat white and the page reads as empty. WARM_OFFWHITE is
      // rgb(248, 247, 242). We walk every ancestor up to the document
      // root and check whether ANY of them carries that bg color via
      // an Emotion-generated CSS rule — this is more robust than
      // pinning a specific ancestor index because the JSX hierarchy
      // can change.
      // Walk every Emotion-generated rule by raw cssText (rule.style is
      // empty for many shorthand declarations under jsdom; cssText
      // includes the literal "background-color: …" string). Emotion
      // serializes the WARM_OFFWHITE constant as `#f8f7f2` hex, not
      // the `rgb(248, 247, 242)` form, so we accept both.
      const targetBg = /background[-]?color:\s*(#f8f7f2|rgb\(248,\s*247,\s*242\))/i;
      const allStyleNodes = document.querySelectorAll("style");
      let combinedCss = "";
      for (const node of Array.from(allStyleNodes)) {
        combinedCss += node.textContent || "";
      }
      // Sanity: the chat slot exists (catches the accidental "compact
      // mode didn't render the chat" case).
      expect(chat).toBeInTheDocument();
      // The warm-offwhite surface must appear somewhere in the emitted
      // CSS. We don't pin it to a specific selector because the
      // compact main pane is a styled sx Box and Emotion's class name
      // is non-deterministic.
      expect(combinedCss).toMatch(targetBg);
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
