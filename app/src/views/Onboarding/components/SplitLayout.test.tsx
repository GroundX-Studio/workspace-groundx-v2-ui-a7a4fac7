import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SplitLayout } from "./SplitLayout";
import { FlowProvider } from "../flow/FlowContext";

const renderSplit = () =>
  render(
    <FlowProvider>
      <SplitLayout />
    </FlowProvider>,
  );

describe("SplitLayout", () => {
  it("renders chat, canvas, and a draggable divider in split mode", () => {
    renderSplit();

    expect(screen.getByText("Conversation")).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "Resize chat and canvas" })).toBeInTheDocument();
  });

  it("hides the divider when the chat takes focus", () => {
    renderSplit();

    fireEvent.click(screen.getByRole("button", { name: "Focus chat" }));

    expect(screen.queryByRole("separator", { name: "Resize chat and canvas" })).not.toBeInTheDocument();
  });

  it("resizes via arrow keys on the divider", () => {
    renderSplit();

    const divider = screen.getByRole("separator", { name: "Resize chat and canvas" });
    const before = Number(divider.getAttribute("aria-valuenow"));
    fireEvent.keyDown(divider, { key: "ArrowRight" });

    const after = Number(
      screen.getByRole("separator", { name: "Resize chat and canvas" }).getAttribute("aria-valuenow"),
    );
    expect(after).toBe(before + 16);
  });
});
