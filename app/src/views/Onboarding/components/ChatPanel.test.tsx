import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatPanel } from "./ChatPanel";
import { getSampleData } from "../flow/extractionData";
import { SAMPLES } from "../flow/flowData";

const utilityBill = SAMPLES.find((s) => s.id === "utility-bill")!;
const loan = SAMPLES.find((s) => s.id === "loan-eligibility")!;
const data = getSampleData("utility-bill")!;

describe("ChatPanel", () => {
  it("renders the header and a disabled question input even with no sample", () => {
    render(<ChatPanel sample={null} frame="understand" wired={false} />);

    expect(screen.getByText("Conversation")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("ask anything…")).toBeDisabled();
  });

  it("streams Understand notes and offers Pick-a-view chips for a wired sample", () => {
    render(<ChatPanel sample={utilityBill} frame="understand" wired />);

    expect(screen.getByText(/Reading utility-bill\.pdf now/)).toBeInTheDocument();
    expect(screen.getByText(/Anchoring citations/)).toBeInTheDocument();
    expect(screen.getByText("Pick a view:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "meters" })).toBeInTheDocument();
  });

  it("invokes onPickView when a category chip is clicked", () => {
    const onPickView = vi.fn();
    render(<ChatPanel sample={utilityBill} frame="understand" wired onPickView={onPickView} />);

    fireEvent.click(screen.getByRole("button", { name: "statement" }));

    expect(onPickView).toHaveBeenCalledWith("statement");
  });

  it("renders a grounded comparison answer with citation chips (compare frame)", () => {
    render(
      <ChatPanel
        sample={utilityBill}
        frame="compare"
        wired
        comparisonQuestion={data.comparisonQuestion}
        comparisonAnswer={data.comparisonAnswer}
      />,
    );

    expect(screen.getByText("How does meter #3 compare to the others?")).toBeInTheDocument();
    expect(screen.getByText("[1]")).toBeInTheDocument();
    expect(screen.getByText("[4]")).toBeInTheDocument();
  });

  it("renders the inline sign-in gate when gateOpen", () => {
    render(<ChatPanel sample={utilityBill} frame="extract" wired gateOpen />);

    expect(screen.getByText("CONTINUE WITH…")).toBeInTheDocument();
    expect(screen.getByText(/One quick step/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Book a call" })).toBeInTheDocument();
  });

  it("renders booking context when booking", () => {
    render(<ChatPanel sample={utilityBill} frame="extract" wired booking />);

    expect(screen.getByRole("button", { name: "← back to sign-in" })).toBeInTheDocument();
  });

  it("renders the integrate Q&A in the integrate frame", () => {
    render(<ChatPanel sample={utilityBill} frame="integrate" wired />);

    expect(screen.getByText("how do I run this from my own code?")).toBeInTheDocument();
    expect(screen.getByText(/pick the one that fits your stack/)).toBeInTheDocument();
  });

  it("shows a coming-soon message for an unwired sample", () => {
    render(<ChatPanel sample={loan} frame="understand" wired={false} />);

    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });
});
