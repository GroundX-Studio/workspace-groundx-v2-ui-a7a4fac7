import { useMemo, type FC } from "react";

import type { ContentScope } from "@groundx/shared";

import { Integrate } from "@/components/viewer-widgets/Integrate/Integrate";
import { useAppMode } from "@/contexts/AppModeContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";
import { useWidgetRole } from "@/lib/widgetRole";

/**
 * IntegrateView — thin onboarding wrapper around the production `Integrate`
 * connectors ScopedViewerWidget.
 *
 * 2026-05-30-onboarding-shell-shared-view Phase 3b PACKAGED the F7 connectors
 * surface (the Claude / OpenAI / Gemini / Cursor plugin cards + API snippets +
 * next-steps) as `components/viewer-widgets/Integrate/Integrate.tsx`. Per
 * `feedback_no_onboarding_duplicates` onboarding + steady share ONE widget;
 * this view is now a thin layout wrapper that derives a `ContentScope` from the
 * active scenario's primary document + the auth-derived `role` and mounts the
 * widget.
 *
 * The shell's live canvas path mounts the surface via `<ScopedCanvas>` (the
 * SOLE mount path); this wrapper survives for any direct callers until the
 * per-frame views are fully retired. It is the one grandfathered importer of
 * the `Integrate` component (the ESLint no-restricted-imports ban exempts it
 * pending that retirement).
 */
export const IntegrateView: FC = () => {
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

  return <Integrate scope={scope} role={widgetRole} />;
};
