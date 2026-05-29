import { describe, expect, it } from "vitest";
import { z } from "zod";

import { SERVER_TOOL_CATALOG } from "./toolCatalog.js";
import { toOpenAiTools } from "./zodToJsonSchema.js";

describe("zodToJsonSchema → toOpenAiTools", () => {
  it("emits OpenAI function-shape tool entries for the production catalog", () => {
    const tools = toOpenAiTools(SERVER_TOOL_CATALOG);
    expect(tools.length).toBe(SERVER_TOOL_CATALOG.length);
    for (const tool of tools) {
      expect(tool.type).toBe("function");
      expect(tool.function.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(tool.function.description.length).toBeGreaterThanOrEqual(40);
      expect(tool.function.parameters.type).toBe("object");
      expect(tool.function.parameters.additionalProperties).toBe(false);
    }
  });

  it("marks required vs optional fields correctly", () => {
    const [openDoc] = toOpenAiTools(
      SERVER_TOOL_CATALOG.filter((t) => t.name === "open_document"),
    );
    // documentId is required; page is optional.
    expect(openDoc.function.parameters.required).toEqual(["documentId"]);
    expect(openDoc.function.parameters.properties?.documentId?.type).toBe("string");
    expect(openDoc.function.parameters.properties?.page?.type).toBe("integer");
  });

  it("threads .describe() onto each property", () => {
    const [openDoc] = toOpenAiTools(
      SERVER_TOOL_CATALOG.filter((t) => t.name === "open_document"),
    );
    expect(openDoc.function.parameters.properties?.documentId?.description?.length).toBeGreaterThan(
      0,
    );
    expect(openDoc.function.parameters.properties?.page?.description?.length).toBeGreaterThan(0);
  });

  it("converts .positive() on integers to minimum=1", () => {
    const [jumpTool] = toOpenAiTools(
      SERVER_TOOL_CATALOG.filter((t) => t.name === "jump_to_page"),
    );
    expect(jumpTool.function.parameters.properties?.page?.type).toBe("integer");
    expect(jumpTool.function.parameters.properties?.page?.minimum).toBe(1);
  });

  it("throws on unsupported Zod types (clear error mode)", () => {
    const schema = z.object({ tags: z.array(z.string()) });
    expect(() =>
      toOpenAiTools([
        {
          name: "test_unsupported",
          description:
            "Test stub. Use when you want to verify the converter's unsupported-type guard.",
          category: "read",
          inputSchema: schema,
          intentBuilder: () => ({}),
        },
      ]),
    ).toThrow(/unsupported Zod type "ZodArray"/);
  });

  it("converts string z.min() into minLength", () => {
    const schema = z.object({
      name: z.string().min(2).max(50).describe("a label"),
    });
    const out = toOpenAiTools([
      {
        name: "test_lengths",
        description:
          "Test stub for string length checks. Use when verifying min/max length propagation.",
        category: "read",
        inputSchema: schema,
        intentBuilder: () => ({}),
      },
    ]);
    expect(out[0].function.parameters.properties?.name?.minLength).toBe(2);
    expect(out[0].function.parameters.properties?.name?.maxLength).toBe(50);
  });
});
