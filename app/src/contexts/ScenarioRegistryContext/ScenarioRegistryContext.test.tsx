import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
});
