import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CF-13: mock the Sentry wrapper so we can assert captureException
// fires on chat-send failures. Hoist-safe — vi.mock is moved above
// the module imports by the runtime.
vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
  initSentry: vi.fn(() => false),
}));
import { captureException } from "@/lib/sentry";

import {
  chatReplyDebugSchema,
  chatReplySchema,
  chatScopeHintSchema,
  createChatSessionResultSchema,
  dispatchedIntentSchema,
  proposedSchemaFieldSchema,
  toolFailureSchema,
  type ChatReply as SharedChatReply,
  type ChatReplyDebug as SharedChatReplyDebug,
  type ChatScopeHint as SharedChatScopeHint,
  type CreateChatSessionResult as SharedCreateChatSessionResult,
  type DispatchedIntent as SharedDispatchedIntent,
  type ProposalEnvelopeProvenance as SharedProvenance,
  type ProposedSchemaField as SharedProposedSchemaField,
  type ToolFailure as SharedToolFailure,
} from "@groundx/shared";

import {
  __markChatSessionEnsured,
  __resetEnsuredChatSessions,
  chatErrorToUserCopy,
  ChatApiError,
  createChatSession,
  listChatMessages,
  sendChatMessage,
  type ChatDispatchedIntent,
  type ChatReply,
  type ChatReplyDebug,
  type ChatToolFailure,
  type CreateChatSessionResult,
  type ProposalEnvelopeProvenance,
  type ProposedSchemaField,
  type SendChatMessageInput,
} from "./chatSessions";

/**
 * 2026-05-31-core-data-followups §4 #18 — the `ProposedSchemaField` /
 * `ProposalEnvelopeProvenance` proposal-envelope wire types were declared on
 * BOTH sides of the app↔middleware boundary, and had silently DRIFTED (the app
 * declared `provenance?` optional, the middleware declared it required). They
 * are now single-sourced on `@groundx/shared`. These compile-time asserts are
 * load-bearing under `npm run build` (tsc): if the app re-forks the shape, the
 * `Eq` evaluates `false` and `Assert<false>` fails the build — a real wire-twin
 * drift guard, not a name-set check.
 */
type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
type _assertProposedField = Assert<Eq<ProposedSchemaField, SharedProposedSchemaField>>;
type _assertProvenance = Assert<Eq<ProposalEnvelopeProvenance, SharedProvenance>>;

describe("proposal-envelope wire twins (§4 #18)", () => {
  it("the shared proposed-schema-field schema validates the wire shape", () => {
    const parsed = proposedSchemaFieldSchema.safeParse({
      categoryId: "c1",
      name: "Total tax",
      type: "NUMBER",
      description: "the total tax amount",
      provenance: { version: "v1", verified: true },
    });
    expect(parsed.success).toBe(true);
  });
});

/**
 * 2026-05-31-chat-wire-types-shared — the `/api/chat/*` reply envelope was
 * declared TWICE (app `ChatReply` / `ChatDispatchedIntent` / `ChatToolFailure`
 * and middleware `ChatRouterResponse` / `DispatchedIntent` / `ToolFailure`) as
 * hand-mirrored byte-twins. These are now single-sourced on `@groundx/shared`.
 * The `Eq<>` asserts are load-bearing under `npm run build` (tsc): if either
 * side re-forks the shape, the `Assert<false>` fails the build — a real wire
 * drift guard, not a name-set check.
 */
type _assertChatReply = Assert<Eq<ChatReply, SharedChatReply>>;
type _assertDispatchedIntent = Assert<Eq<ChatDispatchedIntent, SharedDispatchedIntent>>;
type _assertToolFailure = Assert<Eq<ChatToolFailure, SharedToolFailure>>;
type _assertChatReplyDebug = Assert<Eq<ChatReplyDebug, SharedChatReplyDebug>>;
type _assertCreateChatSessionResult = Assert<
  Eq<CreateChatSessionResult, SharedCreateChatSessionResult>
>;
// `scopeHint` is the optional field on the input — assert the non-undefined
// shape single-sources off the shared `ChatScopeHint`.
type _assertScopeHint = Assert<
  Eq<NonNullable<SendChatMessageInput["scopeHint"]>, SharedChatScopeHint>
>;

