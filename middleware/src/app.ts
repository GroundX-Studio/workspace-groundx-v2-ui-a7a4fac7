import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import type { AppEnv } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { encryptSecret } from "./lib/crypto.js";
import { ensureMetrics, httpRequestDuration, httpRequestsTotal } from "./lib/metrics.js";
import { createSessionRecord, clearSessionCookie, requireAuthenticatedUser, requireSession, sessionMiddleware, setSessionCookie } from "./middleware/session.js";
import { ScenarioRegistry } from "./scenarios/registry.js";
import { ChatHandlerError, handleChatMessage, type HandleChatMessageRequest } from "./services/chatHandler.js";
import { sendUpstreamResponse } from "./services/http.js";
import type {
  AnonymousChatPayload,
  AppRepository,
  ChatMessageRecord,
  ChatSessionEntityRecord,
  ChatSessionRecord,
  ConversationSummaryRecord,
  GroundXClient,
  GroundXPartnerClient,
  LlmClient,
  ViewerEventRecord,
} from "./types.js";

function basicCredentials(req: Request): { email?: string; password?: string } {
  const header = req.headers.authorization;
  if (!header?.startsWith("Basic ")) return {};
  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator === -1) return {};
  return { email: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
}

function requestBodyObject(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === "object" && !Array.isArray(req.body)
    ? (req.body as Record<string, unknown>)
    : {};
}

function stringRecord(input: unknown): Record<string, string | undefined> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, string | undefined>)
    : {};
}

function parseMetadataPatch(body: unknown): { onboardingState?: string | null } | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Metadata payload must be an object" };
  }

  const input = body as Record<string, unknown>;
  const allowedFields = new Set(["onboardingState"]);
  const unsupportedFields = Object.keys(input).filter((field) => !allowedFields.has(field));
  if (unsupportedFields.length) {
    return { error: `Unsupported metadata field: ${unsupportedFields[0]}` };
  }

  if (!Object.prototype.hasOwnProperty.call(input, "onboardingState")) {
    return { error: "At least one supported metadata field is required" };
  }

  if (input.onboardingState !== null && input.onboardingState !== undefined && typeof input.onboardingState !== "string") {
    return { error: "onboardingState must be a string or null" };
  }

  return { onboardingState: input.onboardingState ?? null };
}

export interface AppDependencies {
  env: AppEnv;
  repository: AppRepository;
  partnerClient: GroundXPartnerClient;
  groundxClient: GroundXClient;
  llmClient: LlmClient;
  scenarioRegistry: ScenarioRegistry;
}

