/**
 * ScopedViewerWidget Template — canonical starting point for a VIEWER-PANE
 * widget (the four real ones: PdfViewer · Extract · SmartReport · Integrate).
 *
 * **COPY THIS FILE + `ScopedViewerTemplate.tools.ts`** into
 * `components/viewer-widgets/<Name>/` (rename `ScopedViewerTemplate` →
 * `<Name>`), then register the descriptor's component in
 * `widgets/scopedViewerWidgetRegistryProduction.ts` so `<ScopedCanvas>` can mount
 * it. The plain `Template.tsx` in this dir is for a NON-scope-bound widget (chat
 * card / overlay); this variant is for a widget that IS a canvas surface.
 *
 * How a ScopedViewerWidget differs from the plain Template
 * (`docs/agents/data-model.md` "New viewer surface" + `template-scope-results.md`):
 *
 *   • `scope: ContentScope` is REQUIRED and NON-`none` — a ScopedViewerWidget
 *     narrows `WidgetScope` to a real scope (a document set / bucket+filter /
 *     group). It drives its data fetch from `scope`, never a raw
 *     `documentId`/`bucketId`/`projectId` prop.
 *   • It re-loads its data whenever the scope IDENTITY changes, via the base
 *     `useScopeAdapter(scope, adapt)` hook (keyed on `scopeKey(scope)`), NOT a
 *     bespoke `useEffect`.
 *   • It ships a `defineScopedViewerWidget({ id, kind, slot, tools })` descriptor
 *     (see `ScopedViewerTemplate.tools.ts`) + a canvas-dispatch tool. The
 *     descriptor is cataloged in the production registry; that registry is the
 *     SOLE mount path (`<ScopedCanvas>` resolves `step.kind → CanvasKind → mount
 *     → component`), so "uncatalogued == unreachable". The §5(a) drift guard
 *     fails a viewer widget that skips the descriptor.
 *
 * Shared bases this builds on (all in one place — reuse, don't fork):
 *   • `ContentScope` / `WidgetRole` — `@groundx/shared`
 *   • `defineScopedViewerWidget` / `useScopeAdapter` / `scopeKey` —
 *     `@/widgets/scopedViewerWidget`
 *   • the production registry — `@/widgets/scopedViewerWidgetRegistryProduction`
 */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { useState, type FC } from "react";

import type { ContentScope, WidgetRole } from "@groundx/shared";

import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS_2X,
  FONT_SIZE_CAPTION,
  WHITE,
} from "@/constants";
import { useScopeAdapter } from "@/widgets/scopedViewerWidget";

export interface ScopedViewerTemplateProps {
  /**
   * Authorization role of the current viewer (`anonymous` | `member`).
   * REQUIRED by the widget contract.
   */
  role: WidgetRole;
  /**
   * REQUIRED, NON-`none` scope this widget renders over. A ScopedViewerWidget
   * narrows `WidgetScope` to a real `ContentScope` — never a raw
   * `documentId`/`bucketId`/`projectId`.
   */
  scope: ContentScope;
}

export const ScopedViewerTemplate: FC<ScopedViewerTemplateProps> = ({ role, scope }) => {
  // Demo "data load" keyed on scope identity. A real widget fetches its
  // X-Ray / extract / report here. `useScopeAdapter` re-runs `adapt` ONLY when
  // `scopeKey(scope)` changes — not on every render — so re-scoping reloads but
  // an unrelated re-render does not.
  const [loadedScopeKey, setLoadedScopeKey] = useState<string | null>(null);
  useScopeAdapter(scope, (s) => {
    // Replace this with the real scope-driven data fetch.
    setLoadedScopeKey(JSON.stringify(s));
  });

  return (
    <Box
      data-testid="scoped-viewer-template-root"
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
        <Box data-testid="scoped-viewer-template-scope">scope: {scope.type}</Box>
        <Box data-testid="scoped-viewer-template-loaded">loaded: {loadedScopeKey ?? "—"}</Box>
      </Stack>
    </Box>
  );
};
