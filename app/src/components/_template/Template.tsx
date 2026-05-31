/**
 * Widget Template — canonical starting point for a new widget.
 *
 * **COPY THIS DIR** to `components/chat-widgets/<Name>/` (chat surface)
 * or `components/viewer-widgets/<Name>/` (viewer pane), rename
 * `Template` → `<Name>` everywhere, fill in the TODO markers, and
 * delete this header. The drift-guard test
 * (`app/src/test/widget-contract.test.ts`) skips any directory
 * starting with `_` so this file is exempt by placement.
 *
 * Mandatory contract surfaces are exercised here so a fresh agent
 * can see them in one place (2026-05-30-widget-role-access):
 *
 *   • `role: WidgetRole` prop (authorization — `anonymous` | `member`)
 *   • required `scope: WidgetScope` prop (this reference template is
 *     not document-scoped → `{ type: "none" }`; the four
 *     ScopedViewerWidgets take a real `ContentScope` instead)
 *   • `data-role` attribute for visual + drift-guard inspection
 *   • Stable testids of the form `template-<slug>`
 *
 * NOTE on affordance locks: no widget locks an affordance by role
 * today (see the access matrix). The demo Edit button therefore
 * renders for EVERY role; whether the edit *persists* is gated at the
 * tool / save boundary (`edit_template` is `availableIn: ["member"]`),
 * not by hiding the control. When a future read-only role lands, gate
 * the affordance on `widgetRoleCanEdit(role)` and add a matrix row.
 *
 * See `Template.test.tsx` for the canonical tests and
 * `Template.tools.ts` for the read + mutate tool declaration.
 */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { type FC } from "react";

import type { WidgetRole, WidgetScope } from "@groundx/shared";

import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS_2X,
  FONT_SIZE_CAPTION,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_LABEL,
  GREEN,
  NAVY,
  WHITE,
} from "@/constants";

export interface TemplateProps {
  /**
   * Authorization role of the current viewer (`anonymous` = pre-sign-up,
   * `member` = signed in). REQUIRED by the widget contract. Forward-
   * looking: no widget locks an affordance by role today, so this
   * reference template renders identically for both. When a read-only
   * role lands, gate edit controls on `widgetRoleCanEdit(role)`.
   */
  role: WidgetRole;
  /**
   * REQUIRED scope the widget targets. This reference template is not
   * document-scoped, so it declares `{ type: "none" }`. The four
   * ScopedViewerWidgets (PdfViewer / Extract / SmartReport / Integrate)
   * pass a real `ContentScope` here instead — never a raw
   * `documentId` / `bucketId` / `projectId`.
   */
  scope: WidgetScope;
  /** Display label (replace with real widget props). */
  label?: string;
  /** Fired when the demo edit button activates. */
  onEdit?: () => void;
}

export const Template: FC<TemplateProps> = ({
  role,
  // `scope` is part of the required contract surface. This reference
  // template doesn't read it (it is not document-scoped); a real
  // ScopedViewerWidget would drive its data fetch from `scope`.
  scope: _scope,
  label = "Hello, widget.",
  onEdit,
}) => {
  return (
    <Box
      data-testid="template-root"
      data-role={role}
      sx={{
        px: 1.25,
        py: 0.75,
        borderRadius: BORDER_RADIUS_2X,
        backgroundColor: WHITE,
        border: `1px solid ${BORDER}`,
        color: BODY_TEXT,
        fontSize: FONT_SIZE_CAPTION,
      }}
    >
      <Stack spacing={0.75}>
        <Box data-testid="template-label">{label}</Box>
        {/*
          No role lock today: the Edit affordance renders for every
          role. Persistence is gated at the tool / save boundary
          (`edit_template` → `availableIn: ["member"]`), not by hiding
          the control. A future read-only role would wrap this in
          `widgetRoleCanEdit(role) && (...)`.
        */}
        <Box
          role="button"
          tabIndex={0}
          data-testid="template-edit"
          onClick={onEdit}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onEdit?.();
            }
          }}
          sx={{
            alignSelf: "flex-start",
            px: 1,
            py: 0.25,
            borderRadius: BORDER_RADIUS_2X,
            backgroundColor: GREEN,
            color: NAVY,
            fontSize: FONT_SIZE_LABEL,
            fontWeight: FONT_WEIGHT_LABEL,
            cursor: "pointer",
            "&:focus-visible": { outline: `2px solid ${NAVY}`, outlineOffset: 1 },
          }}
        >
          Edit
        </Box>
      </Stack>
    </Box>
  );
};
