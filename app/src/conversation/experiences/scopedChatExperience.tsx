/**
 * 2026-05-31-onboarding-experiences — the shared STEADY scoped experience.
 *
 * `makeWorkspaceExperience({ scope })` and `makeProjectExperience({ scope })`
 * are the second and third real callers of the `ChatExperience` factory (the
 * first is `makeOnboardingExperience`). Per the decision recorded in the change
 * (task 0): both are the STEADY variant of onboarding —
 *
 *   • Intro — a short summary of the scope's docs + pick-view pills (mirrors
 *     onboarding's Intro, but with NO scripted `ThinkingStream`: a steady
 *     surface is not a first-read reading beat).
 *   • Choreography — NONE. Steady surfaces never auto-advance onboarding
 *     frames (no f3/f5 side-effects); the conversation is the whole surface.
 *
 * Composable-over-forked: workspace and project differ ONLY in the
 * closed-over `ContentScope` (bucket vs bucket+filter) and the labels derived
 * from it. The mechanism (Intro shape, pill set, grounding) is shared here —
 * there is no per-experience fork. The two thin modules under
 * `experiences/<id>/experience.tsx` supply their id, label, and a `scope`
 * `configSchema`, then delegate to this factory.
 */
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useMemo, type FC } from "react";

import { compileScopeFilter, type ContentScope } from "@groundx/shared";

import type {
  ChatExperience,
  ChatExperienceComponentProps,
} from "@/conversation/ChatExperience";
import { BotBubble, PickViewPill } from "@/conversation/chatPrimitives";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";

import { BORDER, FONT_WEIGHT_HEADLINE, NAVY } from "@/constants";

/** The kind of scoped surface — picks the Intro's heading + summary copy. */
export type ScopedExperienceKind = "workspace" | "project";

export interface ScopedExperienceConfig {
  /** The document set this experience is grounded over (bucket / bucket+filter). */
  scope: ContentScope;
}

/** A pick-view pill: a prompt the user can send to kick off a steady analysis. */
interface PickViewOption {
  key: string;
  label: string;
  /** The message sent into the conversation when the pill is clicked. */
  prompt: string;
}

/**
 * The steady pick-view pills. These are NOT frame-advance affordances (steady
 * has no frames) — each sends a real prompt into the conversation so the pill
 * is a working, non-dormant action. Kept identical across workspace/project;
 * the surfacing differs only in the Intro summary line.
 */
const STEADY_PICK_VIEWS: PickViewOption[] = [
  { key: "summarize", label: "Summarize", prompt: "Summarize the documents in this scope." },
  { key: "extract", label: "Extract fields", prompt: "What structured fields can you extract from these documents?" },
  { key: "report", label: "Build a report", prompt: "Draft a report over these documents." },
];

/** Human label for a scope — drives the Intro summary + grounding hint. */
export function describeScope(scope: ContentScope): string {
  const filter = compileScopeFilter(scope.filter);
  const filterSuffix = filter ? ` · filter ${JSON.stringify(filter)}` : "";
  switch (scope.type) {
    case "bucket":
      return `bucket ${scope.bucketId}${filterSuffix}`;
    case "group":
      return `group ${scope.groupId}${filterSuffix}`;
    case "documents":
      return `${scope.documentIds.length} document(s)${filterSuffix}`;
    default:
      return "this scope";
  }
}

function makeScopedIntro(
  kind: ScopedExperienceKind,
  scope: ContentScope,
): FC<ChatExperienceComponentProps> {
  const ScopedIntro: FC<ChatExperienceComponentProps> = ({ conversation }) => {
    const { state: registryState } = useScenarioRegistry();

    // A short, real summary of the scope's docs. For a bucket scope the
    // workspace == bucket, so "ready" registry scenarios in that bucket are
    // the docs the user can analyze; a projectId filter narrows to the
    // matching GroundX document filter value returned by the scenario registry.
    const docSummary = useMemo(() => {
      if (registryState.status !== "ready") return null;
      const projectIds =
        scope.type === "bucket" && scope.filter?.projectId
          ? (Array.isArray(scope.filter.projectId) ? scope.filter.projectId : [scope.filter.projectId])
          : null;
      const scenarios = projectIds
        ? registryState.scenarios.filter((s) => projectIds.includes(s.projectId))
        : registryState.scenarios;
      return scenarios;
    }, [registryState]);

    const heading = kind === "workspace" ? "Workspace" : "Project";
    const summaryLine =
      docSummary == null
        ? `${heading} · ${describeScope(scope)}`
        : `${heading} · ${describeScope(scope)} · ${docSummary.length} sample${docSummary.length === 1 ? "" : "s"} ready`;

    return (
      <Box data-testid={`scoped-chat-intro-${kind}`}>
        <Box sx={{ pb: 1, borderBottom: `1px solid ${BORDER}` }}>
          <Typography
            variant="subtitle2"
            data-testid={`scoped-chat-heading-${kind}`}
            sx={{ fontWeight: FONT_WEIGHT_HEADLINE, color: NAVY }}
          >
            {heading}
          </Typography>
          <Typography
            variant="caption"
            data-testid={`scoped-chat-summary-${kind}`}
            sx={{ color: NAVY }}
          >
            {summaryLine}
          </Typography>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25, mt: 1.5 }}>
          <BotBubble>Pick a view:</BotBubble>
          <Box data-testid={`scoped-chat-pick-a-view-${kind}`} sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            {STEADY_PICK_VIEWS.map((view) => (
              <PickViewPill
                key={view.key}
                label={view.label}
                testid={`scoped-chat-pick-view-${kind}-${view.key}`}
                onClick={() => conversation.send(view.prompt)}
              />
            ))}
          </Box>
        </Box>
      </Box>
    );
  };
  return ScopedIntro;
}

/**
 * Build a STEADY scoped `ChatExperience`. Shared by workspace + project; the
 * `kind` only changes the Intro heading/summary, the `scope` is the grounding.
 * No Choreography (steady).
 */
export function makeScopedChatExperience(
  kind: ScopedExperienceKind,
  config: ScopedExperienceConfig,
): ChatExperience {
  return {
    Intro: makeScopedIntro(kind, config.scope),
    // Thread the scope into the grounded LLM prompt so the model knows the
    // corpus even when GroundX returns 0 snippets (mirrors onboarding's
    // scopeHint). `scenarioTitle` carries the human scope description.
    scopeHint: { scenarioTitle: `${kind}: ${describeScope(config.scope)}` },
    title: kind === "workspace" ? "Workspace" : "Project",
  };
}
