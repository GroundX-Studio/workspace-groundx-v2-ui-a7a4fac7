/**
 * 2026-05-31-onboarding-experiences — the surface that mounts the SINGLE
 * `ConversationFlow` composed with a looked-up Workspace / Project
 * `ChatExperience`.
 *
 * Composition, not dispatch: this surface looks the experience up by id in
 * `chatExperienceRegistry` (lookup-only catalog), builds the entry's
 * `ContentScope` (the INPUT-NEEDED decision: Workspace → its workspace bucket;
 * Project → bucket + projectId filter), selects the per-scope chat session
 * (`resolveSessionForScope`), and hands the constructed experience to
 * `<ConversationFlow>`. There is NO new flow component and NO flow `mode` —
 * the same `ConversationFlow` the steady + onboarding surfaces mount.
 *
 * `/workspaces` → experience id `workspace`; `/projects` → `project`.
 */
import Box from "@mui/material/Box";
import { useEffect, useMemo, type FC } from "react";
import { useNavigate } from "react-router-dom";

import type { ContentScope } from "@groundx/shared";

import { isResolvedDocumentId } from "@/api/documentId";
import { AppShell } from "@/components/layout/AppShell";
import {
  OnboardingNav,
  useOnboardingNavCollapsed,
  type OnboardingNavItemKey,
} from "@/components/layout/OnboardingNav/OnboardingNav";
import { ScopedCanvas } from "@/components/layout/ScopedCanvas/ScopedCanvas";
import {
  FONT_SIZE_CAPTION,
  FONT_WEIGHT_LABEL,
  ONBOARDING_NAV_WIDTH_COLLAPSED,
  ONBOARDING_NAV_WIDTH_FULL,
  NAVY,
  WARM_OFFWHITE,
  WHITE,
} from "@/constants";
import { chatExperienceRegistry } from "@/conversation/chatExperienceRegistry";
import { ConversationFlow } from "@/conversation/ConversationFlow";
import { selectActiveStep, useChatStore, type ViewerStep } from "@/contexts/ChatStoreContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";
import { useWidgetRole } from "@/lib/widgetRole";

// The demo workspace bucket, mirroring OnboardingShell's `scenarioRegistry
// .bucketId ?? 28454` fallback (the seeded shared demo bucket). When the
// scenario registry has resolved a real bucket id, that wins.
const FALLBACK_DEMO_BUCKET = 28454;

export interface ScopedConversationShellProps {
  /** The experience id to look up + compose (`workspace` | `project`). */
  experienceId: "workspace" | "project";
  /**
   * The GroundX document filter.projectId value for the `project` experience.
   * Ignored for `workspace`. Defaults to the first ready scenario's projectId.
   */
  projectId?: string;
  /** Which nav entry is active (highlights the rail row). */
  navActiveKey: OnboardingNavItemKey;
  /** Human title for the ensure-created chat session. */
  sessionTitle: string;
}

