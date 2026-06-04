import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Force the compact (tablet/mobile) viewport.
vi.mock("../useViewport", () => ({
  useViewport: () => ({
    viewport: "mobile",
    isMobile: true,
    isTablet: false,
    isCompact: true,
    isDesktopUp: false,
    isUltrawide: false,
  }),
}));

import { SplitLayout } from "./SplitLayout";
import { FlowProvider } from "../flow/FlowContext";

const renderCompact = () =>
  render(
    <FlowProvider>
      <SplitLayout />
    </FlowProvider>,
  );

describe("SplitLayout (compact)", () => {
  it("shows a Chat / Workspace tab switch and no drag handle", () => {
    renderCompact();

    expect(screen.getByRole("tab", { name: "Chat" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.queryByRole("separator", { name: "Resize chat and canvas" })).not.toBeInTheDocument();
  });

  it("switches the visible pane when a tab is clicked", () => {
    renderCompact();

    // Chat is the default pane.
    expect(screen.getByText("Conversation")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Workspace" }));

    // Workspace tab swaps the chat out for the canvas.
    expect(screen.queryByText("Conversation")).not.toBeInTheDocument();
  });
});
