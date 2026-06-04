import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatPanel } from "./ChatPanel";
import { SAMPLES } from "../flow/flowData";

const utilityBill = SAMPLES.find((s) => s.id === "utility-bill")!;

describe("ChatPanel", () => {
  it("always renders the conversation header and a disabled question input", () => {
    render(<ChatPanel sample={null} phase="understand" />);

    expect(screen.getByText("Conversation")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("ask anything…")).toBeDisabled();
  });

  it("streams Understand notes and offers Pick-a-view chips for the Utility Bill", () => {
    render(<ChatPanel sample={utilityBill} phase="understand" />);

    expect(screen.getByText(/Reading utility-bill\.pdf now/)).toBeInTheDocument();
    expect(screen.getByText(/Closing the document comprehension gap/)).toBeInTheDocument();
    expect(screen.getByText("Pick a view:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "meters" })).toBeInTheDocument();
  });

  it("invokes onPickView when a category chip is clicked", () => {
    const onPickView = vi.fn();
    render(<ChatPanel sample={utilityBill} phase="understand" onPickView={onPickView} />);

    fireEvent.click(screen.getByRole("button", { name: "statement" }));

    expect(onPickView).toHaveBeenCalledWith("statement");
  });
});