export const ScopedConversationShell: FC<ScopedConversationShellProps> = ({
  experienceId,
  projectId,
  navActiveKey,
  sessionTitle,
}) => {
  const navigate = useNavigate();
  const { state: registryState } = useScenarioRegistry();
  const { state: chatState, resolveSessionForScope } = useChatStore();
  const [navCollapsed, setNavCollapsed] = useOnboardingNavCollapsed();

  const bucketId = registryState.status === "ready" && registryState.bucketId != null
    ? registryState.bucketId
    : FALLBACK_DEMO_BUCKET;

  const resolvedProjectId =
    projectId ??
    (registryState.status === "ready" ? registryState.scenarios[0]?.projectId : undefined);

  // The scope each entry opens on (the INPUT-NEEDED decision):
  //   workspace → its workspace bucket id
  //   project   → bucket + the projectId filter field/value
  const scope: ContentScope | null = useMemo(() => {
    if (experienceId === "project") {
      return resolvedProjectId
        ? { type: "bucket", bucketId, filter: { projectId: resolvedProjectId } }
        : null;
    }
    return { type: "bucket", bucketId };
  }, [experienceId, bucketId, resolvedProjectId]);

  // Look the experience up (lookup-only catalog) and construct it over the scope.
  const experience = useMemo(() => {
    if (!scope) return undefined;
    const entry = chatExperienceRegistry.byId(experienceId);
    return entry ? entry.create({ scope }) : undefined;
  }, [experienceId, scope]);

  // Select the per-scope chat session (ensure-created if absent). Re-opening
  // the same entry returns to its own conversation.
  const scopeSig = scope ? JSON.stringify(scope) : null;
  useEffect(() => {
    if (!scope) return;
    resolveSessionForScope(scope, { title: sessionTitle });
    // scopeSig is the stable scope identity; resolveSessionForScope is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeSig, sessionTitle]);

  const activeSessionId = chatState.activeSessionId;

  // Canvas mount wiring — the SAME shared `<ScopedCanvas>` path OnboardingShell
  // uses (DL-5: this shell previously stubbed the canvas, so no viewer widget
  // ever mounted in the authed experience). The active viewer step selects the
  // widget; the scope adapts by step kind.
  const widgetRole = useWidgetRole();
  const activeChatSession =
    activeSessionId != null ? chatState.sessions.get(activeSessionId) : undefined;
  const latestViewerStep = selectActiveStep(activeChatSession);

  // A doc-viewer step (e.g. from a CiteChip / "Show source" dispatch) narrows
  // to the cited single document; every other kind renders over the shell's
  // base scope (bucket / bucket+project-filter), the correct scope for
  // report / integrate / extract over the workspace or project.
  const canvasStep: ViewerStep = latestViewerStep ?? { kind: "ingest-picker" };
  const canvasScope: ContentScope | null = useMemo(() => {
    if (!scope) return null;
    if (canvasStep.kind === "doc-viewer" && isResolvedDocumentId(canvasStep.documentId)) {
      return { type: "documents", documentIds: [canvasStep.documentId] };
    }
    return scope;
  }, [canvasStep, scope]);

  const handleNavItemClick = (key: OnboardingNavItemKey) => {
    if (key === "workspaces") return void navigate("/workspaces");
    if (key === "projects") return void navigate("/projects");
    if (key === "docs") return void window.open("https://docs.groundx.ai", "_blank", "noopener,noreferrer");
    if (key === "settings") return void navigate("/settings");
  };

  const chatPane = (
    <Box
      data-testid="scoped-shell-chat-pane"
      sx={{
        width: "100%",
        flex: 1,
        height: "100%",
        backgroundColor: WARM_OFFWHITE,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        p: 2,
      }}
      aria-label="Chat column"
    >
      {scope ? (
        <ConversationFlow chatSessionId={activeSessionId} experience={experience} />
      ) : (
        <Box data-testid="scoped-project-loading" sx={{ color: NAVY, fontSize: FONT_SIZE_CAPTION, fontWeight: FONT_WEIGHT_LABEL }}>
          Loading project
        </Box>
      )}
    </Box>
  );

  const canvasPane = (
    <Box
      data-testid="scoped-shell-canvas-pane"
      sx={{ width: "100%", flex: 1, height: "100%", backgroundColor: WHITE, overflow: "hidden" }}
      aria-label="Canvas"
    >
      {canvasScope ? (
        <ScopedCanvas scope={canvasScope} step={canvasStep} role={widgetRole} reportSurface="render" />
      ) : (
        <Box data-testid="scoped-project-canvas-loading" sx={{ color: NAVY, fontSize: FONT_SIZE_CAPTION, fontWeight: FONT_WEIGHT_LABEL }}>
          Loading project
        </Box>
      )}
    </Box>
  );

  return (
    <Box
      data-testid="scoped-shell"
      data-experience={experienceId}
      sx={{ position: "relative", height: "100vh", overflow: "hidden", backgroundColor: WHITE }}
    >
      <AppShell
        nav={
          <OnboardingNav
            accountState="free"
            activeKey={navActiveKey}
            collapsed={navCollapsed}
            onToggleCollapsed={() => setNavCollapsed(!navCollapsed)}
            onItemClick={handleNavItemClick}
            onLogoClick={() => navigate("/")}
          />
        }
        chat={chatPane}
        canvas={canvasPane}
        initialChatWidth={420}
        navWidth={navCollapsed ? ONBOARDING_NAV_WIDTH_COLLAPSED : ONBOARDING_NAV_WIDTH_FULL}
      />
    </Box>
  );
};

/** `/workspaces` route surface. */
export const WorkspacesView: FC = () => (
  <ScopedConversationShell
    experienceId="workspace"
    navActiveKey="workspaces"
    sessionTitle="Workspace"
  />
);

/** `/projects` route surface. */
export const ProjectsView: FC = () => (
  <ScopedConversationShell
    experienceId="project"
    navActiveKey="projects"
    sessionTitle="Project"
  />
);
