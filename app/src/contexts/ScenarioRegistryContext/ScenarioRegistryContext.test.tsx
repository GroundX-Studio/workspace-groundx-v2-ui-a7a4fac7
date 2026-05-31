import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Catalog } from "@groundx/shared";

import type { ScenarioConfig } from "@/types/scenarios";
import type { ScenarioRegistryState } from "./types";
import { ScenarioRegistryProvider, useScenarioRegistry } from "./ScenarioRegistryContext";

function Probe() {
  const { state } = useScenarioRegistry();
  return (
    <div>
      <span data-testid="status">{state.status}</span>
      <span data-testid="count">{state.scenarios.length}</span>
      <span data-testid="error">{state.error ?? ""}</span>
    </div>
  );
}

// ── RCC Phase 2: the ready-state data view satisfies Catalog<ScenarioConfig> ──
function CatalogProbe() {
  const api = useScenarioRegistry();
  // Structural assignability — the async wrapper exposes a Catalog view via
  // all()/byId. Fails to compile if the registry drifts off the contract.
  const catalog: Catalog<ScenarioConfig> = api;
  return (
    <div>
      <span data-testid="all-count">{catalog.all().length}</span>
      <span data-testid="byid-x">{catalog.byId("x")?.id ?? "none"}</span>
      <span data-testid="byid-missing">{catalog.byId("missing")?.id ?? "none"}</span>
    </div>
  );
}

describe("ScenarioRegistryProvider", () => {
  it("uses initialScenarios when no override is provided", () => {
    render(
      <ScenarioRegistryProvider
        initialScenarios={[
          { id: "x", order: 1, manifest: { id: "x" } as any, documents: [] },
        ]}
      >
        <Probe />
      </ScenarioRegistryProvider>
    );
    expect(screen.getByTestId("status")).toHaveTextContent("ready");
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });

  it("forcedDemoState overrides initialScenarios", () => {
    const forced: ScenarioRegistryState = {
      status: "error",
      scenarios: [],
      bucketId: null,
      error: "Demo: bucket unreachable",
    };
    render(
      <ScenarioRegistryProvider
        initialScenarios={[
          { id: "x", order: 1, manifest: { id: "x" } as any, documents: [] },
        ]}
        forcedDemoState={forced}
      >
        <Probe />
      </ScenarioRegistryProvider>
    );
    expect(screen.getByTestId("status")).toHaveTextContent("error");
    expect(screen.getByTestId("count")).toHaveTextContent("0");
    expect(screen.getByTestId("error")).toHaveTextContent("Demo: bucket unreachable");
  });

  it("supports forcing the loading state", () => {
    const forced: ScenarioRegistryState = { status: "loading", scenarios: [], bucketId: null, error: null };
    render(
      <ScenarioRegistryProvider forcedDemoState={forced}>
        <Probe />
      </ScenarioRegistryProvider>
    );
    expect(screen.getByTestId("status")).toHaveTextContent("loading");
  });

  it("supports forcing the empty-ready state", () => {
    const forced: ScenarioRegistryState = { status: "ready", scenarios: [], bucketId: null, error: null };
    render(
      <ScenarioRegistryProvider forcedDemoState={forced}>
        <Probe />
      </ScenarioRegistryProvider>
    );
    expect(screen.getByTestId("status")).toHaveTextContent("ready");
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });

  it("exposes all()/byId so the ready-state view satisfies Catalog<ScenarioConfig>", () => {
    render(
      <ScenarioRegistryProvider
        initialScenarios={[
          { id: "x", order: 1, manifest: { id: "x" } as any, documents: [] },
          { id: "y", order: 2, manifest: { id: "y" } as any, documents: [] },
        ]}
      >
        <CatalogProbe />
      </ScenarioRegistryProvider>
    );
    expect(screen.getByTestId("all-count")).toHaveTextContent("2");
    expect(screen.getByTestId("byid-x")).toHaveTextContent("x");
    expect(screen.getByTestId("byid-missing")).toHaveTextContent("none");
  });
});
