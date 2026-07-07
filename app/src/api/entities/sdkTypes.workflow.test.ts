import { describe, expect, it } from "vitest";

import { workflowLeafFieldSchema } from "@groundx/shared";

import type { Workflow } from "./sdkTypes";
import type { WorkflowInput } from "./groundxWorkflowsEntity";

/**
 * extract-workflow-authoring prerequisite — the `Workflow` type carries the
 * compiler-output structures `leafFields` / `customSteps` / `outputRoutes`
 * (live-verified shapes, workflow 9910308e v1, 2026-07-07), so the authoring
 * round-trip (GET → edit → compile → PUT) reads/writes ONE type. `leafFields`
 * is schema-validated (the authoring UI joins on it); customSteps/outputRoutes
 * are held OPAQUELY (compiler-owned; we never re-derive them — design §6).
 */

// Verbatim live shapes (workflow_demo_v1.json).
const liveLeafField = {
  finalPath: "/statement/bill_account_id",
  workflowGroup: "statement",
  workflowField: "bill_account_id",
  stepName: "statement_fields",
  level: "chunk",
  outputKey: "bill_account_id",
  fieldType: "str",
  isRepeated: false,
  repetitionScope: "none",
};

describe("workflowLeafFieldSchema (shared)", () => {
  it("parses the live leaf-field shape", () => {
    const parsed = workflowLeafFieldSchema.parse(liveLeafField);
    expect(parsed.finalPath).toBe("/statement/bill_account_id");
    expect(parsed.fieldType).toBe("str");
  });

  it("tolerates compiler evolution (unknown keys pass through)", () => {
    const parsed = workflowLeafFieldSchema.parse({ ...liveLeafField, newCompilerProp: 1 });
    expect((parsed as Record<string, unknown>).newCompilerProp).toBe(1);
  });
});

describe("Workflow / WorkflowInput carry the compiler structures", () => {
  it("accepts leafFields + customSteps + outputRoutes (compile-time)", () => {
    const wf: Workflow = {
      workflowId: "wf-1",
      steps: {},
      extract: {},
      leafFields: [liveLeafField],
      customSteps: [{ name: "statement_fields", level: "chunk", kind: "instruct", config: {} }],
      outputRoutes: [
        {
          workflowGroup: "statement",
          workflowField: "bill_account_id",
          finalPath: "/statement/bill_account_id",
          stepName: "statement_fields",
          level: "chunk",
          outputMap: null,
          outputKey: "bill_account_id",
          readbackPath: null,
        },
      ],
    };
    const input: WorkflowInput = {
      name: "n",
      steps: wf.steps,
      extract: wf.extract,
      leafFields: wf.leafFields,
      customSteps: wf.customSteps,
      outputRoutes: wf.outputRoutes,
    };
    expect(input.leafFields?.[0]?.workflowGroup).toBe("statement");
    expect(Array.isArray(wf.customSteps)).toBe(true);
  });
});

// Principle 0 — engine config (EXTRACT_MODEL_*) can ride inside the `steps`
// blob a GET returns (`apiKey`/`baseURL`). It must NEVER be PUT back or held:
// the redactor strips those keys at ANY depth before the round-trip.
describe("redactWorkflowEngineSecrets", () => {
  it("strips apiKey/baseURL at any depth inside steps, leaving structure intact", async () => {
    const { redactWorkflowEngineSecrets } = await import("./groundxWorkflowsEntity");
    const input = {
      name: "n",
      steps: {
        extract: {
          engine: { apiKey: "sk-SECRET", baseURL: "https://llm.internal", model: "gpt-5.5" },
          nested: [{ config: { apiKey: "sk-2", keep: true } }],
        },
      },
      extract: { statement: { fields: {} } },
    };
    const clean = redactWorkflowEngineSecrets(input) as typeof input;
    expect(JSON.stringify(clean)).not.toContain("sk-SECRET");
    expect(JSON.stringify(clean)).not.toContain("sk-2");
    expect(JSON.stringify(clean)).not.toContain("llm.internal");
    // structure + non-secret config survive
    expect((clean.steps.extract as { engine: { model: string } }).engine.model).toBe("gpt-5.5");
    expect((clean.steps.extract as { nested: Array<{ config: { keep: boolean } }> }).nested[0].config.keep).toBe(true);
    // the original is not mutated
    expect((input.steps.extract as { engine: { apiKey: string } }).engine.apiKey).toBe("sk-SECRET");
  });
});
