/**
 * Widget Template — canonical tests.
 *
 * **COPY THIS FILE** alongside `Template.tsx` when you copy the
 * `_template/` dir. The three tests below are the floor every widget
 * must ship:
 *
 *   1. Mounts in both `onboarding` and `steady` modes without crashing
 *   2. Locked affordance ABSENT under `mode="onboarding"`
 *   3. `data-mode` attribute reflects the `mode` prop verbatim
 *
 * Add scenario-specific tests after these three. Don't delete them —
 * the widget-contract drift guard expects every widget to honor the
 * mode contract, and these tests pin it.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Template } from "./Template";

describe("Template", () => {
  it("mounts in onboarding mode without crashing", () => {
    render(<Template mode="onboarding" />);
    expect(screen.getByTestId("template-root")).toHaveAttribute("data-mode", "onboarding");
    expect(screen.getByTestId("template-label")).toHaveTextContent(/hello, widget/i);
  });

  it("mounts in steady mode without crashing", () => {
    render(<Template mode="steady" />);
    expect(screen.getByTestId("template-root")).toHaveAttribute("data-mode", "steady");
  });

  it("hides the Edit affordance under mode=onboarding (locked-affordance contract)", () => {
    render(<Template mode="onboarding" />);
    expect(screen.queryByTestId("template-edit")).not.toBeInTheDocument();
  });

  it("exposes the Edit affordance under mode=steady and fires onEdit on click", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<Template mode="steady" onEdit={onEdit} />);
    await user.click(screen.getByTestId("template-edit"));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
