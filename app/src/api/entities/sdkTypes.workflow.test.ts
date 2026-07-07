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
