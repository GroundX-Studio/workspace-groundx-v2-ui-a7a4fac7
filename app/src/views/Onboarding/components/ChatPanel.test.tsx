import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChatPanel } from "./ChatPanel";
import { SAMPLES } from "../flow/flowData";

const utilityBill = SAMPLES.find((s) => s.id === "utility-bill")!;

describe("ChatPanel", () => {
  it("always renders the conversation header and a disabled question input", () => {
    render(<ChatPanel sample={null} />);

    expect(screen.getByText("Conversation")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("next question…")).toBeDisabled();
  });

  it("seeds the canonical Utility Bill exchange with a citation chip", () => {
    render(<ChatPanel sample={utilityBill} />);

    expect(screen.getByText("Extract every charge by meter")).toBeInTheDocument();
    expect(screen.getByText(/56 charges, 8 meters/)).toBeInTheDocument();
    expect(screen.getByText("[1] utility-bill p.2")).toBeInTheDocument();
  });
});
