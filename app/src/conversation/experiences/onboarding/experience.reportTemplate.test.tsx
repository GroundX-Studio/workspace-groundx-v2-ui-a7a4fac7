import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useChatStore } from "@/contexts/ChatStoreContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import type { ConversationApi } from "@/conversation/useConversation";
import { chatExperienceRegistry } from "@/conversation/chatExperienceRegistry";
import { makeOnboardingExperience } from "./experience";

/**
 * report-default-template T6(c) — the onboarding experience loads its configured
 * `reportTemplateId` onto the active session's `reportOverlay.templateId` (the
 * Report render surface's source). Config-driven: a scenario WITHOUT the field
 * leaves it unset (empty state). No scenario is hardcoded.
 */

// The Choreography only reads `conversation.firstUserMessageSent`; stub the rest.
const stubConversation = { firstUserMessageSent: false } as unknown as ConversationApi;

function TemplateProbe() {
  const { state } = useChatStore();
  const session = state.activeSessionId ? state.sessions.get(state.activeSessionId) : null;
  return <div data-testid="active-template-id">{session?.reportOverlay.templateId ?? "none"}</div>;
}

describe("onboarding experience — report template wiring (T6c)", () => {
  it("loads config.reportTemplateId onto the active session", async () => {
    const exp = makeOnboardingExperience({
      scenarioId: "utility",
      thinkingScript: [],
      reportTemplateId: "rt-sample-utility-bill",
    });
    const Choreography = exp.Choreography!;
    renderWithOnboardingProviders(
      <>
        <Choreography conversation={stubConversation} />
        <TemplateProbe />
      </>,
      { initialFrame: "f2", initialScenario: "utility" },
    );
    await waitFor(() =>
      expect(screen.getByTestId("active-template-id")).toHaveTextContent("rt-sample-utility-bill"),
    );
  });

  it("leaves templateId unset when the config omits reportTemplateId (e.g. loan)", async () => {
    const exp = makeOnboardingExperience({ scenarioId: "loan", thinkingScript: [] });
    const Choreography = exp.Choreography!;
    renderWithOnboardingProviders(
      <>
        <Choreography conversation={stubConversation} />
        <TemplateProbe />
      </>,
      { initialFrame: "f2", initialScenario: "loan" },
    );
    // Active session is established, but no template id is injected.
    await waitFor(() =>
      expect(screen.getByTestId("active-template-id")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("active-template-id")).toHaveTextContent("none");
  });

  it("the registry create() PRESERVES reportTemplateId through schema parse (the real ChatColumn path)", async () => {
    // Guards the z.object strip: if `onboardingConfigSchema` lacks the field,
    // `.parse()` drops it and the template never loads.
    const exp = chatExperienceRegistry.byId("onboarding")!.create({
      scenarioId: "utility",
      thinkingScript: [],
      reportTemplateId: "rt-sample-utility-bill",
    });
    const Choreography = exp.Choreography!;
    renderWithOnboardingProviders(
      <>
        <Choreography conversation={stubConversation} />
        <TemplateProbe />
      </>,
      { initialFrame: "f2", initialScenario: "utility" },
    );
    await waitFor(() =>
      expect(screen.getByTestId("active-template-id")).toHaveTextContent("rt-sample-utility-bill"),
    );
  });
});
