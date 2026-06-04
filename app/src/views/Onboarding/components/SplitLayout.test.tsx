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
});
