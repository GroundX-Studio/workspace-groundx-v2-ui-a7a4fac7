/**
 * chat-architecture-hardening Task 4 — light-LLM turn router.
 *
 * `planTurn` classifies each user turn BEFORE retrieval: should the turn run
 * the GroundX document search, the skill-pack retrieval, or both? Runs ONLY
 * when a light client is configured (never borrows the chat client); every
 * failure mode falls back DETERMINISTICALLY to
 * `{ documentSearch: true, productKnowledge: "retriever-decides" }` — the
 * pre-router behavior (the retriever's internal scoring gate decides).
 */
import { describe, expect, it, vi } from "vitest";

import {
  CLASSIFIER_DECIDES,
  FALLBACK_ROUTE_PLAN,
  FALLBACK_TURN_PLAN,
  RETRIEVER_DECIDES,
  planTurn,
  type RoutePlan,
  type TurnPlan,
} from "./turnRouter.js";

function llmReplying(content: string) {
  return {
    forward: vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  };
}

describe("planTurn", () => {
  it("honors a valid plan from the light client", async () => {
    const client = llmReplying('{"documentSearch": false, "productKnowledge": true}');
    const plan = await planTurn("what do you know about groundx?", {
      lightLlmClient: client,
      lightLlmModelId: "light-m",
    });
    expect(plan).toEqual({ documentSearch: false, productKnowledge: true, extractionContext: true, appState: CLASSIFIER_DECIDES });
    const body = JSON.parse((client.forward.mock.calls[0][1] as { body: string }).body);
    expect(body.model).toBe("light-m");
  });

  // turn-router-extraction-appstate Task 1 — the extractionContext flag.
  // Plain boolean, NO sentinel: today's behavior (fetch when a primary doc
  // exists) is already deterministic, so the fallback value is simply `true`.
  it("parses extractionContext from the model output", async () => {
    const client = llmReplying(
      '{"documentSearch": true, "productKnowledge": false, "extractionContext": false}',
    );
    const plan = await planTurn("hi there!", {
      lightLlmClient: client,
      lightLlmModelId: "light-m",
    });
    expect(plan.extractionContext).toBe(false);
  });

  it("normalizes an omitted extractionContext to the fallback value true", async () => {
    const client = llmReplying('{"documentSearch": true, "productKnowledge": false}');
    const plan = await planTurn("what is the meter number?", {
      lightLlmClient: client,
      lightLlmModelId: "light-m",
    });
    expect(plan.extractionContext).toBe(true);
  });

  it("FALLBACK_TURN_PLAN carries extractionContext: true (byte-for-byte pre-flag behavior)", () => {
    expect(FALLBACK_TURN_PLAN.extractionContext).toBe(true);
  });

  // turn-router-extraction-appstate Task 2 — the appState routing flag.
  // Consumed as `boolean | CLASSIFIER_DECIDES`; the sentinel mirrors
  // RETRIEVER_DECIDES and is internal-only.
  it("parses appState from the model output", async () => {
    const client = llmReplying(
      '{"documentSearch": false, "productKnowledge": false, "extractionContext": false, "appState": true}',
    );
    const plan = await planTurn("how many pages do I have left on my plan?", {
      lightLlmClient: client,
      lightLlmModelId: "light-m",
    });
    expect(plan.appState).toBe(true);
  });

  it("normalizes an omitted appState to the CLASSIFIER_DECIDES sentinel", async () => {
    const client = llmReplying('{"documentSearch": true, "productKnowledge": false}');
    const plan = await planTurn("what is the meter number?", {
      lightLlmClient: client,
      lightLlmModelId: "light-m",
    });
    expect(plan.appState).toBe(CLASSIFIER_DECIDES);
  });

  it("the sentinel is not emittable by model output (schema demands a boolean)", async () => {
    const client = llmReplying(
      `{"documentSearch": true, "productKnowledge": false, "appState": "${CLASSIFIER_DECIDES}"}`,
    );
    const plan = await planTurn("anything", {
      lightLlmClient: client,
      lightLlmModelId: "light-m",
    });
    // Schema violation → deterministic fallback, where the sentinel is OURS.
    expect(plan).toEqual(FALLBACK_ROUTE_PLAN);
  });

  it("FALLBACK_ROUTE_PLAN carries the sentinel; FALLBACK_TURN_PLAN is the same plan minus appState", () => {
    expect(FALLBACK_ROUTE_PLAN.appState).toBe(CLASSIFIER_DECIDES);
    const { appState: _appState, ...routeRest } = FALLBACK_ROUTE_PLAN;
    expect(routeRest).toEqual(FALLBACK_TURN_PLAN);
    expect("appState" in FALLBACK_TURN_PLAN).toBe(false);
  });

  it("type-level: seam plan literals reject appState; route plans require it", () => {
    // @ts-expect-error — appState is not part of the seam-consumed TurnPlan
    const badSeamPlan: TurnPlan = {
      documentSearch: true,
      productKnowledge: false,
      extractionContext: true,
      appState: true,
    };
    // @ts-expect-error — RoutePlan requires appState
    const badRoutePlan: RoutePlan = {
      documentSearch: true,
      productKnowledge: false,
      extractionContext: true,
    };
    void badSeamPlan;
    void badRoutePlan;
    expect(true).toBe(true);
  });

  it("tolerates unknown future flags (extensible record)", async () => {
    const client = llmReplying('{"documentSearch": true, "productKnowledge": false, "someFutureFlag": true}');
    const plan = await planTurn("what is the meter number?", {
      lightLlmClient: client,
      lightLlmModelId: "light-m",
    });
    expect(plan.documentSearch).toBe(true);
    expect(plan.productKnowledge).toBe(false);
  });

  it("falls back deterministically when no light client is configured", async () => {
    const plan = await planTurn("anything", {});
    expect(plan).toEqual(FALLBACK_ROUTE_PLAN);
    expect(plan.productKnowledge).toBe(RETRIEVER_DECIDES);
  });

  it("falls back on garbage output", async () => {
    const plan = await planTurn("anything", {
      lightLlmClient: llmReplying("definitely not json"),
      lightLlmModelId: "light-m",
    });
    expect(plan).toEqual(FALLBACK_ROUTE_PLAN);
  });

  it("falls back on schema-violating output", async () => {
    const plan = await planTurn("anything", {
      lightLlmClient: llmReplying('{"documentSearch": "yes"}'),
      lightLlmModelId: "light-m",
    });
    expect(plan).toEqual(FALLBACK_ROUTE_PLAN);
  });

  it("falls back on a thrown/timed-out call (turn still succeeds)", async () => {
    const client = { forward: vi.fn(async () => { throw new Error("slow upstream aborted"); }) };
    const plan = await planTurn("anything", {
      lightLlmClient: client,
      lightLlmModelId: "light-m",
    });
    expect(plan).toEqual(FALLBACK_ROUTE_PLAN);
  });

  it("falls back on non-2xx", async () => {
    const client = { forward: vi.fn(async () => new Response("nope", { status: 503 })) };
    const plan = await planTurn("anything", {
      lightLlmClient: client,
      lightLlmModelId: "light-m",
    });
    expect(plan).toEqual(FALLBACK_ROUTE_PLAN);
  });
});
