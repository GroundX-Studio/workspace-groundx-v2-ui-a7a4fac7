import { useMemo, type FC } from "react";

import type { ContentScope } from "@groundx/shared";

import { Extract } from "@/components/viewer-widgets/Extract/Extract";
import { useAppMode } from "@/contexts/AppModeContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";
import { useWidgetRole } from "@/lib/widgetRole";

/**
 * ExtractView — thin onboarding wrapper around the production `Extract`
 * extraction-workbench ScopedViewerWidget.
 *
 * 2026-05-30-onboarding-shell-shared-view Phase 3a PACKAGED the F3/F3a/F4
 * extract workbench (live schema/values/geometry, the SchemaView design body,
 * Save/overlay) as `components/viewer-widgets/Extract/Extract.tsx`. Per
 * `feedback_no_onboarding_duplicates` onboarding + steady share ONE widget;
 * this view is now a thin layout wrapper that derives the `ContentScope` from
 * the active scenario's primary document + the auth-derived `role` and mounts
 * the widget.
 *
 * The shell's live canvas path mounts the workbench via `<ScopedCanvas>` (the
 * SOLE mount path); this wrapper survives for the legacy onboarding tests +
 * any direct callers until the per-frame views are fully retired. It is the
 * one grandfathered importer of the `Extract` component (the ESLint
 * no-restricted-imports ban exempts it pending that retirement).
 */
export const ExtractView: FC = () => {
  const { state: appMode } = useAppMode();
  const { state: session } = useOnboardingSession();
  const { byId } = useScenarioRegistry();
  const widgetRole = useWidgetRole();

  const scenarioId = appMode.scenario ?? session.scenario ?? "utility";
  const scenario = byId(scenarioId);
  const docId = scenario?.documents?.[0]?.documentId ?? null;

  const scope: ContentScope = useMemo(
    () => ({ type: "documents", documentIds: docId ? [docId] : [] }),
    [docId],
  );

  return <Extract scope={scope} role={widgetRole} />;
};
