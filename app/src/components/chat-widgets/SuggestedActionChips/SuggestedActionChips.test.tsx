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
        role="anonymous"
        scope={{ type: "none" }}
      />,
    );
    expect(screen.getByTestId("suggested-action-chip-show-source")).toHaveTextContent(
      /show source/i,
    );
    expect(screen.getByTestId("suggested-action-chip-open-samples")).toHaveTextContent(
      /open samples/i,
    );
  });

  // 2026-05-30-widget-role-access Phase 2b: `mode` retired → `role`
  // (authorization) + `scope` (required, `{ type: "none" }` for this
  // display widget). Matrix row: all roles, no affordance lock.
  it.each(["anonymous", "member"] as const)(
    "mounts under role=%s and reflects it on data-role (widget contract)",
    (role) => {
      render(
        <SuggestedActionChips
          actions={[{ key: "k", label: "L" }]}
          role={role}
          scope={{ type: "none" }}
        />,
      );
      expect(screen.getByTestId("suggested-action-chips")).toHaveAttribute("data-role", role);
    },
  );

  it("renders identical chips for anonymous and member (matrix: no affordance lock)", () => {
    const actions = [
      { key: "show-source", label: "Show source" },
      { key: "open-samples", label: "Open samples" },
    ];
    const { rerender } = render(
      <SuggestedActionChips actions={actions} role="anonymous" scope={{ type: "none" }} />,
    );
    const anonChips = screen.getAllByRole("button").map((c) => c.getAttribute("data-action-key"));
    rerender(<SuggestedActionChips actions={actions} role="member" scope={{ type: "none" }} />);
    const memberChips = screen
      .getAllByRole("button")
      .map((c) => c.getAttribute("data-action-key"));
    expect(memberChips).toEqual(anonChips);
    expect(memberChips).toEqual(["show-source", "open-samples"]);
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
        role="anonymous"
        scope={{ type: "none" }}
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
    const { container } = render(
      <SuggestedActionChips actions={[]} role="anonymous" scope={{ type: "none" }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("keyboard Enter activates a chip (a11y)", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <SuggestedActionChips
        actions={[{ key: "show-source", label: "Show source" }]}
        role="anonymous"
        scope={{ type: "none" }}
        onAction={onAction}
      />,
    );
    const chip = screen.getByTestId("suggested-action-chip-show-source");
    chip.focus();
    await user.keyboard("{Enter}");
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