export function createApp({ env, repository, partnerClient, groundxClient, llmClient, scenarioRegistry }: AppDependencies): Express {
  const app = express();
  app.set("etag", false);
  app.disable("x-powered-by");

  // Trust proxy when behind an Ingress/ELB. Helps rate-limit + cookie-secure
  // pick the right client IP/scheme in EKS deployments.
  if (env.NODE_ENV === "production") app.set("trust proxy", 1);

  // Security headers. CSP keeps the browser from fetching anything outside our
  // own origin + the allowlisted analytics domains; deploy-tunable via env so
  // the browser can reach configured PostHog / Sentry / analytics hosts.
  const csp_connect_src: string[] = ["'self'"];
  const csp_script_src: string[] = ["'self'"];
  const csp_frame_src: string[] = ["'self'", "https://calendly.com", "https://*.calendly.com"];
  const csp_img_src: string[] = ["'self'", "data:", "blob:"];
  if (env.POSTHOG_HOST) csp_connect_src.push(env.POSTHOG_HOST);
  if (env.SENTRY_DSN) {
    // Sentry SDK posts to https://<key>@<host>/<projectId>; the ingest host
    // is the DSN's URL origin.
    try {
      const parsed = new URL(env.SENTRY_DSN);
      csp_connect_src.push(`${parsed.protocol}//${parsed.host}`);
    } catch {
      /* invalid Sentry DSN — skip, Zod would have already rejected it */
    }
  }
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT) csp_connect_src.push(env.OTEL_EXPORTER_OTLP_ENDPOINT);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "default-src": ["'self'"],
          "img-src": csp_img_src,
          // Web fonts are loaded from Google Fonts (Inter) and Fontshare
          // (Thicccboi). The CSS @imports trigger a stylesheet fetch from
          // fonts.googleapis.com / api.fontshare.com and the actual font
          // binaries come from fonts.gstatic.com / cdn.fontshare.com.
          "script-src": csp_script_src,
          "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://api.fontshare.com"],
          "font-src": ["'self'", "data:", "https://fonts.gstatic.com", "https://cdn.fontshare.com"],
          "connect-src": csp_connect_src,
          "frame-src": csp_frame_src,
        },
      },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    })
  );

  // Per-route counters + latency histogram. Cheap to call always; gated behind
  // `METRICS_ENABLED` only at the /metrics endpoint, not for capture.
  ensureMetrics();
  app.use((req, res, next) => {
    const endTimer = httpRequestDuration.startTimer({ method: req.method });
    res.on("finish", () => {
      // Route templates like `/api/v1/...` would explode label cardinality, so
      // we coalesce to the top-level mount point. Replace later with named
      // routes once the surface stabilizes in Phase 1.
      const route = req.originalUrl.split("?")[0]?.split("/").slice(0, 4).join("/") || req.originalUrl;
      const labels = { method: req.method, route, status: String(res.statusCode) };
      httpRequestsTotal.inc(labels);
      endTimer({ route, status: String(res.statusCode) });
    });
    next();
  });

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => shouldSkipRequestLog(req.url) },
    }),
  );
  app.use(cors({ origin: env.NODE_ENV === "production" ? env.ALLOWED_ORIGIN ?? false : true, credentials: true }));
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(sessionMiddleware(env, repository));

  // Rate-limit buckets.
  const authLimiter = rateLimit({
    windowMs: 60_000,
    limit: env.RATE_LIMIT_AUTH_PER_MIN,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => env.NODE_ENV === "test",
  });
  const apiLimiter = rateLimit({
    windowMs: 60_000,
    limit: env.RATE_LIMIT_API_PER_MIN,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => env.NODE_ENV === "test",
  });
  const llmLimiter = rateLimit({
    windowMs: 60_000,
    limit: env.RATE_LIMIT_LLM_PER_MIN,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => env.NODE_ENV === "test",
  });

  app.get("/api/healthz", (_req, res) => res.json({ status: "ok" }));

  if (env.METRICS_ENABLED) {
    app.get("/api/metrics", async (_req, res, next) => {
      try {
        const registry = ensureMetrics();
        res.set("Content-Type", registry.contentType);
        res.send(await registry.metrics());
      } catch (error) {
        next(error);
      }
    });
  }

  app.use("/api/auth", authLimiter);

  app.post("/api/auth/register", async (req, res, next) => {
    try {
      const credentials = basicCredentials(req);
      const body = requestBodyObject(req);
      const customer = stringRecord(body.customer ?? body);
      const email = typeof body.email === "string" ? body.email : credentials.email;
      const password = typeof body.password === "string" ? body.password : credentials.password;
      const { first, last, company, partnerUserId, phone } = customer;
      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }
      const auth = await partnerClient.registerCustomer({ email, password, first, last, company, partnerUserId, phone });
      const apiKey = await partnerClient.createApiKey(auth.username, "app-session");
      const session = createSessionRecord(auth.username, encryptSecret(apiKey, env.SESSION_SECRET), req.session?.id);
      await repository.createSession(session);
      await repository.upsertMetadata({ groundxUsername: auth.username });
      setSessionCookie(res, env, session.id);
      res.json({ success: true, username: auth.username, token: auth.token });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/login", async (req, res, next) => {
    try {
      const credentials = basicCredentials(req);
      const body = stringRecord(requestBodyObject(req));
      const email = body.email ?? credentials.email;
      const password = body.password ?? credentials.password;
      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }
      const auth = await partnerClient.loginCustomer({ email, password });
      const apiKey = await partnerClient.createApiKey(auth.username, "app-session");
      const session = createSessionRecord(auth.username, encryptSecret(apiKey, env.SESSION_SECRET), req.session?.id);
      await repository.createSession(session);
      await repository.upsertMetadata({ groundxUsername: auth.username });
      setSessionCookie(res, env, session.id);
      res.json({ success: true, username: auth.username, token: auth.token });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/logout", requireSession, async (req, res) => {
    await repository.deleteSession(req.session!.id);
    clearSessionCookie(res);
    res.json({ success: true });
  });

  app.get("/api/auth/me", requireAuthenticatedUser, async (req, res, next) => {
    try {
      const [customer, metadata] = await Promise.all([
        partnerClient.getCustomer(req.session!.groundxUsername),
        repository.getMetadata(req.session!.groundxUsername),
      ]);
      res.json({ authenticated: true, username: req.session!.groundxUsername, ...customer, appMetadata: metadata });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/me/metadata", requireAuthenticatedUser, async (req, res, next) => {
    try {
      const patch = parseMetadataPatch(req.body);
      if ("error" in patch) {
        res.status(400).json({ error: patch.error });
        return;
      }

      const groundxUsername = req.session!.groundxUsername;
      const existingMetadata = await repository.getMetadata(groundxUsername);
      // Spread the patch (not a fixed shape) so future fields land
      // automatically — a regression that adds a metadata field and forgets
      // to update this block would otherwise silently drop user data.
      const appMetadata = {
        ...existingMetadata,
        groundxUsername,
        ...patch,
      };
      await repository.upsertMetadata(appMetadata);
      res.json({ appMetadata });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/password/reset", async (req, res, next) => {
    try {
      const body = requestBodyObject(req);
      const payload = stringRecord(body.customer ?? body);
      const { email } = payload;
      if (!email) {
        res.status(400).json({ error: "Email is required" });
        return;
      }
      const result = await partnerClient.requestPasswordReset(email);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/password/confirm", async (req, res, next) => {
    try {
      const { email, newPassword, code } = stringRecord(requestBodyObject(req));
      if (!email || !newPassword || !code) {
        res.status(400).json({ error: "Email, new password, and code are required" });
        return;
      }
      const result = await partnerClient.confirmPasswordReset({ email, newPassword, code });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Anonymous onboarding session. Issues a session cookie scoped to onboarding
  // only — no Partner customer attached yet. Promotion happens on register or
  // login (cookie id is preserved; the existing row gets a `groundxUsername`
  // and an encrypted API key).
  app.post("/api/onboarding/session", async (req, res, next) => {
    try {
      if (req.session) {
        res.json({ sessionId: req.session.id, anonymous: !req.session.groundxApiKey });
        return;
      }
      const session = createSessionRecord("", null);
      await repository.createSession(session);
      setSessionCookie(res, env, session.id);
      res.json({ sessionId: session.id, anonymous: true });
    } catch (error) {
      next(error);
    }
  });

  // Login-claim: ingest the anonymous user's localStorage chat-session
  // payload into the DB under their new owner_user_id. Triggered by the
  // frontend right after a successful F6 gate sign-up. The whole payload
  // is upserted in a single transaction so a partial failure does not
  // leave the user half-claimed.
  app.post("/api/chat-sessions/claim", apiLimiter, requireAuthenticatedUser, async (req, res, next) => {
    try {
      const session = req.session!;
      const ownerUserId = session.groundxUsername;
      if (!ownerUserId) {
        res.status(401).json({ error: "no_signed_in_user" });
        return;
      }
      const payload = parseAnonymousChatPayload(req.body);
      if (!payload) {
        res.status(400).json({ error: "invalid_payload" });
        return;
      }
      await repository.claimAnonymousChatPayload(ownerUserId, payload);
      res.json({
        claimedSessions: payload.chatSessions.length,
        claimedMessages: payload.chatMessages.length,
        claimedSummaries: payload.conversationSummaries.length,
        claimedEntities: payload.chatSessionEntities.length,
        claimedViewerEvents: payload.viewerEvents.length,
      });
    } catch (error) {
      next(error);
    }
  });

  // The chat surface's single entry point. Routes through chatHandler,
  // which validates → persists the user message → builds the 3-axis
  // context bundle → optionally compresses → calls routeChat (mock or
  // live RAG path) → persists the assistant reply. Returns the typed
  // envelope (mode/answer/citations/suggestedActions + the persisted
  // message ids) so the client can render and link back to history.
  app.post("/api/chat/messages", apiLimiter, requireSession, async (req, res, next) => {
    try {
      const session = req.session!;
      const payload = parseChatMessageRequest(req.body);
      if (!payload) {
        res.status(400).json({ error: "invalid_payload" });
        return;
      }
      // Anonymous onboarding sessions don't have a customer-scoped key;
      // fall through to the partner-owned anon key (used for the samples
      // bucket). Production deployments must set GROUNDX_ANON_API_KEY for
      // the live RAG path to work for anonymous visitors.
      const groundxApiKey = session.groundxApiKey ?? env.GROUNDX_ANON_API_KEY ?? null;

      const result = await handleChatMessage(payload, {
        repository,
        llmClient,
        groundxClient,
        groundxApiKey,
        searchBucketId: env.GROUNDX_SAMPLES_BUCKET_ID ?? null,
        llmModelId: env.LLM_MODEL_ID ?? "model",
        mockMode: env.MOCK_MODE,
      });
      res.json(result);
    } catch (error) {
      if (error instanceof ChatHandlerError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  // Public onboarding catalog. Reads the samples bucket and returns the
  // ScenarioConfig list parsed from each manifest doc's filter. No session
  // required — the samples are partner-owned, public content.
  app.get("/api/scenarios", apiLimiter, async (_req, res, next) => {
    try {
      const scenarios = await scenarioRegistry.list();
      // Include the samples bucket id so the frontend can construct
      // canonical URLs of the form /onboarding/<bucketId>/<scenarioId>
      // without having to know the env separately.
      res.json({ bucketId: env.GROUNDX_SAMPLES_BUCKET_ID ?? null, scenarios });
    } catch (error) {
      next(error);
    }
  });

  app.use("/api/v1", apiLimiter, requireSession, async (req: Request, res: Response, next) => {
    try {
      const apiKey = req.session!.groundxApiKey ?? env.GROUNDX_ANON_API_KEY;
      if (!apiKey) {
        res.status(503).json({ error: "GroundX API key is not available for this session" });
        return;
      }
      const upstreamPath = req.originalUrl.replace(/^\/api\/v1/, "") || "/";
      const response = await groundxClient.forward(upstreamPath, {
        method: req.method,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
        apiKey,
      });
      await sendUpstreamResponse(response, res);
    } catch (error) {
      next(error);
    }
  });

  app.use(["/api/customer", "/api/apikey", "/api/project", "/api/bucket", "/api/group"], apiLimiter, requireAuthenticatedUser, async (req, res, next) => {
    try {
      const path = req.originalUrl.replace(/^\/api/, "");
      const usesCustomerScopedHeader = !path.startsWith("/customer/");
      const response = await partnerClient.forward(path, {
        method: req.method,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
        ...(usesCustomerScopedHeader ? { customerKey: req.session!.groundxUsername } : {}),
      });
      await sendUpstreamResponse(response, res);
    } catch (error) {
      next(error);
    }
  });

  app.use("/api/llm", llmLimiter, requireSession, async (req, res, next) => {
    try {
      const upstreamPath = req.originalUrl.replace(/^\/api\/llm/, "") || "/";
      const response = await llmClient.forward(upstreamPath, {
        method: req.method,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
      });
      await sendUpstreamResponse(response, res);
    } catch (error) {
      next(error);
    }
  });

  app.use((error: any, req: Request, res: Response, _next: express.NextFunction) => {
    const status = Number(error?.status) || 500;
    // 5xx responses never leak the original error message — that often
    // contains DNS / DB / upstream-internal details. Client gets a stable
    // shape; full details land in the server log only.
    if (status >= 500) {
      logger.error(
        { err: error, url: req?.originalUrl, method: req?.method, upstreamStatus: error?.upstreamStatus },
        "Unhandled middleware error"
      );
      const payload: { error: string; upstreamStatus?: number } = { error: "Internal middleware error" };
      if (Number.isFinite(error?.upstreamStatus)) payload.upstreamStatus = Number(error.upstreamStatus);
      res.status(status).json(payload);
      return;
    }
    const payload: { error: string; upstreamStatus?: number } = {
      error: error?.message ?? "Bad request",
    };
    if (Number.isFinite(error?.upstreamStatus)) payload.upstreamStatus = Number(error.upstreamStatus);
    res.status(status).json(payload);
  });

  return app;
}

/**
 * Skip per-request log lines for endpoints that fire on a fixed schedule:
 *   - `/api/healthz` — Kubernetes liveness + readiness probes (~every 3s).
 *   - `/api/metrics` — Prometheus scrape interval.
 * Without this filter both endpoints drown the request log in noise.
 * Failures still surface because the actual handlers can log explicitly
 * on error paths; we only suppress the pino-http auto-logged success line.
 *
 * Exported for unit-test access; the only caller is the pino-http
 * `autoLogging.ignore` hook wired into createApp().
 */
export function shouldSkipRequestLog(url: string | undefined): boolean {
  if (!url) return false;
  return (
    url === "/api/healthz" ||
    url.startsWith("/api/healthz?") ||
    url === "/api/metrics" ||
    url.startsWith("/api/metrics?")
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Login-claim payload parsing
//
// The client sends a JSON bundle of ChatSession-related records straight from
// localStorage. We validate the shape conservatively here (the values are
// just JSON-serialized record types from the shared interface) before
// handing them to the repository. Anything missing/wrong → null, the
// endpoint returns 400.
// ──────────────────────────────────────────────────────────────────────────

function parseChatMessageRequest(body: unknown): HandleChatMessageRequest | null {
  if (!isObject(body)) return null;
  if (typeof body.chatSessionId !== "string" || !body.chatSessionId) return null;
  if (typeof body.newUserMessage !== "string") return null;
  const intent = body.intent;
  if (intent !== undefined && intent !== null && typeof intent !== "string") return null;
  return {
    chatSessionId: body.chatSessionId,
    newUserMessage: body.newUserMessage,
    intent: typeof intent === "string" ? intent : intent === null ? null : undefined,
  };
}

function parseAnonymousChatPayload(body: unknown): AnonymousChatPayload | null {
  if (!isObject(body)) return null;
  const chatSessions = parseArrayOf(body.chatSessions, parseChatSession);
  const chatMessages = parseArrayOf(body.chatMessages, parseChatMessage);
  const conversationSummaries = parseArrayOf(body.conversationSummaries, parseConversationSummary);
  const chatSessionEntities = parseArrayOf(body.chatSessionEntities, parseChatSessionEntity);
  const viewerEvents = parseArrayOf(body.viewerEvents, parseViewerEvent);
  if (
    chatSessions == null ||
    chatMessages == null ||
    conversationSummaries == null ||
    chatSessionEntities == null ||
    viewerEvents == null
  ) {
    return null;
  }
  return { chatSessions, chatMessages, conversationSummaries, chatSessionEntities, viewerEvents };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArrayOf<T>(input: unknown, parser: (item: unknown) => T | null): T[] | null {
  if (input == null) return [];
  if (!Array.isArray(input)) return null;
  const out: T[] = [];
  for (const item of input) {
    const parsed = parser(item);
    if (parsed == null) return null;
    out.push(parsed);
  }
  return out;
}

function parseDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function parseChatSession(item: unknown): ChatSessionRecord | null {
  if (!isObject(item)) return null;
  if (typeof item.id !== "string") return null;
  if (typeof item.onboardingSessionId !== "string") return null;
  if (typeof item.title !== "string") return null;
  const createdAt = parseDate(item.createdAt);
  const updatedAt = parseDate(item.updatedAt);
  if (!createdAt || !updatedAt) return null;
  return {
    id: item.id,
    onboardingSessionId: item.onboardingSessionId,
    ownerUserId: typeof item.ownerUserId === "string" ? item.ownerUserId : null,
    ownerAnonId: typeof item.ownerAnonId === "string" ? item.ownerAnonId : null,
    title: item.title,
    isOnboarding: Boolean(item.isOnboarding),
    activeEntityKey: typeof item.activeEntityKey === "string" ? item.activeEntityKey : null,
    currentIntent: isObject(item.currentIntent) ? item.currentIntent : null,
    createdAt,
    updatedAt,
    archivedAt: parseDate(item.archivedAt),
  };
}

function parseChatMessage(item: unknown): ChatMessageRecord | null {
  if (!isObject(item)) return null;
  if (typeof item.id !== "string") return null;
  if (typeof item.chatSessionId !== "string") return null;
  if (typeof item.turnIndex !== "number") return null;
  if (item.role !== "user" && item.role !== "assistant" && item.role !== "system" && item.role !== "tool") return null;
  if (typeof item.content !== "string") return null;
  const createdAt = parseDate(item.createdAt);
  if (!createdAt) return null;
  return {
    id: item.id,
    chatSessionId: item.chatSessionId,
    turnIndex: item.turnIndex,
    role: item.role,
    content: item.content,
    citationsJson: typeof item.citationsJson === "string" ? item.citationsJson : null,
    toolCallsJson: typeof item.toolCallsJson === "string" ? item.toolCallsJson : null,
    attachmentsJson: typeof item.attachmentsJson === "string" ? item.attachmentsJson : null,
    compressedIntoSummaryId: typeof item.compressedIntoSummaryId === "string" ? item.compressedIntoSummaryId : null,
    llmProvider: typeof item.llmProvider === "string" ? item.llmProvider : null,
    llmModelId: typeof item.llmModelId === "string" ? item.llmModelId : null,
    latencyMs: typeof item.latencyMs === "number" ? item.latencyMs : null,
    promptTokens: typeof item.promptTokens === "number" ? item.promptTokens : null,
    completionTokens: typeof item.completionTokens === "number" ? item.completionTokens : null,
    errorCode: typeof item.errorCode === "string" ? item.errorCode : null,
    createdAt,
  };
}

function parseConversationSummary(item: unknown): ConversationSummaryRecord | null {
  if (!isObject(item)) return null;
  if (typeof item.id !== "string") return null;
  if (typeof item.chatSessionId !== "string") return null;
  if (typeof item.fromMessageId !== "string" || typeof item.toMessageId !== "string") return null;
  if (typeof item.content !== "string" || typeof item.model !== "string") return null;
  const createdAt = parseDate(item.createdAt);
  if (!createdAt) return null;
  return {
    id: item.id,
    chatSessionId: item.chatSessionId,
    fromMessageId: item.fromMessageId,
    toMessageId: item.toMessageId,
    generation: typeof item.generation === "number" ? item.generation : 0,
    absorbedSummaryIdsJson: typeof item.absorbedSummaryIdsJson === "string" ? item.absorbedSummaryIdsJson : "[]",
    content: item.content,
    model: item.model,
    tokensIn: typeof item.tokensIn === "number" ? item.tokensIn : 0,
    tokensOut: typeof item.tokensOut === "number" ? item.tokensOut : 0,
    createdAt,
  };
}

function parseChatSessionEntity(item: unknown): ChatSessionEntityRecord | null {
  if (!isObject(item)) return null;
  if (typeof item.chatSessionId !== "string" || typeof item.entityKey !== "string") return null;
  const createdAt = parseDate(item.createdAt) ?? new Date();
  const lastVisitedAt = parseDate(item.lastVisitedAt) ?? createdAt;
  return {
    chatSessionId: item.chatSessionId,
    entityKey: item.entityKey,
    lastFrame: typeof item.lastFrame === "string" ? item.lastFrame : null,
    completedFramesJson: typeof item.completedFramesJson === "string" ? item.completedFramesJson : "[]",
    scanProgressJson: typeof item.scanProgressJson === "string" ? item.scanProgressJson : null,
    extractedValuesJson: typeof item.extractedValuesJson === "string" ? item.extractedValuesJson : null,
    createdAt,
    lastVisitedAt,
  };
}

function parseViewerEvent(item: unknown): ViewerEventRecord | null {
  if (!isObject(item)) return null;
  if (typeof item.id !== "string" || typeof item.chatSessionId !== "string") return null;
  if (typeof item.timestamp !== "number") return null;
  const allowedActions = new Set([
    "opened",
    "frame-advanced",
    "extracted-value-viewed",
    "citation-clicked",
    "scan-completed",
    "intent-dispatched",
    "left",
  ]);
  if (typeof item.action !== "string" || !allowedActions.has(item.action)) return null;
  if (item.source !== "user" && item.source !== "agent" && item.source !== "tour" && item.source !== "system") return null;
  return {
    id: item.id,
    chatSessionId: item.chatSessionId,
    timestamp: item.timestamp,
    entityKey: typeof item.entityKey === "string" ? item.entityKey : null,
    action: item.action as ViewerEventRecord["action"],
    source: item.source,
    detailJson: typeof item.detailJson === "string" ? item.detailJson : null,
  };
}
