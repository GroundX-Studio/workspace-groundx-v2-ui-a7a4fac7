import { vi } from "vitest";

import { realApi, type Api } from "@/api/client";

/**
 * One injected test fake for the whole `Api` surface.
 *
 * Instead of per-file `vi.mock("@/api/...")`, tests render inside an
 * `ApiProvider value={makeFakeApi(...)}` (the render harnesses do this by
 * default) and override only the methods they assert.
 *
 * The base is derived by introspecting the REAL client (`realApi`) and
 * replacing every leaf function with a resolved `vi.fn`. Deriving from
 * `realApi` (rather than a hand-written literal) means the fake CANNOT drift
 * from the real surface — add a method to the client and the fake grows with
 * it automatically. The boundary is type-checked: overrides are
 * `DeepPartial<Api>` and the return is `Api`.
 */
type AnyFn = (...args: unknown[]) => unknown;

type DeepApiPartial<T> = {
  [K in keyof T]?: T[K] extends AnyFn ? T[K] : T[K] extends object ? DeepApiPartial<T[K]> : T[K];
};

export type ApiOverrides = DeepApiPartial<Api>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const defaultApiResult = (path: string[], args: unknown[]): unknown => {
  const name = path.at(-1) ?? "";
  if (name === "login") {
    return {
      username: "acct-1",
      token: "",
      xJwtToken: "",
      customer: {
        username: "acct-1",
        email: "pat@example.com",
        first: "Pat",
        last: "Lee",
      },
    };
  }
  if (name === "register") {
    return {
      username: "acct-1",
      token: "",
      xJwtToken: "",
      apiKeys: [],
    };
  }
  if (name === "getUserData") {
    const username = typeof args[0] === "string" && args[0].length > 0 ? args[0] : "acct-1";
    return {
      username,
      customer: {
        username,
        email: "pat@example.com",
        first: "Pat",
        last: "Lee",
        appMetadata: null,
      },
    };
  }
  if (name === "updateAppMetadata") {
    return args[0] ?? {};
  }
  if (name === "issueOnboardingSession" || name === "ensureAnonSession") {
    return { sessionId: "test-anon-session", anonymous: true };
  }
  if (name === "createChatSession") {
    const input = args[0] as { id?: string } | undefined;
    return {
      chatSessionId: input?.id ?? "test-chat-session",
      ownerUserId: null,
      ownerAnonId: "test-anon-owner",
    };
  }
  if (name === "sendChatMessage") {
    return {
      userMessageId: "test-user-message",
      assistantMessageId: "test-assistant-message",
      compressionRan: false,
      reply: {
        mode: "grounded",
        answer: "",
        citations: [],
        suggestedActions: [],
        tools: [],
        intents: [],
        toolFailures: [],
        proposedSchemaField: null,
      },
    };
  }
  if (name === "listChatMessages" || name === "listChatSessions") return [];
  if (name.startsWith("list") || name.startsWith("search")) {
    if (path.includes("groundxBuckets") || path.includes("partnerBuckets")) return { buckets: [] };
    if (path.includes("groundxDocuments")) return { documents: [] };
    if (path.includes("groundxGroups") || path.includes("partnerGroups")) return { groups: [] };
    if (path.includes("groundxWorkflows")) return { workflows: [] };
    if (path.includes("groundxApiKeys") || path.includes("partnerApiKeys")) return { apiKeys: [] };
    if (path.includes("partnerProjects")) return { projects: [] };
    return [];
  }
  if (name.startsWith("reset") || name.startsWith("confirm")) return { message: "OK" };
  if (name.startsWith("delete") || name.startsWith("remove") || name === "logout") return { success: true };
  return undefined;
};

/** Recursively clone `shape`, replacing every function with a resolved mock. */
const fakeify = (shape: Record<string, unknown>, path: string[] = []): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(shape)) {
    const nextPath = [...path, key];
    if (typeof value === "function") out[key] = vi.fn(async (...args: unknown[]) => defaultApiResult(nextPath, args));
    else if (isPlainObject(value)) out[key] = fakeify(value, nextPath);
    else out[key] = value;
  }
  return out;
};

/** Recursively merge `overrides` onto `base`; functions and non-objects replace. */
const deepMerge = (
  base: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key] as Record<string, unknown>, value);
    } else {
      out[key] = value;
    }
  }
  return out;
};

export const makeFakeApi = (overrides: ApiOverrides = {}): Api => {
  const base = fakeify(realApi as unknown as Record<string, unknown>);
  return deepMerge(base, overrides as Record<string, unknown>) as Api;
};
