/**
 * Widget Template — canonical tests.
 *
 * **COPY THIS FILE** alongside `Template.tsx` when you copy the
 * `_template/` dir. The floor every widget must ship under the
 * role + scope contract (2026-05-30-widget-role-access):
 *
 *   1. Mounts under BOTH roles (`anonymous`, `member`) without crashing
 *   2. Asserts its access-matrix row (availability + affordance lock)
 *   3. `data-role` attribute reflects the `role` prop verbatim
 *
 * The reference template's matrix row (see
 * `docs/agents/widget-access-matrix.md`):
 *   availability — anonymous ✅ / member ✅ (all roles)
 *   affordance   — none locked by role today (the Edit demo renders
 *                  for every role; persistence is gated at the tool /
 *                  save boundary, e.g. `edit_template` → `["member"]`)
 *   scope        — { type: "none" } (reference template is not
 *                  document-scoped)
 *
 * Add scenario-specific tests after these — don't delete them; the
 * widget-contract drift guard expects every widget to honor the
 * role + scope contract, and these tests pin it.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { WidgetRole, WidgetScope } from "@groundx/shared";

import { Template } from "./Template";

const NONE_SCOPE: WidgetScope = { type: "none" };
const ROLES: WidgetRole[] = ["anonymous", "member"];

describe("Template", () => {
  it.each(ROLES)("mounts for role=%s without crashing", (role) => {
    render(<Template role={role} scope={NONE_SCOPE} />);
    expect(screen.getByTestId("template-root")).toHaveAttribute("data-role", role);
    expect(screen.getByTestId("template-label")).toHaveTextContent(/hello, widget/i);
  });

  // Matrix row: available to BOTH roles, no affordance locked by role.
  // The Edit affordance renders identically regardless of role.
  it.each(ROLES)("exposes the Edit affordance for role=%s (no role lock)", (role) => {
    render(<Template role={role} scope={NONE_SCOPE} />);
    expect(screen.getByTestId("template-edit")).toBeInTheDocument();
  });

  it("fires onEdit when the Edit affordance is activated", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<Template role="anonymous" scope={NONE_SCOPE} onEdit={onEdit} />);
    await user.click(screen.getByTestId("template-edit"));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
