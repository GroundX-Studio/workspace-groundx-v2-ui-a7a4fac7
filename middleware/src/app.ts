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
import { sendUpstreamResponse } from "./services/http.js";
import type { AppRepository, GroundXClient, GroundXPartnerClient, LlmClient } from "./types.js";

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

  app.use(pinoHttp({ logger }));
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