describe("chat reply envelope wire twins (chat-wire-types-shared)", () => {
  it("the shared chatReplySchema validates a representative reply fixture byte-for-byte", () => {
    const parsed = chatReplySchema.safeParse({
      mode: "rag",
      answer: "The April utility total is $142.30.",
      citations: [
        { documentId: "doc-1", page: 1, snippet: "Total amount due $142.30", tier: "exact" },
      ],
      suggestedActions: [{ key: "show-source", label: "Show source", detail: { documentId: "doc-1" } }],
      intents: [
        { name: "show_source", arguments: { documentId: "doc-1" }, intent: { kind: "doc-viewer" } },
      ],
      toolFailures: [{ name: "bogus_tool", reason: "unknown tool" }],
      proposedSchemaField: {
        categoryId: "c1",
        name: "Total tax",
        type: "NUMBER",
        description: "the total tax amount",
        provenance: { version: "v1", verified: true },
      },
      _debug: {
        mode: "rag",
        scope: { type: "bucket", bucketId: 28454, filter: { projectId: "utility" } },
        groundx: {
          path: "/v1/search/28454",
          query: "total amount",
          n: 6,
          filter: { projectId: "utility" },
          resultCount: 1,
          topSnippets: [{ documentId: "doc-1", fileName: "april.pdf", score: 0.9, text: "..." }],
        },
        llm: { model: "gpt-4o", snippetBlockChars: 600, userContentChars: 700, systemChars: 200, answerChars: 40 },
      },
    });
    expect(parsed.success).toBe(true);
  });

  // 2026-06-11-retire-chatreply-tools-field — the always-empty `tools` array
  // is retired from the envelope; tool calls travel on intents[] /
  // suggestedActions[] / toolFailures[] only.
  it("the reply envelope carries no `tools` field (retired)", () => {
    expect("tools" in chatReplySchema.shape).toBe(false);
  });

  it("dispatchedIntentSchema + toolFailureSchema validate their wire shapes", () => {
    expect(
      dispatchedIntentSchema.safeParse({ name: "show_source", arguments: {}, intent: {} }).success,
    ).toBe(true);
    expect(toolFailureSchema.safeParse({ name: "x", reason: "y" }).success).toBe(true);
  });

  it("chatReplyDebugSchema accepts a debug payload whose scope is a real ContentScope variant", () => {
    expect(
      chatReplyDebugSchema.safeParse({
        mode: "hybrid",
        scope: { type: "documents", documentIds: ["d1", "d2"] },
        groundx: null,
        llm: null,
      }).success,
    ).toBe(true);
  });

  it("createChatSessionResultSchema + chatScopeHintSchema validate their wire shapes", () => {
    expect(
      createChatSessionResultSchema.safeParse({
        chatSessionId: "chat-1",
        ownerUserId: null,
        ownerAnonId: "anon-abc",
      }).success,
    ).toBe(true);
    expect(
      chatScopeHintSchema.safeParse({ fileName: "april.pdf", scenarioTitle: "Utility" }).success,
    ).toBe(true);
  });
});

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
  __resetEnsuredChatSessions();
  vi.mocked(captureException).mockReset();
  // SC-01: pre-set the csrf_token cookie so `csrfFetch` skips its
  // bootstrap GET and tests can count fetch calls as before.
  if (typeof document !== "undefined") {
    document.cookie = "csrf_token=test-csrf-token; path=/";
  }
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("createChatSession", () => {
  it("POSTs to /api/chat-sessions and returns the parsed result", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ chatSessionId: "chat-1", ownerUserId: null, ownerAnonId: "anon-abc" }),
    });
    const result = await createChatSession({
      id: "chat-1",
      onboardingSessionId: "onb-1",
      title: "Onboarding",
      isOnboarding: true,
    });
    // csrfFetch wraps headers in a Headers instance — assert on the
    // (path, init) shape without pinning the headers type.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [path, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toBe("/api/chat-sessions");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).credentials).toBe("include");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(result).toMatchObject({ chatSessionId: "chat-1", ownerAnonId: "anon-abc" });
  });

  it("throws with status + detail when the BFF returns non-2xx", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Authentication required" }),
    });
    await expect(
      createChatSession({ id: "chat-x", title: "Untitled", isOnboarding: false }),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe("sendChatMessage", () => {
  it("ensures the chat session exists, then POSTs /api/chat/messages", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ chatSessionId: "chat-1", ownerUserId: null, ownerAnonId: "anon-abc" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          userMessageId: "m-u-1",
          assistantMessageId: "m-a-1",
          reply: {
            mode: "rag",
            answer: "Here's the answer.",
            citations: [],
            suggestedActions: [],
          },
          compressionRan: false,
        }),
      });

    const result = await sendChatMessage({
      chatSessionId: "chat-1",
      newUserMessage: "What is RAG?",
      sessionMeta: { title: "Onboarding", isOnboarding: true, onboardingSessionId: "onb-1" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/chat-sessions");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/chat/messages");
    expect(result.reply.answer).toBe("Here's the answer.");
  });

  it("skips the ensure-create call on the second send for the same session id", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ chatSessionId: "chat-1" }) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          userMessageId: "m-u-1",
          assistantMessageId: "m-a-1",
          reply: { mode: "rag", answer: "one", citations: [], suggestedActions: [] },
          compressionRan: false,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          userMessageId: "m-u-2",
          assistantMessageId: "m-a-2",
          reply: { mode: "rag", answer: "two", citations: [], suggestedActions: [] },
          compressionRan: false,
        }),
      });

    const meta = { title: "Onboarding", isOnboarding: true, onboardingSessionId: "onb-1" };
    await sendChatMessage({ chatSessionId: "chat-1", newUserMessage: "first", sessionMeta: meta });
    await sendChatMessage({ chatSessionId: "chat-1", newUserMessage: "second", sessionMeta: meta });

    // ensure-create fires only once
    const ensureCalls = fetchMock.mock.calls.filter((c) => c[0] === "/api/chat-sessions");
    expect(ensureCalls).toHaveLength(1);
    const sendCalls = fetchMock.mock.calls.filter((c) => c[0] === "/api/chat/messages");
    expect(sendCalls).toHaveLength(2);
  });

  it("invalidates the ensured-session cache when /api/chat/messages returns 404", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      // first send: ensure-create + 404 from message endpoint
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ chatSessionId: "chat-1" }) })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "chat_session_not_found" }),
      })
      // second send: should re-create then succeed
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ chatSessionId: "chat-1" }) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          userMessageId: "m-u",
          assistantMessageId: "m-a",
          reply: { mode: "rag", answer: "ok", citations: [], suggestedActions: [] },
          compressionRan: false,
        }),
      });

    const meta = { title: "Onboarding", isOnboarding: true, onboardingSessionId: "onb-1" };

    // First send fails with 404 → cache invalidated.
    await expect(
      sendChatMessage({ chatSessionId: "chat-1", newUserMessage: "first", sessionMeta: meta }),
    ).rejects.toMatchObject({ status: 404 });

    // Second send must re-run the ensure-create step (not skip it).
    await sendChatMessage({ chatSessionId: "chat-1", newUserMessage: "second", sessionMeta: meta });
    const ensureCalls = fetchMock.mock.calls.filter((c) => c[0] === "/api/chat-sessions");
    expect(ensureCalls).toHaveLength(2); // once before each send
  });

  it("does NOT invalidate the cache on non-404 errors (5xx is transient)", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ chatSessionId: "chat-1" }) })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: "router_failed" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          userMessageId: "m-u",
          assistantMessageId: "m-a",
          reply: { mode: "rag", answer: "ok", citations: [], suggestedActions: [] },
          compressionRan: false,
        }),
      });

    const meta = { title: "Onboarding", isOnboarding: true, onboardingSessionId: "onb-1" };

    await expect(
      sendChatMessage({ chatSessionId: "chat-1", newUserMessage: "first", sessionMeta: meta }),
    ).rejects.toMatchObject({ status: 502 });

    // Retry — ensure-create should NOT fire again (cache intact).
    await sendChatMessage({ chatSessionId: "chat-1", newUserMessage: "second", sessionMeta: meta });
    const ensureCalls = fetchMock.mock.calls.filter((c) => c[0] === "/api/chat-sessions");
    expect(ensureCalls).toHaveLength(1);
  });

  it("throws with the server error envelope when /api/chat/messages returns non-2xx", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ chatSessionId: "chat-1" }) })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: "router_failed:upstream timeout" }),
      });

    await expect(
      sendChatMessage({
        chatSessionId: "chat-1",
        newUserMessage: "hi",
        sessionMeta: { title: "Onboarding", isOnboarding: true, onboardingSessionId: "onb-1" },
      }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("forwards optional intent hint to the message endpoint", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ chatSessionId: "chat-1" }) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          userMessageId: "m-u",
          assistantMessageId: "m-a",
          reply: { mode: "rag", answer: "x", citations: [], suggestedActions: [] },
          compressionRan: false,
        }),
      });

    await sendChatMessage({
      chatSessionId: "chat-1",
      newUserMessage: "hi",
      intent: "extract.field-hovered",
      sessionMeta: { title: "Onboarding", isOnboarding: true, onboardingSessionId: "onb-1" },
    });

    const sendCall = fetchMock.mock.calls.find((c) => c[0] === "/api/chat/messages");
    expect(sendCall).toBeDefined();
    const body = JSON.parse((sendCall![1] as RequestInit).body as string);
    expect(body.intent).toBe("extract.field-hovered");
  });

  // CF-13 — chat-send failures route to Sentry.captureException with
  // route + chatSessionId + status as extras. The wrapper is a no-op
  // when DSN is unset, but we still want every catch site to call
  // through so production observability "just works" once DSN is wired.
  describe("CF-13 chat-send Sentry wiring", () => {
    it("captures exception on 5xx with route + chatSessionId + status extras", async () => {
      const meta = { title: "Onboarding", isOnboarding: true, onboardingSessionId: "onb-1" };
      (global.fetch as ReturnType<typeof vi.fn>)
        // ensure-create — complete result so its parse-boundary validate stays
        // silent and this asserts ONLY the message-send error capture.
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ chatSessionId: "chat-1", ownerUserId: null, ownerAnonId: "anon-a" }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          json: async () => ({ error: "bad gateway" }),
        });
      await expect(
        sendChatMessage({ chatSessionId: "chat-1", newUserMessage: "Q", sessionMeta: meta }),
      ).rejects.toThrow();
      expect(captureException).toHaveBeenCalledTimes(1);
      const [err, extras] = vi.mocked(captureException).mock.calls[0];
      expect(err).toBeInstanceOf(Error);
      expect(extras).toEqual({
        route: "/api/chat/messages",
        chatSessionId: "chat-1",
        status: 502,
      });
    });

    it("still captures on 404 (after invalidating the cache)", async () => {
      const meta = { title: "Onboarding", isOnboarding: true, onboardingSessionId: "onb-1" };
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ chatSessionId: "chat-2", ownerUserId: null, ownerAnonId: "anon-b" }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          json: async () => ({ error: "not found" }),
        });
      await expect(
        sendChatMessage({ chatSessionId: "chat-2", newUserMessage: "Q", sessionMeta: meta }),
      ).rejects.toThrow();
      expect(captureException).toHaveBeenCalledTimes(1);
      const [, extras] = vi.mocked(captureException).mock.calls[0];
      expect(extras).toMatchObject({ status: 404 });
    });

    // CF-08 — per-status client error mapping. The mapping is what
    // F2 / F5 consume to render the right UX in catch sites.
    describe("CF-08 chatErrorToUserCopy", () => {
      it("401 → reauth kind + 'sign in to continue' copy", () => {
        const result = chatErrorToUserCopy(new ChatApiError("x", 401, null));
        expect(result.kind).toBe("reauth");
        expect(result.message).toMatch(/sign in/i);
        expect(result.retryable).toBe(false);
      });

      it("501 → not-yet kind + 'can't answer that yet' copy", () => {
        const result = chatErrorToUserCopy(new ChatApiError("x", 501, null));
        expect(result.kind).toBe("not-yet");
        expect(result.message).toMatch(/can't answer that yet|not available yet/i);
        expect(result.retryable).toBe(false);
      });

      it("504 → timeout kind + retry copy + retryable=true", () => {
        const result = chatErrorToUserCopy(new ChatApiError("x", 504, null));
        expect(result.kind).toBe("timeout");
        expect(result.message).toMatch(/took too long|timed out/i);
        expect(result.retryable).toBe(true);
      });

      it("502/503/5xx → upstream kind + generic 'try again' copy", () => {
        for (const status of [500, 502, 503]) {
          const result = chatErrorToUserCopy(new ChatApiError("x", status, null));
          expect(result.kind).toBe("upstream");
          expect(result.message).toMatch(/try again|something went wrong/i);
          expect(result.retryable).toBe(true);
        }
      });

      it("400 → developer-visible 'bug' kind + technical copy", () => {
        const result = chatErrorToUserCopy(new ChatApiError("x", 400, null));
        expect(result.kind).toBe("bug");
        expect(result.message).toMatch(/programming error|invalid request/i);
        expect(result.retryable).toBe(false);
      });

      it("404 → not-found kind (session row gone) with 'refresh' hint", () => {
        const result = chatErrorToUserCopy(new ChatApiError("x", 404, null));
        expect(result.kind).toBe("not-found");
        expect(result.message).toMatch(/refresh|session/i);
        expect(result.retryable).toBe(false);
      });

      it("non-ChatApiError (network throw) → network kind", () => {
        const result = chatErrorToUserCopy(new Error("Failed to fetch"));
        expect(result.kind).toBe("network");
        expect(result.message).toMatch(/couldn't reach|connection|network/i);
        expect(result.retryable).toBe(true);
      });

      it("unknown thrown value → fallback generic 'something went wrong'", () => {
        const result = chatErrorToUserCopy("just a string");
        expect(result.kind).toBe("unknown");
        expect(result.message).toMatch(/something went wrong/i);
        expect(result.retryable).toBe(false);
      });
    });

    it("does NOT capture on a successful send", async () => {
      const meta = { title: "Onboarding", isOnboarding: true, onboardingSessionId: "onb-1" };
      // chat-wire-types-shared — the create-result + reply envelopes are now
      // runtime-validated against the shared schemas; a malformed payload
      // routes to Sentry. Use COMPLETE wire shapes here so the "no capture on
      // success" guard tests the success path, not a fixture-shape drift.
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ chatSessionId: "chat-3", ownerUserId: null, ownerAnonId: "anon-z" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            userMessageId: "u1",
            assistantMessageId: "a1",
            reply: {
              mode: "rag",
              answer: "ok",
              citations: [],
              suggestedActions: [],
              intents: [],
              toolFailures: [],
              proposedSchemaField: null,
            },
            compressionRan: false,
          }),
        });
      await sendChatMessage({ chatSessionId: "chat-3", newUserMessage: "Q", sessionMeta: meta });
      expect(captureException).not.toHaveBeenCalled();
    });
  });
});

