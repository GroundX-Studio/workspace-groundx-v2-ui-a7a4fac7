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
});
