import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SuggestedActionChips } from "./SuggestedActionChips";

describe("SuggestedActionChips", () => {
  it("renders one chip per action with a stable testid", () => {
    render(
      <SuggestedActionChips
        actions={[
          { key: "show-source", label: "Show source" },
          { key: "open-samples", label: "Open samples" },
        ]}
      />,
    );
    expect(screen.getByTestId("suggested-action-chip-show-source")).toHaveTextContent(
      /show source/i,
    );
    expect(screen.getByTestId("suggested-action-chip-open-samples")).toHaveTextContent(
      /open samples/i,
    );
  });

  it("reflects the mode prop on a data-mode attribute (widget contract)", () => {
    const { rerender } = render(
      <SuggestedActionChips actions={[{ key: "k", label: "L" }]} mode="onboarding" />,
    );
    expect(screen.getByTestId("suggested-action-chips")).toHaveAttribute(
      "data-mode",
      "onboarding",
    );
    rerender(<SuggestedActionChips actions={[{ key: "k", label: "L" }]} mode="steady" />);
    expect(screen.getByTestId("suggested-action-chips")).toHaveAttribute("data-mode", "steady");
  });

  it("clicking a chip fires onAction with the underlying action object", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <SuggestedActionChips
        actions={[
          {
            key: "suggested-intent",
            label: "Open the extract",
            detail: { intent: "show-extract", confidence: 0.91 },
          },
        ]}
        onAction={onAction}
      />,
    );
    await user.click(screen.getByTestId("suggested-action-chip-suggested-intent"));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({
      key: "suggested-intent",
      label: "Open the extract",
      detail: { intent: "show-extract", confidence: 0.91 },
    });
  });

  it("empty actions array renders nothing", () => {
    const { container } = render(<SuggestedActionChips actions={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("keyboard Enter activates a chip (a11y)", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <SuggestedActionChips
        actions={[{ key: "show-source", label: "Show source" }]}
        onAction={onAction}
      />,
    );
    const chip = screen.getByTestId("suggested-action-chip-show-source");
    chip.focus();
    await user.keyboard("{Enter}");
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
