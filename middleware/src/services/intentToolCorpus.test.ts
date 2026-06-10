import { beforeEach, describe, expect, it, vi } from "vitest";

import { intentCatalog } from "@groundx/shared/intent-catalog";

import { MemoryAppRepository } from "../db/memoryRepository.js";
import type { ChatSessionRecord, GroundXClient, LlmClient } from "../types.js";

import { handleChatMessage } from "./chatHandler.js";
import { getServerTool, SERVER_TOOL_CATALOG } from "./toolCatalog.js";

/**
 * Middleware tool→intent corpus (audit-chat-intent-coverage, T4).
 *
 * For every shared-catalog entry that is LLM-emittable (`llm.toolName`), stub
 * the LLM provider to emit that tool-call and assert it produces the expected
 * dispatched intent:
 *   • read   tools → `reply.intents[]` (auto-dispatch)
 *   • mutate tools → `reply.suggestedActions[]` `tool:` chip with `detail.intent`
 *
 * Zero real LLM calls (the `LlmClient.forward` seam is a `vi.fn`).
 */

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

function makeSession(): ChatSessionRecord {
  const now = new Date();
  return {
    id: "chat-1",
    onboardingSessionId: "onb-1",
    ownerUserId: null,
    ownerAnonId: "anon-1",
    title: "Onboarding",
    isOnboarding: true,
    activeEntityKey: null,
    currentIntent: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
}

/** A GroundX search hit so the RAG path proceeds to the LLM completion. */
function makeGroundxClient(): GroundXClient {
  return {
    forward: vi.fn(async () =>
      jsonResponse({
        search: { results: [{ documentId: "doc-1", pageNumber: 1, text: "The total amount due is $7,613.20." }] },
      }),
    ),
  };
}

/** An LlmClient whose grounded completion emits a single scripted tool-call. */
function makeLlmClientEmitting(toolName: string, args: Record<string, unknown>): LlmClient {
  const body = {
    choices: [
      {
        message: {
          content: "Here is the answer.",
          tool_calls: [{ id: "call_1", type: "function", function: { name: toolName, arguments: JSON.stringify(args) } }],
        },
      },
    ],
  };
  return { forward: vi.fn(async () => jsonResponse(body)) };
}

/** Valid args per tool (matches each tool's Zod `inputSchema`). */
const TOOL_ARGS: Record<string, Record<string, unknown>> = {
  open_document: { documentId: "doc-1" },
  jump_to_page: { documentId: "doc-1", page: 2 },
  propose_schema_field: { categoryId: "meters", name: "test_field", type: "STRING", description: "A proposed field." },
  accept_proposal: { proposalId: "prop-1" },
  reject_proposal: { proposalId: "prop-1" },
  commit_gate: { method: "register" },
  dismiss_gate: {},
  save_to_account: {},
  suggest_intent: { intent: "show-extract", reason: "Move to the extraction workbench." },
  book_call: {},
  show_extraction: { scope: { type: "documents", documentIds: ["doc-1"] }, schema_id: "schema-1" },
  show_integrate: { scope: { type: "documents", documentIds: ["doc-1"] } },
  show_smart_report_render: { scope: { type: "documents", documentIds: ["doc-1"] }, template_id: "tmpl-1" },
  show_smart_report_edit: { template_id: "tmpl-1" },
  pin_to_report: { turn_id: "turn-1", text: "The total is $7,613.20." },
  propose_report_section: { name: "summary", render_as: "PARAGRAPH", question: "What is the total?" },
  accept_report_section: { proposal_id: "prop-1" },
  reject_report_section: { proposal_id: "prop-1" },
  edit_report_section: { section_id: "sec-1", name: "renamed" },
  delete_report_section: { section_id: "sec-1" },
  submit_signup: { first: "Pat", last: "Lee", email: "pat@example.com", password: "pw123456", confirmPassword: "pw123456" },
  wizard_next: {},
  wizard_back: {},
  wizard_finish: {},
  dismiss_wizard: {},
  close_dialog: {},
};

async function runWithToolCall(toolName: string, args: Record<string, unknown>) {
  const repo = new MemoryAppRepository();
  await repo.upsertChatSession(makeSession());
  const result = await handleChatMessage(
    { chatSessionId: "chat-1", newUserMessage: "What does the document say about the total?" },
    {
      repository: repo,
      llmClient: makeLlmClientEmitting(toolName, args),
      groundxClient: makeGroundxClient(),
      groundxApiKey: "k",
      samplesBucketId: 28454,
      llmModelId: "test-model",
    },
  );
  return result.reply;
}

const emittable = intentCatalog.filter(
  (e): e is typeof e & { llm: { toolName: string } } => e.llm !== false,
);

describe("middleware tool→intent corpus (no real LLM)", () => {
  for (const entry of emittable) {
    const toolName = entry.llm.toolName;
    it(`${toolName} → ${entry.kind} (${getServerTool(toolName)?.category})`, async () => {
      const tool = getServerTool(toolName);
      expect(tool, `tool ${toolName} not in SERVER_TOOL_CATALOG`).toBeDefined();
      const args = TOOL_ARGS[toolName];
      expect(args, `no test args for ${toolName}`).toBeDefined();

      const reply = await runWithToolCall(toolName, args);

      if (tool!.category === "read") {
        const kinds = reply.intents.map((i) => (i.intent as { kind?: string }).kind);
        expect(kinds, `read tool ${toolName} should auto-dispatch its intent`).toContain(entry.kind);
      } else {
        const chip = reply.suggestedActions.find((a) => a.key === `tool:${toolName}`);
        expect(chip, `mutate tool ${toolName} should surface a tool: chip`).toBeDefined();
        expect((chip!.detail?.intent as { kind?: string } | undefined)?.kind).toBe(entry.kind);
      }
      expect(reply.toolFailures).toEqual([]);
    });
  }
});

describe("tool↔catalog parity", () => {
  it("every SERVER_TOOL_CATALOG tool with an intentBuilder has a catalog entry", () => {
    const catalogToolNames = new Set(emittable.map((e) => e.llm.toolName));
    const missing = SERVER_TOOL_CATALOG.filter((t) => typeof t.intentBuilder === "function")
      .map((t) => t.name)
      .filter((name) => !catalogToolNames.has(name));
    expect(missing).toEqual([]);
  });

  it("every catalog llm.toolName is a real SERVER_TOOL_CATALOG tool", () => {
    const unknown = emittable.map((e) => e.llm.toolName).filter((name) => !getServerTool(name));
    expect(unknown).toEqual([]);
  });
});

describe("invalid tool args surface as a ToolFailure, not an intent", () => {
  it("jump_to_page with a missing required page → toolFailure, no intent", async () => {
    const reply = await runWithToolCall("jump_to_page", { documentId: "doc-1" }); // page missing
    expect(reply.toolFailures.some((f) => f.name === "jump_to_page")).toBe(true);
    const kinds = reply.intents.map((i) => (i.intent as { kind?: string }).kind);
    expect(kinds).not.toContain("jumpToPage");
  });
});