describe("listChatMessages (RT-01)", () => {
  // Pre-mark each test session id as ensured so the helper's
  // self-trigger ensure POST is a no-op. Per-test fetch counts then
  // reflect only the helper's GET.
  beforeEach(() => {
    __markChatSessionEnsured("chat-r");
    __markChatSessionEnsured("c-abc/def?x=1");
    __markChatSessionEnsured("chat-missing");
    __markChatSessionEnsured("chat-other");
    __markChatSessionEnsured("chat-noauth");
  });

  it("GETs /api/chat-sessions/:id/messages and returns the array", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        messages: [
          { id: "m1", chatSessionId: "chat-r", turnIndex: 1, role: "user", content: "hi", errorCode: null },
          { id: "m2", chatSessionId: "chat-r", turnIndex: 2, role: "assistant", content: "hello", errorCode: null },
        ],
      }),
    });

    const messages = await listChatMessages("chat-r");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [path, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toBe("/api/chat-sessions/chat-r/messages");
    expect((init as RequestInit).method).toBe("GET");
    expect((init as RequestInit).credentials).toBe("include");
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ id: "m1", role: "user", content: "hi" });
    expect(messages[1]).toMatchObject({ id: "m2", role: "assistant", content: "hello" });
  });

  it("URL-encodes the session id so prefixed ids (e.g. c-<uuid>) round-trip safely", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ messages: [] }),
    });
    await listChatMessages("c-abc/def?x=1");
    const [path] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    // Slash + ? + = are all encoded so the route param resolves to the
    // intended literal id instead of being split across path segments.
    expect(path).toBe("/api/chat-sessions/c-abc%2Fdef%3Fx%3D1/messages");
  });

  it("resolves 404 to an empty array (no row yet ≠ error)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: "chat_session_not_found" }),
    });
    const messages = await listChatMessages("chat-missing");
    expect(messages).toEqual([]);
  });

  it("throws ChatApiError with the status on other non-2xx (403 forbidden)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "not_session_owner" }),
    });
    await expect(listChatMessages("chat-other")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("throws ChatApiError on 401 (no session cookie)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "no_session" }),
    });
    await expect(listChatMessages("chat-noauth")).rejects.toBeInstanceOf(ChatApiError);
  });
});
