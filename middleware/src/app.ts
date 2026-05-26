import { randomUUID } from "node:crypto";

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
import { CSRF_COOKIE, csrfMiddleware } from "./middleware/csrf.js";
import { createSessionRecord, clearSessionCookie, requireAuthenticatedUser, requireSession, sessionMiddleware, setSessionCookie } from "./middleware/session.js";
import { ScenarioRegistry } from "./scenarios/registry.js";
import { ChatHandlerError, handleChatMessage, type HandleChatMessageRequest } from "./services/chatHandler.js";
import { sendUpstreamResponse } from "./services/http.js";
import type {
  AppRepository,
  ChatSessionRecord,
  GroundXClient,
  GroundXPartnerClient,
  LlmClient,
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
  /**
   * CF-16: light-side LLM client. Optional. When unset, the chat
   * `llmClient` is reused for compression (single-LLM deployments).
   * `index.ts` builds this from the `LLM_LIGHT_*` env block.
   */
  lightLlmClient?: LlmClient;
  scenarioRegistry: ScenarioRegistry;
}

export function createApp({
  env,
  repository,
  partnerClient,
  groundxClient,
  llmClient,
  lightLlmClient,
  scenarioRegistry,
}: AppDependencies): Express {
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
  // SC-01 — CSRF defense, after cookieParser so we can read the
  // csrf_token cookie, and after sessionMiddleware so the session
  // cookie is established first (the order doesn't matter for
  // correctness — they're independent — but matters for log clarity).
  app.use(csrfMiddleware(env));

  // Rate-limit buckets. Key by session id when one is present, falling
  // back to client IP — this prevents one user behind a corporate NAT
  // from exhausting the bucket for everyone sharing the same egress IP.
  // The 'session+IP' keyGenerator preserves IP-only behavior for the
  // auth endpoints (no session yet at /api/auth/login etc.).
  const sessionAwareKey = (req: Request): string => {
    // express-rate-limit needs a non-empty string; fall back to ip.
    return req.session?.id ?? req.ip ?? "unknown";
  };
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
    keyGenerator: sessionAwareKey,
  });
  const llmLimiter = rateLimit({
    windowMs: 60_000,
    limit: env.RATE_LIMIT_LLM_PER_MIN,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => env.NODE_ENV === "test",
    keyGenerator: sessionAwareKey,
  });

  app.get("/api/healthz", (_req, res) => res.json({ status: "ok" }));

  // SC-01 — explicit CSRF-token bootstrap endpoint. The middleware
  // already issues the cookie on every response, but a client that
  // wants to fetch the token without piggybacking on another GET can
  // call this. Returns the same value that's in the `csrf_token`
  // cookie so a client can verify before any state-changing POST.
  app.get("/api/csrf/token", (req, res) => {
    res.json({ token: req.cookies?.[CSRF_COOKIE] ?? null });
  });

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

  // Server-side ChatSession row creation. Called by the frontend
  // ChatStoreContext when a new local session is minted so that the
  // DB has a parent row before the first POST /api/chat/messages.
  //
  // Idempotent: a repeat POST with the same id upserts the row. This
  // matters for client retries after transient errors and for the
  // localStorage rehydrate path (the store may try to ensure-create
  // every session it knows about on bootstrap).
  //
  // Ownership rule:
  //   - Authenticated session → ownerUserId = groundxUsername
  //   - Anonymous session     → ownerAnonId = req.session.id (cookie)
  // The F6 sign-up re-keys anon rows to owned rows via the claim route.
  app.post("/api/chat-sessions", apiLimiter, requireSession, async (req, res, next) => {
    try {
      const session = req.session!;
      const input = parseCreateChatSessionRequest(req.body);
      if (!input) {
        res.status(400).json({ error: "invalid_payload" });
        return;
      }
      const isAuthed = Boolean(session.groundxUsername);
      const now = new Date();
      const existing = await repository.getChatSession(input.id);
      const record: ChatSessionRecord = {
        id: input.id,
        onboardingSessionId: input.onboardingSessionId ?? input.id,
        ownerUserId: isAuthed ? session.groundxUsername : existing?.ownerUserId ?? null,
        ownerAnonId: isAuthed ? null : session.id,
        title: input.title,
        isOnboarding: input.isOnboarding,
        activeEntityKey: input.activeEntityKey ?? null,
        currentIntent: existing?.currentIntent ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        archivedAt: existing?.archivedAt ?? null,
      };
      await repository.upsertChatSession(record);
      res.json({
        chatSessionId: record.id,
        ownerUserId: record.ownerUserId,
        ownerAnonId: record.ownerAnonId,
      });
    } catch (error) {
      next(error);
    }
  });

  // Login-claim: re-key every anonymous chat_sessions row to the
  // signed-in user. The frontend ChatStoreContext mints client-side
  // session ids and POST /api/chat-sessions creates server rows on
  // the fly (ownerAnonId = the cookie's session id). On F6 sign-up
  // the cookie's session id stays the same — the login handler
  // upgrades it in place — so we can find the user's anonymous chat
  // rows by ownerAnonId = req.session.id.
  //
  // Child rows (messages, summaries, entities, viewer_events)
  // reference chat_sessions.id and inherit the new owner transitively,
  // so the re-key only touches the parent table.
  //
  // No request body: the anon id comes from the session cookie.
  app.post("/api/chat-sessions/claim", apiLimiter, requireAuthenticatedUser, async (req, res, next) => {
    try {
      const session = req.session!;
      const ownerUserId = session.groundxUsername;
      if (!ownerUserId) {
        res.status(401).json({ error: "no_signed_in_user" });
        return;
      }
      const result = await repository.rekeyAnonymousChatSessions(session.id, ownerUserId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // UI-10b — record a canvas-orchestrator dispatch into `intent_log`.
  // Best-effort from the frontend (fire-and-forget); we still validate
  // the payload shape so a malformed POST gets 400 rather than silent
  // garbage in the table. Auth required so anon users can't fill the
  // table from outside — anonymous sessions can dispatch but the
  // server only records when there's a real chat_session_id.
  app.post("/api/intent", apiLimiter, requireSession, async (req, res, next) => {
    try {
      const body = req.body as
        | {
            chatSessionId?: unknown;
            source?: unknown;
            intent?: unknown;
          }
        | null;
      if (!body || typeof body !== "object") {
        res.status(400).json({ error: "invalid_payload" });
        return;
      }
      const chatSessionId = typeof body.chatSessionId === "string" ? body.chatSessionId : null;
      const source = typeof body.source === "string" ? body.source : null;
      const intent =
        body.intent && typeof body.intent === "object" && !Array.isArray(body.intent)
          ? (body.intent as Record<string, unknown>)
          : null;
      const allowedSources = new Set(["user", "agent", "tour", "system"]);
      if (!chatSessionId || !source || !allowedSources.has(source) || !intent) {
        res.status(400).json({ error: "invalid_payload" });
        return;
      }
      const intentKind = typeof intent.kind === "string" ? intent.kind : null;
      if (!intentKind) {
        res.status(400).json({ error: "invalid_payload" });
        return;
      }
      // The row's chat_session_id is an FK to chat_sessions; verify the
      // session exists AND that the caller actually owns it. Without
      // this check anyone with a valid cookie could write to any
      // session's intent_log.
      const chatSession = await repository.getChatSession(chatSessionId);
      if (!chatSession) {
        res.status(404).json({ error: "chat_session_not_found" });
        return;
      }
      const reqSession = req.session!;
      const ownedByUser =
        reqSession.groundxUsername && chatSession.ownerUserId === reqSession.groundxUsername;
      const ownedByAnon = !reqSession.groundxUsername && chatSession.ownerAnonId === reqSession.id;
      if (!ownedByUser && !ownedByAnon) {
        res.status(403).json({ error: "not_session_owner" });
        return;
      }
      await repository.appendIntentLog({
        id: randomUUID(),
        chatSessionId,
        timestamp: Date.now(),
        source: source as "user" | "agent" | "tour" | "system",
        intentKind,
        intentJson: JSON.stringify(intent),
      });
      res.status(201).json({ ok: true });
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
        lightLlmClient,
        groundxClient,
        partnerClient,
        groundxApiKey,
        samplesBucketId: env.GROUNDX_SAMPLES_BUCKET_ID ?? null,
        llmModelId: env.LLM_MODEL_ID ?? "model",
        lightLlmModelId: env.LLM_LIGHT_MODEL_ID,
        mockMode: env.MOCK_MODE,
        byoPagesLimit: env.BYO_PAGES_LIMIT,
        contextWindowTokens: env.LLM_CONTEXT_WINDOW_TOKENS,
        compressionTriggerRatio: env.COMPRESSION_TRIGGER_RATIO,
        compressionTargetTokens: env.COMPRESSION_TARGET_TOKENS,
        maxActiveSummariesBeforeMeta: env.MAX_ACTIVE_SUMMARIES_BEFORE_META,
        metaCompactionBatchSize: env.META_COMPACTION_BATCH_SIZE,
        maxSummaryOutputTokens: env.MAX_SUMMARY_OUTPUT_TOKENS,
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

interface CreateChatSessionInput {
  id: string;
  onboardingSessionId?: string;
  title: string;
  isOnboarding: boolean;
  activeEntityKey?: string | null;
}

function parseCreateChatSessionRequest(body: unknown): CreateChatSessionInput | null {
  if (!isObject(body)) return null;
  if (typeof body.id !== "string" || !body.id) return null;
  if (typeof body.title !== "string") return null;
  if (typeof body.isOnboarding !== "boolean") return null;
  if (body.onboardingSessionId !== undefined && typeof body.onboardingSessionId !== "string") return null;
  if (body.activeEntityKey !== undefined && body.activeEntityKey !== null && typeof body.activeEntityKey !== "string") {
    return null;
  }
  return {
    id: body.id,
    onboardingSessionId: typeof body.onboardingSessionId === "string" ? body.onboardingSessionId : undefined,
    title: body.title,
    isOnboarding: body.isOnboarding,
    activeEntityKey:
      typeof body.activeEntityKey === "string" ? body.activeEntityKey : body.activeEntityKey === null ? null : undefined,
  };
}

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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
