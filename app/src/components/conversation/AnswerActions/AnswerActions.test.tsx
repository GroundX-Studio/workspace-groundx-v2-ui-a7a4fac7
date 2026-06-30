import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AnswerActions } from "./AnswerActions";

describe("AnswerActions (report-pin-affordance T3)", () => {
  it("renders nothing for an empty action list", () => {
    const { container } = render(<AnswerActions actions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("ONE action → a single inline control (no kebab)", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<AnswerActions actions={[{ id: "pin", label: "Pin to report", icon: "📌", onSelect }]} />);
    expect(screen.queryByTestId("answer-actions-kebab")).not.toBeInTheDocument();
    const btn = screen.getByTestId("answer-action-pin");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn).toHaveAccessibleName("Pin to report");
    await user.click(btn);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("ONE action with a `node` → renders the node inline (the compact pin widget host)", () => {
    render(
      <AnswerActions
        actions={[{ id: "pin", label: "Pin to report", icon: "📌", node: <button data-testid="pin-node">📌</button> }]}
      />,
    );
    expect(screen.getByTestId("pin-node")).toBeInTheDocument();
    expect(screen.queryByTestId("answer-actions-kebab")).not.toBeInTheDocument();
  });

  // The ≥2 branch is the composable axis — exercised NOW (not dormant) with a
  // synthetic 2-action fixture: same component, no call-site change.
  it("TWO+ actions → a kebab (⋯) menu listing them; selecting fires the action", async () => {
    const pin = vi.fn();
    const copy = vi.fn();
    const user = userEvent.setup();
    render(
      <AnswerActions
        actions={[
          { id: "pin", label: "Pin to report", icon: "📌", onSelect: pin },
          { id: "copy", label: "Copy answer", icon: "⧉", onSelect: copy },
        ]}
      />,
    );
    // Collapsed: a kebab trigger, no menu yet.
    const kebab = screen.getByTestId("answer-actions-kebab");
    expect(kebab).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu", { name: /answer actions/i })).not.toBeInTheDocument();

    // Open → both actions listed by label.
    await act(async () => {
      await user.click(kebab);
    });
    const menu = screen.getByRole("menu", { name: /answer actions/i });
    expect(within(menu).getByTestId("answer-action-pin")).toHaveTextContent("Pin to report");
    expect(within(menu).getByTestId("answer-action-copy")).toHaveTextContent("Copy answer");

    // Selecting fires that action's handler + closes the menu.
    await act(async () => {
      await user.click(within(menu).getByTestId("answer-action-copy"));
    });
    expect(copy).toHaveBeenCalledTimes(1);
    expect(pin).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("menu", { name: /answer actions/i })).not.toBeInTheDocument());
  });
});
