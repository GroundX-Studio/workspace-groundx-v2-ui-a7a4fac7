import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentScope, WidgetRole } from "@groundx/shared";

import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { Integrate } from "./Integrate";

const UTILITY_DOC_SCOPE: ContentScope = {
  type: "documents",
  documentIds: ["utility-bill-2026-04"],
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Integrate — connectors ScopedViewerWidget (Phase 3b)", () => {
  // ── role + scope contract (widget-contract sibling test) ──────────
  it.each<WidgetRole>(["anonymous", "member"])(
    "mounts for role %s and reflects it on data-role",
    (role) => {
      renderWithOnboardingProviders(<Integrate role={role} scope={UTILITY_DOC_SCOPE} />, {
        initialFrame: "f7",
        initialScenario: "utility",
      });
      const root = screen.getByTestId("integrate");
      expect(root).toBeInTheDocument();
      expect(root).toHaveAttribute("data-role", role);
    },
  );

  it("renders the connector / plugin cards (Claude / OpenAI / Gemini / Cursor)", () => {
    renderWithOnboardingProviders(<Integrate role="member" scope={UTILITY_DOC_SCOPE} />, {
      initialFrame: "f7",
      initialScenario: "utility",
    });
    expect(screen.getByTestId("plugin-claude")).toBeInTheDocument();
    expect(screen.getByTestId("plugin-openai")).toBeInTheDocument();
    expect(screen.getByTestId("plugin-gemini")).toBeInTheDocument();
    expect(screen.getByTestId("plugin-cursor")).toBeInTheDocument();
  });

  it("keeps the connector download buttons honestly disabled-future (UI-02), not faked", () => {
    renderWithOnboardingProviders(<Integrate role="member" scope={UTILITY_DOC_SCOPE} />, {
      initialFrame: "f7",
      initialScenario: "utility",
    });
    for (const id of ["claude", "openai", "gemini", "cursor"]) {
      const dl = screen.getByTestId(`plugin-${id}-download`);
      expect(dl).toHaveAttribute("aria-disabled", "true");
      expect(dl).toHaveAttribute(
        "title",
        "Plugin downloads ship with the agent integration pipeline (UI-02).",
      );
    }
  });

  it("renders the same cards regardless of role (connectors are scope-independent today)", () => {
    const { unmount } = renderWithOnboardingProviders(
      <Integrate role="anonymous" scope={UTILITY_DOC_SCOPE} />,
      { initialFrame: "f7", initialScenario: "utility", initialAuthState: "anonymous" },
    );
    expect(screen.getByTestId("plugin-claude")).toBeInTheDocument();
    unmount();

    renderWithOnboardingProviders(<Integrate role="member" scope={UTILITY_DOC_SCOPE} />, {
      initialFrame: "f7",
      initialScenario: "utility",
      initialAuthState: "signed-in",
    });
    expect(screen.getByTestId("plugin-claude")).toBeInTheDocument();
  });
});
