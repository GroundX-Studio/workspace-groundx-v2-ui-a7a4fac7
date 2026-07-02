import { randomUUID } from "node:crypto";

import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import { contentScopeSchema, parseCanvasIntent, parseCitations, previewReportSectionRequestSchema, rewriteItemRequestSchema, sourceSchema, templateSaveInputSchema, type CanvasIntent, type Source } from "@groundx/shared";

import type { AppEnv } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { encryptSecret } from "./lib/crypto.js";
import { ensureMetrics, httpRequestDuration, httpRequestsTotal } from "./lib/metrics.js";
import { CSRF_COOKIE, csrfMiddleware } from "./middleware/csrf.js";
import { createSessionRecord, clearSessionCookie, isAuthedSession, requireAuthenticatedUser, requireSession, sessionApiKey, sessionMiddleware, sessionUsername, setSessionCookie } from "./middleware/session.js";
import { assertChatSessionOwnership, SESSION_NOT_OWNER_ERROR } from "./middleware/sessionOwnership.js";
import { ScenarioRegistry } from "./scenarios/registry.js";
import { ChatHandlerError, deriveRagContentScope, handleChatMessage, type HandleChatMessageRequest } from "./services/chatHandler.js";
import { authorizedProjectIds, createProjectWithOwner, rbacFilterForProjects, roleOnProject, writeUserGrant } from "./services/projectAccess.js";
import { produceEntityScope } from "./services/entityScopeProducer.js";
import { resolveFieldGeometry } from "./services/citationGeometry.js";
import { extractField, type SchemaFieldType } from "./services/fieldExtractor.js";
import { rewriteItem } from "./services/itemRewriter.js";
import { previewReportSection } from "./services/sectionPreview.js";
import {
  renderReport,
  reportTemplateFromRecord,
  reportTemplateToSaveInput,
  isFailedSectionWire,
  type ReportSection,
  type ReportSectionRenderAs,
  type ReportTemplate,
} from "./services/reportRenderer.js";
import { reportTemplateAccess } from "./services/reportTemplateAccess.js";
import { sendUpstreamResponse, UpstreamHttpError } from "./services/http.js";
import { fetchDocumentXray } from "./services/xrayCache.js";
import { TurnRegistry, TurnRunner } from "./services/turnRunner.js";
import { onceDrainOrClose, pumpFramesToResponse } from "./services/streamPump.js";
import type {
  AppRepository,
  ChatSessionRecord,
  GroundXClient,
  GroundXPartnerClient,
  LlmClient,
  ProjectGrantRecord,
  ProjectRecord,
  ProjectRole,
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

/** The valid section `renderAs` glyphs. */
const REPORT_RENDER_AS = new Set<ReportSectionRenderAs>(["PARAGRAPH", "BULLETS", "TABLE"]);

/**
 * Validate an untrusted Save body into a typed `ReportTemplate`, or `null`. The
 * bridge output is re-validated through the shared `templateSaveInputSchema`,
 * but we still gate the inbound app shape here so a malformed body 400s before
 * the bridge. (Light hand-rolled validation — the durable wire contract is the
 * shared report-kind `TemplateSaveInput` the bridge produces.)
 */
function parseReportTemplate(body: unknown): ReportTemplate | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const template = (body as Record<string, unknown>).template;
  if (!template || typeof template !== "object" || Array.isArray(template)) return null;
  const t = template as Record<string, unknown>;
  if (typeof t.id !== "string" || typeof t.name !== "string" || typeof t.format !== "string") {
    return null;
  }
  if (!Array.isArray(t.sections)) return null;
  const sections: ReportSection[] = [];
  for (const raw of t.sections) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const s = raw as Record<string, unknown>;
    if (
      typeof s.id !== "string" ||
      typeof s.name !== "string" ||
      typeof s.renderAs !== "string" ||
      !REPORT_RENDER_AS.has(s.renderAs as ReportSectionRenderAs) ||
      typeof s.question !== "string" ||
      !Array.isArray(s.variables) ||
      !s.variables.every((v) => typeof v === "string")
    ) {
      return null;
    }
    sections.push({
      id: s.id,
      name: s.name,
      renderAs: s.renderAs as ReportSectionRenderAs,
      question: s.question,
      variables: s.variables as string[],
      ...(typeof s.instructions === "string" ? { instructions: s.instructions } : {}),
      ...(typeof s.pinnedFromTurnId === "string" ? { pinnedFromTurnId: s.pinnedFromTurnId } : {}),
    });
  }
  return { id: t.id, name: t.name, format: t.format, sections };
}

// ──────────────────────────────────────────────────────────────────────────
// Projects + RBAC sharing (2026-06-01-authed-project-create-grant).
// Hand-rolled shape checks returning the parsed value or null (→ 400), matching
// the codebase's parse-helper convention. The grant graph never crosses the
// wire; the routes return these inline projections, not a shared FE type.
// ──────────────────────────────────────────────────────────────────────────

const PROJECT_NAME_MAX = 128; // mirrors projects.name VARCHAR(128)
const PRINCIPAL_USERNAME_MAX = 128; // mirrors project_grants.principal_username VARCHAR(128)
const SHAREABLE_ROLES = new Set<ProjectRole>(["viewer", "editor"]);

function parseCreateProjectRequest(body: unknown): { name: string; bucketId: number } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name || name.length > PROJECT_NAME_MAX) return null;
  if (typeof b.bucketId !== "number" || !Number.isInteger(b.bucketId) || b.bucketId <= 0) return null;
  return { name, bucketId: b.bucketId };
}

function parseShareGrantRequest(body: unknown): { principalUsername: string; role: ProjectRole } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const principalUsername = typeof b.principalUsername === "string" ? b.principalUsername.trim() : "";
  if (!principalUsername || principalUsername.length > PRINCIPAL_USERNAME_MAX) return null;
  if (typeof b.role !== "string" || !SHAREABLE_ROLES.has(b.role as ProjectRole)) return null;
  return { principalUsername, role: b.role as ProjectRole };
}

function toProjectView(project: ProjectRecord, role: ProjectRole) {
  return {
    projectId: project.projectId,
    bucketId: project.bucketId,
    name: project.name,
    isSample: project.isSample,
    role,
  };
}

function toGrantView(grant: ProjectGrantRecord) {
  return { projectId: grant.projectId, principalUsername: grant.principalUsername, role: grant.role };
}

function healthPayload(env: AppEnv): Record<string, string> {
  const payload: Record<string, string> = { status: "ok" };
  const deploymentFields: Array<[string, string | undefined]> = [
    ["commitSha", env.GROUNDX_DEPLOY_COMMIT_SHA],
    ["imageTag", env.GROUNDX_DEPLOY_IMAGE_TAG],
    ["environment", env.GROUNDX_DEPLOY_ENVIRONMENT],
    ["namespace", env.GROUNDX_DEPLOY_NAMESPACE],
    ["publicHost", env.GROUNDX_DEPLOY_PUBLIC_HOST],
    ["releaseName", env.GROUNDX_DEPLOY_RELEASE_NAME],
  ];
  for (const [key, value] of deploymentFields) {
    if (value) payload[key] = value;
  }
  return payload;
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
  /**
   * wire-embedding-verification: the live quote embedder (third verifyQuote
   * gate) + its threshold. Built by `index.ts` from the `EMBEDDINGS_*` env
   * block when configured; absent -> lexical-only citation verification
   * (dev-degrade). Threaded to chat, report, and hybrid.
   */
  quoteEmbedder?: import("./services/attribution.js").Embedder;
  embedThreshold?: number;
  scenarioRegistry: ScenarioRegistry;
}

