/**
 * GateValueProp — legacy canvas half of the retired F6 gate.
 * Presentational pitch surface; live sign-in now uses SignUpWidget.
 *
 * Migrated to the role+scope widget contract in 2026-05-30-widget-role-access
 * Phase 2b. GateValueProp's matrix row (docs/agents/widget-access-matrix.md):
 *   • availability: anonymous ✅ / member ❌ — **anonymous-only** (gate context).
 *     Availability is enforced at the MOUNT SITE (OnboardingShell, gate-state),
 *     NOT by a prop inside the widget; the widget still accepts `role` for
 *     contract conformance and renders identically under any role passed.
 *   • affordance lock: none — presentational pitch, no interactive controls.
 *   • scope: { type: "none" } (not a ScopedViewerWidget).
 * The retired `mode` prop was cosmetic (the pitch is identical in both modes)
 * → dropped, replaced by `role` for the contract.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { WidgetRole, WidgetScope } from "@groundx/shared";

import { GateValueProp } from "./GateValueProp";

/** GateValueProp is not a ScopedViewerWidget — its scope is explicit "none". */
const NONE_SCOPE: WidgetScope = { type: "none" };

/**
 * The widget accepts both roles for contract conformance. Its matrix
 * availability is anonymous-only, but that is enforced at the mount site —
 * the widget renders identically under any role it is handed.
 */
const ROLES: WidgetRole[] = ["anonymous", "member"];

describe("GateValueProp", () => {
  describe.each(ROLES)("role=%s", (role) => {
    it("renders the value-prop pitch (eyebrow + headline + points)", () => {
      render(<GateValueProp role={role} scope={NONE_SCOPE} />);
      expect(screen.getByTestId("gate-value-prop")).toBeInTheDocument();
      expect(screen.getByText(/why groundx/i)).toBeInTheDocument();
      expect(screen.getByText(/answers you can trust/i)).toBeInTheDocument();
      expect(screen.getByText(/cites its source/i)).toBeInTheDocument();
      // No account-creation form lives in the canvas anymore.
      expect(screen.queryByLabelText(/sign-up form/i)).not.toBeInTheDocument();
    });

    it("emits the widget-contract data attributes (slot + role)", () => {
      render(<GateValueProp role={role} scope={NONE_SCOPE} />);
      const root = screen.getByTestId("gate-value-prop");
      expect(root.getAttribute("data-widget")).toBe("gate-value-prop");
      expect(root.getAttribute("data-role")).toBe(role);
    });
  });

  // Matrix row assertion: anonymous-only AVAILABILITY (enforced at the mount
  // site, not here) with NO affordance lock — the rendered pitch is identical
  // under whatever role the widget is handed.
  it("renders identically under anonymous and member (no affordance lock)", () => {
    const { unmount } = render(<GateValueProp role="anonymous" scope={NONE_SCOPE} />);
    const anonHasHeadline = screen.queryByText(/answers you can trust/i) != null;
    unmount();

    render(<GateValueProp role="member" scope={NONE_SCOPE} />);
    const memberHasHeadline = screen.queryByText(/answers you can trust/i) != null;

    expect(memberHasHeadline).toBe(anonHasHeadline);
    expect(memberHasHeadline).toBe(true);
  });

  it("reflects the required role prop on data-role", () => {
    render(<GateValueProp role="anonymous" scope={NONE_SCOPE} />);
    expect(screen.getByTestId("gate-value-prop").getAttribute("data-role")).toBe("anonymous");
  });
});
