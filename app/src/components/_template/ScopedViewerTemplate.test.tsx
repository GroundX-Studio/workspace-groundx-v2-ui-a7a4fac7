/**
 * ScopedViewerWidget Template — canonical tests.
 *
 * **COPY THIS FILE** alongside `ScopedViewerTemplate.tsx` when you copy the
 * scaffold into `viewer-widgets/<Name>/`. The floor a ScopedViewerWidget must
 * ship (on top of the plain widget-contract floor):
 *
 *   1. Mounts under BOTH roles with a real (non-`none`) `ContentScope`.
 *   2. Re-loads when the scope IDENTITY changes (the `useScopeAdapter` contract).
 *   3. Does NOT re-load on an unrelated re-render (same scope identity).
 *
 * The `_template/` dir is skipped by the widget-contract drift guard (slot dirs
 * only), so this test exists as the copy-me exemplar, not a contract gate.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ContentScope, WidgetRole } from "@groundx/shared";

import { ScopedViewerTemplate } from "./ScopedViewerTemplate";

const DOC_SCOPE: ContentScope = { type: "documents", documentIds: ["doc-1"] };
const ROLES: WidgetRole[] = ["anonymous", "member"];

describe("ScopedViewerTemplate", () => {
  it.each(ROLES)("mounts for role=%s with a real ContentScope", (role) => {
    render(<ScopedViewerTemplate role={role} scope={DOC_SCOPE} />);
    expect(screen.getByTestId("scoped-viewer-template-root")).toHaveAttribute("data-role", role);
    expect(screen.getByTestId("scoped-viewer-template-scope")).toHaveTextContent("documents");
  });

  it("loads its data from scope on mount (useScopeAdapter)", () => {
    render(<ScopedViewerTemplate role="member" scope={DOC_SCOPE} />);
    // The demo adapter records the scope key — proof the load fired from scope.
    expect(screen.getByTestId("scoped-viewer-template-loaded")).toHaveTextContent("documents");
  });
});