export function createApp({
  env,
  repository,
  partnerClient,
  groundxClient,
  llmClient,
  lightLlmClient,
  quoteEmbedder,
  embedThreshold,
  scenarioRegistry,
}: AppDependencies): Express {
  const app = express();
  app.set("etag", false);
  app.disable("x-powered-by");

  // chat-response-streaming — per-app registry of in-flight chat turns, keyed by
  // (chatSessionId, client turnKey). Lets a streaming reconnect ATTACH to the
  // running turn (idempotent — no duplicate generation/persist) and keeps turns
  // session-scoped (a turnKey can only reach the chat session that owns it).
  const chatTurnRegistry = new TurnRegistry();

  // Trust proxy when behind an Ingress/ELB. Helps rate-limit + cookie-secure
  // pick the right client IP/scheme in EKS deployments.
  if (env.NODE_ENV === "production") app.set("trust proxy", 1);

  // Security headers. CSP keeps the browser from fetching anything outside our
  // own origin + the allowlisted analytics domains; deploy-tunable via env so
  // the browser can reach configured PostHog / Sentry / analytics hosts.
  const csp_connect_src: string[] = ["'self'"];
  const csp_script_src: string[] = ["'self'", "https://assets.calendly.com"];
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
          "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://api.fontshare.com", "https://assets.calendly.com"],
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

  app.get("/api/healthz", (_req, res) => res.json(healthPayload(env)));

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

  // DBG-01 (2026-05-28). Debug-overlay Reset support. Unlike logout this
  // does NOT require a session — it clears the session + csrf cookies for
  // ANY caller (anon, authed, or sessionless) so the next request mints a
  // fresh anonymous id. Best-effort deletes the session row if one exists.
  // CSRF-exempt (see CSRF_EXEMPT_PATHS): clearing your own cookies can't be
  // weaponized, and exempting avoids a bootstrap edge when the client has
  // already torn down its csrf token.
  app.post("/api/auth/reset", async (req, res, next) => {
    try {
      if (req.session?.id) {
        await repository.deleteSession(req.session.id);
      }
      clearSessionCookie(res);
      res.clearCookie(CSRF_COOKIE, { path: "/" });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/auth/me", requireAuthenticatedUser, async (req, res, next) => {
    try {
      // requireAuthenticatedUser guarantees the authed arm; narrow for the type.
      const groundxUsername = sessionUsername(req.session!)!;
      const [customer, metadata] = await Promise.all([
        partnerClient.getCustomer(groundxUsername),
        repository.getMetadata(groundxUsername),
      ]);
      res.json({ authenticated: true, username: groundxUsername, ...customer, appMetadata: metadata });
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

      const groundxUsername = sessionUsername(req.session!)!;
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
        // Anonymous iff the session has no decrypted API key (preserves the
        // prior `!groundxApiKey` semantics; the key only exists on the authed arm).
        const hasApiKey = isAuthedSession(req.session) && Boolean(req.session.groundxApiKey);
        res.json({ sessionId: req.session.id, anonymous: !hasApiKey });
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
      const now = new Date();
      const existing = await repository.getChatSession(input.id);
      // §4 #19 follow-up (Finding 6) — close the sibling IDOR. The upsert is
      // gated only by requireSession; a repeat POST with a foreign id would
      // overwrite owner_anon_id via ON DUPLICATE KEY UPDATE, grafting the
      // caller's cookie onto a foreign row. Guard: an EXISTING row the caller
      // does not own → 403. A true create (no row yet) still proceeds; the
      // legitimate owner re-upserting their own row (client retry / rehydrate)
      // still owns it and passes.
      if (existing && !assertChatSessionOwnership(existing, session)) {
        res.status(403).json({ error: SESSION_NOT_OWNER_ERROR });
        return;
      }
      const record: ChatSessionRecord = {
        id: input.id,
        onboardingSessionId: input.onboardingSessionId ?? input.id,
        ownerUserId: session.kind === "authed" ? session.groundxUsername : existing?.ownerUserId ?? null,
        ownerAnonId: session.kind === "authed" ? null : session.id,
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

  // RT-01 — read the persisted thread for a chat session. The chat
  // handler writes every user + assistant turn to chat_messages on
  // POST /api/chat/messages; this is the matching read endpoint so
  // the UI can hydrate on mount and survive a refresh. Without it
  // the visible thread lives only in component state and vanishes
  // when the user reloads, even though the DB rows are intact.
  //
  // Ownership: `assertChatSessionOwnership` keys off the caller's auth
  // state, NOT an either-match. An authed caller is matched ONLY against
  // ownerUserId (=== groundxUsername); an anon caller ONLY against
  // ownerAnonId (=== cookie session id). The two arms are mutually
  // exclusive, so a stale anon owner can't grant an authed session access.
  // The anon→authed flip is handled by /api/chat-sessions/claim, which
  // re-keys the row (nulls owner_anon_id, sets owner_user_id) — so after
  // sign-up the now-authed caller matches via ownerUserId, not the old
  // cookie. (§4 #19 reconciled the error code to not_session_owner.)
  app.get<{ id: string }>("/api/chat-sessions/:id/messages", apiLimiter, requireSession, async (req, res, next) => {
    try {
      const session = req.session!;
      const chatSessionId = req.params.id;
      const row = await repository.getChatSession(chatSessionId);
      if (!row) {
        res.status(404).json({ error: "chat_session_not_found" });
        return;
      }
      if (!assertChatSessionOwnership(row, session)) {
        res.status(403).json({ error: SESSION_NOT_OWNER_ERROR });
        return;
      }
      const messages = await repository.listChatMessages(chatSessionId);
      // clickable-citations Phase 1 — project the persisted
      // `citations_json` blob into a parsed `citations: Citation[]`
      // array so the client doesn't have to JSON.parse every row.
      // Null/absent JSON maps to []; parse failures soft-fail to []
      // so a corrupt row doesn't 500 the whole hydrate.
      const projected = messages.map((m) => {
        const raw: unknown = m.citationsJson;
        // WF-16 — the MySQL `JSON` column comes back ALREADY parsed (an
        // array); the memory repo + older rows store a string. Tolerate
        // both, then validate. `parseCitations` (shared contract) drops
        // malformed entries + strips unknown keys, so the typed client
        // never receives an unvalidated `unknown[]` (B1 — replaces the
        // prior cast-through projection).
        let value: unknown = raw;
        if (typeof raw === "string") {
          try {
            value = JSON.parse(raw);
          } catch {
            value = [];
          }
        }
        return { ...m, citations: parseCitations(value) };
      });
      res.json({ messages: projected });
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
      const ownerUserId = sessionUsername(session);
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

  // RT-05 — list the signed-in user's chat sessions for steady-mode
  // hydration. Without this, the client-side SessionSwitcher reads
  // from ChatStore which hydrates from localStorage only — a
  // signed-in user on a new device sees zero sessions despite the
  // DB carrying them. Anonymous visitors are scoped to a single
  // cookie session and have no cross-device list, so this is
  // gated on requireAuthenticatedUser (401 for anon / no cookie).
  //
  // Ownership: rows are filtered by `ownerUserId === groundxUsername`
  // (the partner-issued customer id stored on the session). No
  // cross-tenant leakage; no need to scrub fields server-side
  // because every row is the caller's own.
  app.get("/api/chat-sessions", apiLimiter, requireAuthenticatedUser, async (req, res, next) => {
    try {
      const session = req.session!;
      const ownerUserId = sessionUsername(session);
      if (!ownerUserId) {
        // Defensive: requireAuthenticatedUser already enforces this,
        // but the type checker doesn't know that.
        res.status(401).json({ error: "no_signed_in_user" });
        return;
      }
      const sessions = await repository.listChatSessionsForUser(ownerUserId);
      res.json({ sessions });
    } catch (error) {
      next(error);
    }
  });

  // RT-04 — PATCH endpoint to keep `current_intent` (and
  // `active_entity_key`) up to date as the user navigates the
  // canvas. Before RT-04 the row was seeded at session-create
  // time and never updated; chatHandler reads currentIntent every
  // turn for the bundled LLM context, so it went stale on the
  // first navigation. Now CanvasOrchestrator.setCurrentIntent
  // (and entity activation) PATCH after the in-memory mutation,
  // and the next chat turn's bundling sees the live value.
  //
  // Merge semantics: only fields present in the body are written.
  // Title / isOnboarding / ownership / timestamps are preserved
  // by reading the row first and overlaying the body.
  app.patch<{ id: string }>("/api/chat-sessions/:id", apiLimiter, requireSession, async (req, res, next) => {
    try {
      const session = req.session!;
      const chatSessionId = req.params.id;
      const body = req.body as
        | {
            currentIntent?: unknown;
            activeEntityKey?: unknown;
          }
        | null;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        res.status(400).json({ error: "invalid_payload" });
        return;
      }
      const hasCurrentIntent = Object.prototype.hasOwnProperty.call(body, "currentIntent");
      const hasActiveEntityKey = Object.prototype.hasOwnProperty.call(body, "activeEntityKey");
      // Body must carry at least one updatable field.
      if (!hasCurrentIntent && !hasActiveEntityKey) {
        res.status(400).json({ error: "invalid_payload" });
        return;
      }
      // currentIntent: a valid `CanvasIntent` or null when provided.
      // `2026-05-31-canvas-intent-schema-shared` — validated through the same
      // shared `canvasIntentSchema` the read boundaries use (one source of
      // truth). A structurally-present-but-invalid intent is rejected at the
      // write boundary (400) rather than persisted, so the column never holds
      // a value the read path would have to coerce away.
      let validatedCurrentIntent: CanvasIntent | null = null;
      if (hasCurrentIntent) {
        const v = body.currentIntent;
        if (v === null) {
          validatedCurrentIntent = null;
        } else {
          const parsed = parseCanvasIntent(v);
          if (parsed === null) {
            res.status(400).json({ error: "invalid_payload" });
            return;
          }
          validatedCurrentIntent = parsed;
        }
      }
      // activeEntityKey: string | null when provided.
      if (hasActiveEntityKey) {
        const v = body.activeEntityKey;
        const ok = v === null || typeof v === "string";
        if (!ok) {
          res.status(400).json({ error: "invalid_payload" });
          return;
        }
      }

      // FK + ownership — same pattern as the other RT routes.
      const existing = await repository.getChatSession(chatSessionId);
      if (!existing) {
        res.status(404).json({ error: "chat_session_not_found" });
        return;
      }
      if (!assertChatSessionOwnership(existing, session)) {
        res.status(403).json({ error: SESSION_NOT_OWNER_ERROR });
        return;
      }

      // Merge: overlay body fields onto the existing row, preserve
      // everything else (title, isOnboarding, ownership, createdAt).
      const now = new Date();
      const merged: ChatSessionRecord = {
        ...existing,
        currentIntent: hasCurrentIntent ? validatedCurrentIntent : existing.currentIntent,
        activeEntityKey: hasActiveEntityKey
          ? (body.activeEntityKey as string | null)
          : existing.activeEntityKey,
        updatedAt: now,
      };
      await repository.upsertChatSession(merged);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  // RT-03 — durable write side for the `chat_session_entities`
  // table. chatHandler.ts:249 + structuredHandler read this every
  // chat turn for the "active entity context" axis of LLM bundling,
  // but before RT-03 nothing in application code wrote rows (only
  // tests did), so the reads always returned []. EntitySessionStore's
  // upsert/update paths now PUT here after each in-memory mutation.
  //
  // Merge semantics: the thin client knows about lastStepJson +
  // reachedStagesJson + the JSON blobs, NOT bucketId/projectIds/
  // groupId/documentIds (those get populated server-side from
  // chat-handler processing). We READ the existing row first and
  // overlay the body fields onto it so server-only fields survive.
  //
  // Same anon/user ownership pattern as POST /api/intent + POST
  // /api/viewer-events.
  app.put<{ id: string; entityKey: string }>("/api/chat-sessions/:id/entities/:entityKey", apiLimiter, requireSession, async (req, res, next) => {
    try {
      const session = req.session!;
      const chatSessionId = req.params.id;
      const entityKey = req.params.entityKey;
      const body = req.body as
        | {
            lastStepJson?: unknown;
            reachedStagesJson?: unknown;
            scanProgressJson?: unknown;
            extractedValuesJson?: unknown;
            draftTemplateJson?: unknown;
          }
        | null;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        res.status(400).json({ error: "invalid_payload" });
        return;
      }
      // All four body fields are optional but must be the right type
      // WHEN provided. standardized-viewer-control D13/R5 — the resume
      // anchor is lastStepJson (JSON-encoded PersistedViewerStep) +
      // reachedStagesJson (JSON-encoded stage array).
      // All four *Json fields must be string-or-null (JSON-encoded payload).
      const lastStepOk =
        body.lastStepJson === undefined ||
        body.lastStepJson === null ||
        typeof body.lastStepJson === "string";
      const reachedOk =
        body.reachedStagesJson === undefined ||
        body.reachedStagesJson === null ||
        typeof body.reachedStagesJson === "string";
      const scanOk =
        body.scanProgressJson === undefined ||
        body.scanProgressJson === null ||
        typeof body.scanProgressJson === "string";
      const extractedOk =
        body.extractedValuesJson === undefined ||
        body.extractedValuesJson === null ||
        typeof body.extractedValuesJson === "string";
      if (!lastStepOk || !reachedOk || !scanOk || !extractedOk) {
        res.status(400).json({ error: "invalid_payload" });
        return;
      }

      // FK + ownership check (same shape as POST /api/intent +
      // POST /api/viewer-events).
      const chatSession = await repository.getChatSession(chatSessionId);
      if (!chatSession) {
        res.status(404).json({ error: "chat_session_not_found" });
        return;
      }
      if (!assertChatSessionOwnership(chatSession, session)) {
        res.status(403).json({ error: SESSION_NOT_OWNER_ERROR });
        return;
      }

      // Merge: read existing row (if any), overlay body fields,
      // preserve server-only scope refs + createdAt.
      const existingRows = await repository.listChatSessionEntities(chatSessionId);
      const existing = existingRows.find((e) => e.entityKey === entityKey) ?? null;
      const now = new Date();

      // 2026-05-31-steady-scope-producer — the entity→scope producer.
      // For a known-target entity (today: the `sample` EntityKind) compute
      // the demo scope columns (samples bucket + scenarioId project filter)
      // so `deriveRagContentScope` resolves the real persisted scope rather
      // than the bare env-samples fallback. The producer is invoked at this
      // entity-write seam (entity activate/upsert PUTs here). It is
      // idempotent: once a row carries scope refs we keep them — a later
      // frame-advance PUT must not re-derive or clobber them. The producer
      // returns null for any non-sample / unconfigured-corpus case, in which
      // case the columns stay as preserved/NULL (the anon-onboarding
      // fallback, unchanged).
      const alreadyScoped =
        existing != null &&
        (existing.bucketId != null ||
          existing.projectIdsJson != null ||
          existing.groupId != null ||
          existing.documentIdsJson != null);
      const produced = alreadyScoped
        ? null
        : produceEntityScope(entityKey, { samplesBucketId: env.GROUNDX_SAMPLES_BUCKET_ID ?? null });

      const merged = {
        chatSessionId,
        entityKey,
        lastStepJson:
          body.lastStepJson !== undefined ? (body.lastStepJson as string | null) : existing?.lastStepJson ?? null,
        reachedStagesJson:
          body.reachedStagesJson !== undefined
            ? (body.reachedStagesJson as string | null) ?? "[]"
            : existing?.reachedStagesJson ?? "[]",
        scanProgressJson:
          body.scanProgressJson !== undefined
            ? (body.scanProgressJson as string | null)
            : existing?.scanProgressJson ?? null,
        extractedValuesJson:
          body.extractedValuesJson !== undefined
            ? (body.extractedValuesJson as string | null)
            : existing?.extractedValuesJson ?? null,
        draftTemplateJson:
          body.draftTemplateJson !== undefined
            ? (body.draftTemplateJson as string | null)
            : existing?.draftTemplateJson ?? null,
        // Server-only fields (CF-15 scope refs) — never set by a client
        // PUT. They are written by the entity→scope producer above
        // (`produced`, first write only) and preserved thereafter. The
        // producer fills bucketId + projectIdsJson for the `sample` kind;
        // groupId / documentIdsJson have no producer today (kept as cf19
        // multi-bucket→group and single-doc-viewer substrate).
        bucketId: produced?.bucketId ?? existing?.bucketId ?? null,
        projectIdsJson: produced?.projectIdsJson ?? existing?.projectIdsJson ?? null,
        groupId: produced?.groupId ?? existing?.groupId ?? null,
        documentIdsJson: produced?.documentIdsJson ?? existing?.documentIdsJson ?? null,
        createdAt: existing?.createdAt ?? now,
        lastVisitedAt: now,
      };
      await repository.upsertChatSessionEntity(merged);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  // RT-02 — durable write side for the `viewer_events` table.
  // chatHandler reads viewer_events on every chat turn for the
  // "recent viewer history" context axis, but before RT-02 nothing
  // in application code actually wrote rows (only tests did), so
  // the read always returned []. ChatStore.appendViewerEvent now
  // POSTs here fire-and-forget; the rows surface in the next
  // bundled LLM context.
  //
  // Same ownership pattern as POST /api/intent: caller must own
  // the chat_session_id either via groundxUsername (signed-in) or
  // via the cookie session id (anon).
  app.post("/api/viewer-events", apiLimiter, requireSession, async (req, res, next) => {
    try {
      const body = req.body as
        | {
            chatSessionId?: unknown;
            timestamp?: unknown;
            entityKey?: unknown;
            action?: unknown;
            source?: unknown;
            detail?: unknown;
          }
        | null;
      if (!body || typeof body !== "object") {
        res.status(400).json({ error: "invalid_payload" });
        return;
      }
      const chatSessionId = typeof body.chatSessionId === "string" ? body.chatSessionId : null;
      const timestamp = typeof body.timestamp === "number" ? body.timestamp : null;
      const entityKey =
        typeof body.entityKey === "string" || body.entityKey === null ? body.entityKey : undefined;
      const action = typeof body.action === "string" ? body.action : null;
      const source = typeof body.source === "string" ? body.source : null;
      // Allowed enum values are kept in lockstep with ViewerEventAction
      // + ViewerEventSource in middleware/src/types.ts. Add a row here
      // when extending the enum on the types side.
      const allowedActions = new Set<string>([
        "opened",
        "journey-advanced",
        "extracted-value-viewed",
        "citation-clicked",
        "scan-completed",
        "intent-dispatched",
        "left",
      ]);
      // 2026-05-31-chat-wire-types-shared — the source allow-set derives from
      // the single shared `sourceSchema.options`, not a re-typed literal.
      const allowedSources = new Set<string>(sourceSchema.options);
      if (
        !chatSessionId ||
        timestamp == null ||
        entityKey === undefined ||
        !action ||
        !allowedActions.has(action) ||
        !source ||
        !allowedSources.has(source)
      ) {
        res.status(400).json({ error: "invalid_payload" });
        return;
      }
      // Detail must serialize cleanly to JSON; reject anything else.
      let detailJson: string | null = null;
      if (body.detail !== undefined && body.detail !== null) {
        if (typeof body.detail !== "object" || Array.isArray(body.detail)) {
          res.status(400).json({ error: "invalid_payload" });
          return;
        }
        try {
          detailJson = JSON.stringify(body.detail);
        } catch {
          res.status(400).json({ error: "invalid_payload" });
          return;
        }
      }
      // FK + ownership check (same shape as POST /api/intent).
      const chatSession = await repository.getChatSession(chatSessionId);
      if (!chatSession) {
        res.status(404).json({ error: "chat_session_not_found" });
        return;
      }
      const reqSession = req.session!;
      if (!assertChatSessionOwnership(chatSession, reqSession)) {
        res.status(403).json({ error: SESSION_NOT_OWNER_ERROR });
        return;
      }
      await repository.appendViewerEvent({
        id: randomUUID(),
        chatSessionId,
        timestamp,
        entityKey: entityKey ?? null,
        action: action as
          | "opened"
          | "journey-advanced"
          | "extracted-value-viewed"
          | "citation-clicked"
          | "scan-completed"
          | "intent-dispatched"
          | "left",
        source: source as Source,
        detailJson,
      });
      res.status(201).json({ ok: true });
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
      const allowedSources = new Set<string>(sourceSchema.options);
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
      if (!assertChatSessionOwnership(chatSession, reqSession)) {
        res.status(403).json({ error: SESSION_NOT_OWNER_ERROR });
        return;
      }
      await repository.appendIntentLog({
        id: randomUUID(),
        chatSessionId,
        timestamp: Date.now(),
        source: source as Source,
        intentKind,
        intentJson: JSON.stringify(intent),
      });
      res.status(201).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  // UI-01 Phase 2d — POST /api/extraction-schemas. Persists a named,
  // user-owned snapshot of the F4 schema overlay so the user can come
  // back to "Utility (with tax)" or "Loan (DTI variant)" without
  // re-walking the chat flow. Gated on `requireAuthenticatedUser`
  // because the row is keyed by `groundx_username` — anonymous
  // sessions can edit the schema in-memory but must sign in to pin a
  // template. 401 here surfaces a "sign in to save" nudge in the UI.
  //
  // Idempotent upsert: same `id` overwrites name + schema. Repository
  // handles the ON DUPLICATE KEY UPDATE in MySQL (memory repository
  // mirrors the semantics via Map.set).
  app.post(
    "/api/templates",
    apiLimiter,
    requireAuthenticatedUser,
    async (req, res, next) => {
      try {
        const session = req.session!;
        const groundxUsername = sessionUsername(session);
        if (!groundxUsername) {
          // requireAuthenticatedUser already enforced this; defensive.
          res.status(401).json({ error: "no_signed_in_user" });
          return;
        }
        // Validate the wire shape via the shared `TemplateSaveInput` schema.
        // Default (strip) key handling drops any client-supplied owner/
        // timestamps — 🔒 ownership is SERVER-assigned, never trusted from the
        // body (no IDOR / spoofing).
        const parsed = templateSaveInputSchema.safeParse(req.body);
        if (!parsed.success || parsed.data.name.trim().length === 0) {
          res.status(400).json({ error: "invalid_payload" });
          return;
        }
        const input = parsed.data;
        const now = new Date();
        await repository.saveTemplate({
          id: input.id,
          kind: input.kind,
          groundxUsername, // from the session — NOT the request body
          name: input.name,
          bodyJson: JSON.stringify(input.body),
          // createdAt is preserved on re-save by ON DUPLICATE KEY UPDATE
          // (which doesn't touch created_at); only set on the initial INSERT.
          createdAt: now,
          updatedAt: now,
        });
        res.status(200).json({ id: input.id, name: input.name, updatedAt: now.toISOString() });
      } catch (error) {
        next(error);
      }
    },
  );

  // UI-01 Phase 2c — focused per-field extraction. Fired by the chat
  // propose-card on Accept so the new schema field has a real value
  // rather than a manifest placeholder. Uses the same GroundX scope
  // derivation as chatHandler (active entity → bucket/group/documents
  // → env fallback) so the search hits the right snippets even when
  // the active entity is the anon seed.
  //
  // Auth: `requireSession`. Anon visitors can extract against the
  // samples bucket too — same trust model as the chat surface itself.
  // Ownership: the chat_session row must be owned by the caller.
  app.post(
    "/api/extract-field",
    apiLimiter,
    requireSession,
    async (req, res, next) => {
      try {
        const body = req.body as
          | {
              chatSessionId?: unknown;
              field?:
                | {
                    name?: unknown;
                    type?: unknown;
                    description?: unknown;
                  }
                | null;
            }
          | null;
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          res.status(400).json({ error: "invalid_payload" });
          return;
        }
        const chatSessionId = typeof body.chatSessionId === "string" ? body.chatSessionId : null;
        const fieldIn = body.field;
        const fieldName =
          fieldIn && typeof fieldIn === "object" && typeof fieldIn.name === "string" ? fieldIn.name : null;
        const fieldType =
          fieldIn && typeof fieldIn === "object" && typeof fieldIn.type === "string" ? fieldIn.type : null;
        const fieldDescription =
          fieldIn && typeof fieldIn === "object" && typeof fieldIn.description === "string"
            ? fieldIn.description
            : null;
        const validTypes = new Set<SchemaFieldType>(["STRING", "NUMBER", "DATE", "BOOLEAN"]);
        if (
          !chatSessionId ||
          !fieldName ||
          !fieldType ||
          !validTypes.has(fieldType as SchemaFieldType) ||
          fieldDescription === null
        ) {
          res.status(400).json({ error: "invalid_payload" });
          return;
        }

        const chatSession = await repository.getChatSession(chatSessionId);
        if (!chatSession) {
          res.status(404).json({ error: "chat_session_not_found" });
          return;
        }
        const reqSession = req.session!;
        if (!assertChatSessionOwnership(chatSession, reqSession)) {
          res.status(403).json({ error: SESSION_NOT_OWNER_ERROR });
          return;
        }

        // Same scope derivation chatHandler uses for routed chat —
        // entity-derived scope wins, samples-bucket env fallback last.
        // AppRepository doesn't expose a (sessionId, entityKey) get;
        // list-then-find is the canonical lookup pattern used
        // elsewhere (see PUT /api/chat-sessions/:id/entities/:entityKey).
        const activeEntity = chatSession.activeEntityKey
          ? (await repository.listChatSessionEntities(chatSessionId)).find(
              (e) => e.entityKey === chatSession.activeEntityKey,
            ) ?? null
          : null;
        const contentScope = deriveRagContentScope(activeEntity, env.GROUNDX_SAMPLES_BUCKET_ID ?? null);
        const groundxApiKey = sessionApiKey(reqSession) ?? env.GROUNDX_PARTNER_API_KEY ?? null;

        const result = await extractField(
          {
            field: {
              name: fieldName,
              type: fieldType as SchemaFieldType,
              description: fieldDescription,
            },
            contentScope,
          },
          {
            llmClient,
            groundxClient,
            groundxApiKey: groundxApiKey ?? undefined,
            llmModelId: env.LLM_MODEL_ID,
            // unify-extract-citations — the same citation verify+tier seam the
            // chat/report routes pass, so the extract citation is verified and
            // tiered identically (absent embedder → lexical-only, never-fail).
            ...(quoteEmbedder ? { quoteEmbedder } : {}),
            ...(embedThreshold !== undefined ? { embedThreshold } : {}),
          },
        );
        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  // ── agentic-template-item-editor — "rewrite with agent" ──────────
  //
  // User-invoked (NOT an LLM tool): the editor's "✨ rewrite with agent"
  // button calls this directly. Grounds an item-definition rewrite in the
  // source document + the item's current result; returns a proposed item +
  // reasoning. Expensive LLM call → the `llmLimiter`. Mirrors extract-field's
  // ownership + scope derivation. The `name` is held fixed in the service.
  app.post(
    "/api/template-item/rewrite",
    llmLimiter,
    requireSession,
    async (req, res, next) => {
      try {
        const parsed = rewriteItemRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "invalid_payload" });
          return;
        }
        const request = parsed.data;
        const chatSession = await repository.getChatSession(request.chatSessionId);
        if (!chatSession) {
          res.status(404).json({ error: "chat_session_not_found" });
          return;
        }
        const reqSession = req.session!;
        if (!assertChatSessionOwnership(chatSession, reqSession)) {
          res.status(403).json({ error: SESSION_NOT_OWNER_ERROR });
          return;
        }
        const activeEntity = chatSession.activeEntityKey
          ? (await repository.listChatSessionEntities(request.chatSessionId)).find(
              (e) => e.entityKey === chatSession.activeEntityKey,
            ) ?? null
          : null;
        const contentScope = deriveRagContentScope(activeEntity, env.GROUNDX_SAMPLES_BUCKET_ID ?? null);
        const groundxApiKey = sessionApiKey(reqSession) ?? env.GROUNDX_PARTNER_API_KEY ?? null;

        const result = await rewriteItem(
          {
            kind: request.kind,
            item: request.item,
            currentResult:
              request.currentResult
                ? {
                    value: (request.currentResult as { value?: unknown }).value,
                    body: (request.currentResult as { body?: unknown }).body,
                    confidence: request.currentResult.confidence,
                  }
                : null,
            contentScope,
          },
          {
            llmClient,
            groundxClient,
            groundxApiKey: groundxApiKey ?? undefined,
            llmModelId: env.LLM_MODEL_ID,
          },
        );
        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  // ── agentic-template-item-editor — single report-section preview ─
  //
  // Render ONE ad-hoc (unsaved) report section against the session scope — the
  // report analog of /api/extract-field. Reuses the per-section grounded render
  // (citation-verified). Expensive LLM call → `llmLimiter`.
  app.post(
    "/api/report-section/preview",
    llmLimiter,
    requireSession,
    async (req, res, next) => {
      try {
        const parsed = previewReportSectionRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "invalid_payload" });
          return;
        }
        const { chatSessionId, section } = parsed.data;
        const chatSession = await repository.getChatSession(chatSessionId);
        if (!chatSession) {
          res.status(404).json({ error: "chat_session_not_found" });
          return;
        }
        const reqSession = req.session!;
        if (!assertChatSessionOwnership(chatSession, reqSession)) {
          res.status(403).json({ error: SESSION_NOT_OWNER_ERROR });
          return;
        }
        if (!env.LLM_MODEL_ID) {
          res.status(503).json({ error: "llm_unavailable" });
          return;
        }
        const activeEntity = chatSession.activeEntityKey
          ? (await repository.listChatSessionEntities(chatSessionId)).find(
              (e) => e.entityKey === chatSession.activeEntityKey,
            ) ?? null
          : null;
        const contentScope = deriveRagContentScope(activeEntity, env.GROUNDX_SAMPLES_BUCKET_ID ?? null);
        const groundxApiKey = sessionApiKey(reqSession) ?? env.GROUNDX_PARTNER_API_KEY ?? null;

        const result = await previewReportSection(section, contentScope, {
          groundxClient,
          groundxApiKey: groundxApiKey ?? "",
          llmClient,
          llmModelId: env.LLM_MODEL_ID,
          ...(quoteEmbedder ? { quoteEmbedder } : {}),
          ...(embedThreshold !== undefined ? { embedThreshold } : {}),
        });
        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  // ── Smart Report (smart-report Phase 6) ──────────────────────────
  //
  // Render: run a report Template over a `ContentScope` and return ordered,
  // cited sections via the live search + grounded-generation path. A
  // `section_ids` subset scopes a re-render; the sample renders `preview_only`;
  // a BYO scope returns the gate envelope (#10); a missing template renders the
  // graceful no-template state.
  //
  // Auth: `requireSession` (anon can preview the sample, mirroring Extract +
  // the chat surface). Ownership: the chat_session row must be owned by the
  // caller (same trust model as /api/extract-field).
  app.post(
    "/api/widgets/smart-report/reports/render",
    apiLimiter,
    requireSession,
    async (req, res, next) => {
      try {
        const body = requestBodyObject(req);
        const templateId = typeof body.template_id === "string" ? body.template_id : null;
        const chatSessionId = typeof body.chat_session_id === "string" ? body.chat_session_id : null;
        const scopeParsed = contentScopeSchema.safeParse(body.scope);
        const variables = stringRecord(body.variables) as Record<string, string>;
        const sectionIds = Array.isArray(body.section_ids)
          ? (body.section_ids.filter((s): s is string => typeof s === "string"))
          : body.section_ids === null || body.section_ids === undefined
            ? null
            : "invalid";
        if (
          !templateId ||
          !chatSessionId ||
          !scopeParsed.success ||
          sectionIds === "invalid"
        ) {
          res.status(400).json({ error: "invalid_payload" });
          return;
        }

        const chatSession = await repository.getChatSession(chatSessionId);
        if (!chatSession) {
          res.status(404).json({ error: "chat_session_not_found" });
          return;
        }
        const reqSession = req.session!;
        if (!assertChatSessionOwnership(chatSession, reqSession)) {
          res.status(403).json({ error: SESSION_NOT_OWNER_ERROR });
          return;
        }

        // Load the report Template from the SERVER source of truth (the
        // persisted `templates` row), not the request body — the live path
        // reads each section's `question` from THIS template (one source of
        // truth). When no row exists (the new-customer norm — `Pin→template =
        // NO auto`), `getTemplate` resolves null and `renderReport` returns the
        // graceful no-template state. Scope comes from `body.scope` (Report's
        // scope is a render-time input per Template + Scope + Results) — NOT
        // `deriveRagContentScope` (that is the extract/chat route's path).
        const groundxApiKey = sessionApiKey(reqSession) ?? env.GROUNDX_PARTNER_API_KEY ?? null;
        // RBAC (same server-side resolution as the chat route): restrict the
        // report's per-section retrieval to the caller's authorized projects.
        const reportCallerUsername = sessionUsername(reqSession);
        const reportAuthorizedProjects = await authorizedProjectIds(
          repository,
          reportCallerUsername,
        );
        const renderRequest = {
          templateId,
          scope: scopeParsed.data,
          variables,
          sectionIds,
          chatSessionId,
          parentMessageId:
            typeof body.parent_message_id === "string" ? body.parent_message_id : null,
        };
        const renderDeps = {
          samplesBucketId: env.GROUNDX_SAMPLES_BUCKET_ID ?? null,
          // The template loader is the server source of truth for section
          // questions; a `null` result is the graceful no-template state.
          // harden-report-render-template-access — ACCESS-SCOPED by the SAME
          // rule as the builder read endpoint: load only a template the caller
          // may read (public sample or own). An inaccessible id resolves to
          // null → the no-template empty render, leaking no existence signal
          // (closes the read-side IDOR before private member templates exist).
          getTemplate: async (id: string) => {
            const record = await repository.getTemplate(id);
            if (!record || !reportTemplateAccess(record, reportCallerUsername).accessible) {
              return null;
            }
            return reportTemplateFromRecord(record);
          },
          llmClient,
          groundxClient,
          ...(groundxApiKey ? { groundxApiKey } : {}),
          rbacFilter: rbacFilterForProjects(reportAuthorizedProjects),
          ...(env.LLM_MODEL_ID ? { llmModelId: env.LLM_MODEL_ID } : {}),
          ...(quoteEmbedder ? { quoteEmbedder } : {}),
          ...(embedThreshold !== undefined ? { embedThreshold } : {}),
        };

        // progressive-report-render B2 — content negotiation. `Accept:
        // text/event-stream` streams `meta`/`section`/`done` frames as each
        // section completes (progressive fill-in); any other request gets the
        // existing single JSON envelope UNCHANGED (back-compat). One compute
        // path (`renderReport`), two deliveries — the SSE frames are emitted
        // from the SAME per-section results via the streaming sink.
        const wantsStream = (req.headers.accept ?? "").includes("text/event-stream");
        if (!wantsStream) {
          const result = await renderReport(renderRequest, renderDeps);
          res.status(200).json(result);
          return;
        }

        // SSE path. Own frame writer + heartbeat (report needs no replay buffer;
        // see progressive-report-render design D1). After writeHead we own error
        // handling — a half-open stream must NOT fall through to `next(error)`.
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        let seq = 0;
        const frame = (event: string, data: unknown): void => {
          if (res.writableEnded) return;
          res.write(`id: ${(seq += 1)}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };
        const heartbeat = setInterval(() => {
          if (!res.writableEnded) res.write(":\n\n");
        }, 15000);
        heartbeat.unref?.();
        try {
          const result = await renderReport(renderRequest, {
            ...renderDeps,
            onMeta: (sectionIds) =>
              frame("meta", { report_id: `rr-${templateId}`, template_id: templateId, section_ids: sectionIds }),
            onSection: (wire, index) =>
              frame("section", { index, section: wire, failed: isFailedSectionWire(wire) }),
          });
          // Terminal frame carries the FULL final envelope (gate / empty / complete
          // + resolved_variables + export_formats + preview_only) — the authoritative
          // final state; the FE uses `section` frames for progressive paint and `done`
          // for the source of truth (mirrors chat's terminal `envelope` frame).
          frame("done", result);
        } catch (err) {
          logger.warn({ err }, "report render stream failed");
          frame("error", { message: "render failed" });
        } finally {
          clearInterval(heartbeat);
          if (!res.writableEnded) res.end();
        }
      } catch (error) {
        next(error);
      }
    },
  );

  // report-default-template — access-scoped template READ. The builder loads a
  // template's section definitions by id (to seed its editable rows) and reads
  // `owned` to decide fork-on-edit: a NOT-owned template (e.g. the sentinel-owned
  // sample) Saves as a NEW member-owned copy, never overwriting the original.
  // Access (no IDOR): anon may read ONLY the sentinel-owned sample; a member may
  // read the sample OR their own; anything else → 404 (existence not leaked).
  // Auth: `requireSession` (anon previews the sample, mirroring the render route).
  app.get<{ id: string }>(
    "/api/widgets/smart-report/reports/template/:id",
    apiLimiter,
    requireSession,
    async (req, res, next) => {
      try {
        const record = await repository.getTemplate(req.params.id);
        if (!record) {
          res.status(404).json({ error: "template_not_found" });
          return;
        }
        // harden-report-render-template-access — ONE shared access rule (also
        // applied by the render path's template load): the public sample or the
        // caller's own; anything else 404 (existence not leaked). `owned` drives
        // the builder's fork-on-edit.
        const { accessible, owned } = reportTemplateAccess(record, sessionUsername(req.session!));
        if (!accessible) {
          res.status(404).json({ error: "template_not_found" });
          return;
        }
        const template = reportTemplateFromRecord(record);
        if (!template) {
          res.status(404).json({ error: "template_not_found" });
          return;
        }
        res.status(200).json({ template, owned });
      } catch (error) {
        next(error);
      }
    },
  );

  // Save: persist a report Template via the shared `saveTemplate` repo API
  // (the same persistence Extract schemas use; reportTemplateToSaveInput is the
  // report-kind bridge). Sign-in gated (`requireAuthenticatedUser`) — anon Save
  // is the client-side `commitGate` path. Ownership is SERVER-assigned from the
  // session (never trusted from the body).
  app.post(
    "/api/widgets/smart-report/reports",
    apiLimiter,
    requireAuthenticatedUser,
    async (req, res, next) => {
      try {
        const session = req.session!;
        const groundxUsername = sessionUsername(session);
        if (!groundxUsername) {
          res.status(401).json({ error: "no_signed_in_user" });
          return;
        }
        const parsed = parseReportTemplate(req.body);
        if (!parsed) {
          res.status(400).json({ error: "invalid_payload" });
          return;
        }
        // Bridge the app-owned ReportTemplate → the shared report-kind
        // TemplateSaveInput, then validate it through the same boundary schema
        // the /api/templates route uses (defense-in-depth on the bridge output).
        const saveInput = reportTemplateToSaveInput(parsed);
        const validated = templateSaveInputSchema.safeParse(saveInput);
        if (!validated.success || validated.data.name.trim().length === 0) {
          res.status(400).json({ error: "invalid_payload" });
          return;
        }
        const input = validated.data;
        // report-default-template T4b — write-side ownership guard. `saveTemplate`
        // upserts on the id alone and overwrites the owner column, so a member
        // saving under an id owned by someone else (the sentinel-owned sample, or
        // another member) would overwrite AND hijack it. Reject that: a member may
        // write only a NEW id or one already theirs. (The builder forks-on-edit so
        // it never sends a not-owned id; this is the boundary backstop.)
        const existing = await repository.getTemplate(input.id);
        if (existing && existing.groundxUsername !== groundxUsername) {
          res.status(403).json({ error: "not_template_owner" });
          return;
        }
        const now = new Date();
        await repository.saveTemplate({
          id: input.id,
          kind: input.kind,
          groundxUsername, // from the session — NOT the request body
          name: input.name,
          bodyJson: JSON.stringify(input.body),
          createdAt: now,
          updatedAt: now,
        });
        res.status(200).json({ id: input.id, name: input.name, updatedAt: now.toISOString() });
      } catch (error) {
        next(error);
      }
    },
  );

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
      // §4 #19 follow-up (Finding 3) — close the IDOR. requireSession only
      // proves a cookie exists; without an ownership check any visitor could
      // POST a victim's chatSessionId and write into / read the assistant
      // reply from another user's thread (callerRole is even derived from the
      // loaded victim row in chatHandler). Mirror the 6 sibling mutating
      // routes: load the row, 403 on a non-owner. An UNKNOWN session falls
      // through to handleChatMessage, which preserves the existing 404
      // (chat_session_not_found) behavior — so the guard fires only when the
      // row exists AND the caller doesn't own it.
      const row = await repository.getChatSession(payload.chatSessionId);
      if (row && !assertChatSessionOwnership(row, session)) {
        res.status(403).json({ error: SESSION_NOT_OWNER_ERROR });
        return;
      }
      // Anonymous onboarding sessions don't have a customer-scoped
      // key; fall through to the partner key. The partner owns the
      // samples bucket — anonymous visitors read it via the partner's
      // credentials. There is no separate "anonymous" identity in the
      // auth model (locked 2026-05-25).
      const groundxApiKey = sessionApiKey(session) ?? env.GROUNDX_PARTNER_API_KEY ?? null;

      // RBAC (2026-06-01-projects-rbac-scope-filter): the caller may only read
      // documents in projects they hold a grant on. Resolve the authorized
      // project set from the grant graph (anon → public only) and pass it as the
      // server-derived `rbacFilter`; `searchGroundX` composes it ($and) with the
      // scope filter so it intersects the requested scope. SERVER-SIDE only.
      const callerUsername = sessionUsername(session); // null for anonymous
      const authorizedProjects = await authorizedProjectIds(repository, callerUsername);

      // chat-response-streaming — BOTH branches drive ONE engine (the TurnRunner),
      // so there is a single generation path and exactly one persistence write.
      // The runner is idempotent per (chatSessionId, turnKey): a reconnect re-POST
      // with the same client-supplied turnKey ATTACHES to the running turn rather
      // than starting a duplicate. Ownership was verified above, so the
      // chatSessionId key cannot be reached by a non-owning session.
      const wantsStream = (req.headers.accept ?? "").includes("text/event-stream");
      const rawTurnKey = (req.body as { turnKey?: unknown })?.turnKey;
      const turnKey = typeof rawTurnKey === "string" && rawTurnKey.length > 0 ? rawTurnKey : randomUUID();
      const lastEventId = wantsStream
        ? Number.parseInt(String(req.headers["last-event-id"] ?? ""), 10) || 0
        : 0;

      // P2.2 from-DB resume: a reconnect (Last-Event-ID present) whose in-memory
      // runner is GONE (evicted / different replica) returns the PERSISTED final
      // answer as a single envelope instead of re-generating. A miss falls through
      // to a fresh runner.
      if (wantsStream && lastEventId > 0 && !chatTurnRegistry.get(payload.chatSessionId, turnKey)) {
        const saved = await repository.getAssistantMessageByTurnKey(payload.chatSessionId, turnKey);
        if (saved) {
          // Build the WHOLE response payload BEFORE writing any header/frame: a throw
          // after `writeHead(200)` would leave a half-open SSE stream (the route catch
          // can't set a status on already-sent headers). All fallible work — the
          // user-message pairing read and the citations parse — happens here, first.
          let resumeFrames: string;
          if (saved.errorCode) {
            // The turn ERRORED (it was indexed by turnKey so a reconnect attaches
            // rather than re-generating). Surface the SAME terminal `error` frame the
            // live path emits — NOT a success envelope with an empty answer (which the
            // client would render as a blank, non-retryable bubble).
            resumeFrames = `event: error\ndata: ${JSON.stringify({ code: saved.errorCode })}\n\n`;
          } else {
            // Pair the user message (same turn = the assistant's turnIndex - 1) so the
            // resumed envelope is the SAME shape as the live one (which returns
            // `userMessageId`). Rare path, so one extra read is fine; "" if aged out.
            const thread = await repository.listChatMessages(payload.chatSessionId);
            const userMessageId =
              thread.find((m) => m.role === "user" && m.turnIndex === saved.turnIndex - 1)?.id ?? "";
            let citations: unknown = [];
            try {
              citations = saved.citationsJson ? (JSON.parse(saved.citationsJson) as unknown) : [];
            } catch {
              citations = []; // corrupt citations_json must not abort the resume
            }
            const envelope = {
              userMessageId,
              assistantMessageId: saved.id,
              compressionRan: false,
              reply: { mode: "rag" as const, answer: saved.content, citations, suggestedActions: [], intents: [], toolFailures: [] },
            };
            // No `id:` on the resume meta — a seq of 0 would RESET the client's
            // Last-Event-ID cursor (it advances `lastSeq` on any non-null seq). The
            // envelope that immediately follows resolves the turn, so no cursor needed.
            resumeFrames =
              `event: meta\ndata: ${JSON.stringify({ turnKey, messageId: saved.id })}\n\n` +
              `event: envelope\ndata: ${JSON.stringify(envelope)}\n\n`;
          }
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          });
          res.write(resumeFrames);
          res.end();
          return;
        }
        // not found → fall through to a fresh runner (re-generate).
      }

      const runner = chatTurnRegistry.getOrCreate(payload.chatSessionId, turnKey, () =>
        new TurnRunner({
          sessionId: payload.chatSessionId,
          turnKey,
          streaming: wantsStream,
          generate: () =>
            handleChatMessage({ ...payload, turnKey }, {
              repository,
              llmClient,
              lightLlmClient,
              groundxClient,
              partnerClient,
              groundxApiKey,
              rbacFilter: rbacFilterForProjects(authorizedProjects),
              samplesBucketId: env.GROUNDX_SAMPLES_BUCKET_ID ?? null,
              llmModelId: env.LLM_MODEL_ID ?? "model",
              lightLlmModelId: env.LLM_LIGHT_MODEL_ID,
              quoteEmbedder,
              embedThreshold,
              byoPagesLimit: env.BYO_PAGES_LIMIT,
              contextWindowTokens: env.LLM_CONTEXT_WINDOW_TOKENS,
              compressionTriggerRatio: env.COMPRESSION_TRIGGER_RATIO,
              compressionTargetTokens: env.COMPRESSION_TARGET_TOKENS,
              maxActiveSummariesBeforeMeta: env.MAX_ACTIVE_SUMMARIES_BEFORE_META,
              metaCompactionBatchSize: env.META_COMPACTION_BATCH_SIZE,
              maxSummaryOutputTokens: env.MAX_SUMMARY_OUTPUT_TOKENS,
            }),
        }),
      );

      if (wantsStream) {
        // SSE pump: subscribe from Last-Event-ID (resume), drain frames to the
        // socket honoring write backpressure. The runner keeps generating even if
        // this connection drops (decoupled).
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        // Heartbeat every 15s keeps the stream under a typical ~60s ingress idle
        // timeout; the pump owns socket backpressure (the runner never stalls).
        await pumpFramesToResponse(
          runner.buffer,
          {
            // Resilient to an abrupt client disconnect mid-stream: a write to a
            // destroyed socket returns false (never throws out of the pump), and a
            // `destroyed` socket reports `writableEnded` so the pump stops on the
            // next frame. The runner keeps generating + persists regardless.
            write: (chunk) => {
              try {
                return res.write(chunk);
              } catch {
                return false;
              }
            },
            end: () => {
              try {
                res.end();
              } catch {
                /* socket already closed */
              }
            },
            get writableEnded() {
              return res.writableEnded || res.destroyed;
            },
            // On a closed socket no 'drain' arrives; `onceDrainOrClose` resolves on
            // 'close'/'error' too so the pump loops back to the writableEnded check
            // instead of hanging forever on a graceful client disconnect.
            onceDrain: () => onceDrainOrClose(res),
          },
          { lastEventId, heartbeatMs: 15_000 },
        );
        return;
      }

      // JSON branch: await the same runner; surface a handler error as today's status.
      const result = await runner.completion;
      if (!result) {
        const err = runner.error;
        if (err instanceof ChatHandlerError) {
          res.status(err.statusCode).json({ error: err.message });
          return;
        }
        next(err);
        return;
      }
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

  // WF-05 — resolve extract-field source geometry from the document X-Ray.
  // `document_getextract` returns field VALUES only (no geometry, ever), so a
  // field's source region is recovered by matching its value against the
  // X-Ray chunks (`resolveFieldGeometry`). The app posts the active fields
  // ({value,label}); we return a parallel `geometry[]` where each entry is the
  // field's REGIONS (`{page,bbox}[]`, multi-region-citations — every chunk the
  // value appears in; `[]` where no chunk matches → highlight degrades to none).
  // X-Ray fetch is cached per doc.
  app.post<{ documentId: string }>(
    "/api/documents/:documentId/field-geometry",
    apiLimiter,
    requireSession,
    async (req, res, next) => {
      try {
        const { documentId } = req.params;
        const rawFields = (req.body as { fields?: unknown } | undefined)?.fields;
        if (!Array.isArray(rawFields)) {
          res.status(400).json({ error: "fields_required" });
          return;
        }
        const fields = rawFields as Array<{ value?: unknown; label?: unknown }>;
        const apiKey = sessionApiKey(req.session!) ?? env.GROUNDX_PARTNER_API_KEY;
        if (!apiKey) {
          res.status(503).json({ error: "GroundX API key is not available for this session" });
          return;
        }
        const xray = await fetchDocumentXray(groundxClient, apiKey, documentId);
        const geometry = fields.map((f) => {
          if (!xray) return [];
          const value =
            typeof f.value === "string" || typeof f.value === "number" || typeof f.value === "boolean"
              ? f.value
              : null;
          return resolveFieldGeometry(value, typeof f.label === "string" ? f.label : "", xray);
        });
        res.json({ documentId, geometry });
      } catch (error) {
        next(error);
      }
    },
  );

  // ────────────────────────────────────────────────────────────────────────
  // Projects + RBAC sharing (2026-06-01-authed-project-create-grant).
  //
  // The FIRST production writers of a `user` grant. Both are sign-in gated;
  // authorization (owner-only sharing) is enforced here (the composition root),
  // while the writes are pure service ops. NOTE: `/api/projects` (plural) does
  // NOT collide with the `/api/project` (singular) Partner proxy `app.use`
  // below — Express mount matching respects the path-segment boundary.
  // ────────────────────────────────────────────────────────────────────────
  app.post("/api/projects", apiLimiter, requireAuthenticatedUser, async (req, res, next) => {
    try {
      const input = parseCreateProjectRequest(req.body);
      if (!input) {
        res.status(400).json({ error: "invalid_payload" });
        return;
      }
      // requireAuthenticatedUser guarantees the authed arm.
      const ownerUsername = sessionUsername(req.session!)!;
      const project = await createProjectWithOwner(repository, { ...input, ownerUsername });
      res.status(201).json({ project: toProjectView(project, "owner") });
    } catch (error) {
      next(error);
    }
  });

  app.post<{ projectId: string }>(
    "/api/projects/:projectId/grants",
    apiLimiter,
    requireAuthenticatedUser,
    async (req, res, next) => {
      try {
        const input = parseShareGrantRequest(req.body);
        if (!input) {
          res.status(400).json({ error: "invalid_payload" });
          return;
        }
        const granterUsername = sessionUsername(req.session!)!;
        const { projectId } = req.params;

        // Sharing with yourself would UPSERT-downgrade your own owner grant
        // (PK = project_id+principal_type+principal_username) → lockout.
        if (input.principalUsername === granterUsername) {
          res.status(400).json({ error: "cannot_share_with_self" });
          return;
        }

        const project = await repository.getProject(projectId);
        if (!project) {
          res.status(404).json({ error: "project_not_found" });
          return;
        }
        // Owner check BEFORE the target lookup, so a non-owner cannot probe
        // whether a username exists in GroundX via this endpoint.
        const granterRole = await roleOnProject(repository, granterUsername, projectId);
        if (granterRole !== "owner") {
          res.status(403).json({ error: "not_project_owner" });
          return;
        }

        // Validate the target customer exists in GroundX before granting.
        try {
          await partnerClient.getCustomer(input.principalUsername);
        } catch (err) {
          if (err instanceof UpstreamHttpError && err.upstreamStatus === 404) {
            res.status(404).json({ error: "principal_not_found" });
            return;
          }
          throw err;
        }

        const grant = await writeUserGrant(repository, {
          projectId,
          principalUsername: input.principalUsername,
          role: input.role,
        });
        res.status(201).json({ grant: toGrantView(grant) });
      } catch (error) {
        next(error);
      }
    },
  );

  app.use("/api/v1", apiLimiter, requireSession, async (req: Request, res: Response, next) => {
    try {
      // Per-session customer key when the user has signed up; partner
      // key as fallback for anonymous visitors reading the samples
      // bucket. There is no separate "anonymous" identity.
      const apiKey = sessionApiKey(req.session!) ?? env.GROUNDX_PARTNER_API_KEY;
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
        ...(usesCustomerScopedHeader ? { customerKey: sessionUsername(req.session!)! } : {}),
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
  // scopeHint is optional; defensive validation so a malformed shape
  // doesn't poison the LLM prompt.
  let scopeHint: HandleChatMessageRequest["scopeHint"] = undefined;
  if (isObject(body.scopeHint)) {
    const fn = body.scopeHint.fileName;
    const st = body.scopeHint.scenarioTitle;
    scopeHint = {
      fileName: typeof fn === "string" ? fn : fn === null ? null : undefined,
      scenarioTitle: typeof st === "string" ? st : st === null ? null : undefined,
    };
  }
  // widget-llm-integration Phase 5 — accept the active ViewerStep
  // kind so the tool catalog sent to the LLM is filtered to the
  // user's current surface. Unknown/missing values fall through to
  // the broad catalog (no filter) — defensive against legacy clients.
  let activeStepKind: string | null | undefined = undefined;
  const ask = (body as Record<string, unknown>).activeStepKind;
  if (typeof ask === "string") activeStepKind = ask;
  else if (ask === null) activeStepKind = null;
  return {
    chatSessionId: body.chatSessionId,
    newUserMessage: body.newUserMessage,
    intent: typeof intent === "string" ? intent : intent === null ? null : undefined,
    scopeHint,
    activeStepKind,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
