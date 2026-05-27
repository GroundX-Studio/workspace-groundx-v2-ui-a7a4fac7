# OPS-04 — Air-gapped / on-prem deploy audit

Locked 2026-05-25. Per `project_decisions_stack.md` decision #20:
"design for easy support, don't fully implement." This is the
awareness pass — every external dep should have an env-var seam so an
on-prem deploy can swap the host. Where a seam is missing, this doc
records the gap so a future closure ticket can wire it without
re-discovering the URL.

## How to read this

Each row is one external host (or `appConfig` URL) that the runtime
contacts in production. Columns:

- **Host / URL** — the literal string in source.
- **Used for** — what the bytes are.
- **Source** — `path:line` of the canonical declaration.
- **Seam** — ✅ env-var overridable today, ⚠️ partial, ❌ hardcoded.
- **On-prem path** — what an air-gapped deploy does about it.

## Inventory

| Host / URL | Used for | Source | Seam | On-prem path |
|---|---|---|---|---|
| `https://api.groundx.ai/api/v1` | GroundX REST API base | `middleware/src/config/env.ts:39` | ✅ `GROUNDX_BASE_URL` (defaulted) | Set `GROUNDX_BASE_URL=https://groundx.internal/api/v1` |
| `LLM_BASE_URL` (env) | Chat LLM provider | `middleware/src/config/env.ts:47` | ✅ env-only, no default | Point at internal LLM gateway |
| `LLM_LIGHT_BASE_URL` (env) | Light LLM provider | `middleware/src/config/env.ts:59` | ✅ env-only, no default | Point at internal light LLM |
| `SENTRY_DSN` / `VITE_SENTRY_DSN` (env) | Error tracking | `middleware/src/config/env.ts:106`, `app/src/main.tsx:11` | ✅ env-only; both layers no-op when unset | Either leave unset (no error reporting) OR point at self-hosted Sentry |
| `https://us.i.posthog.com` | PostHog product analytics | `app/src/lib/analytics.ts:31` (default), `app/src/main.tsx:15` (env-override) | ✅ `VITE_POSTHOG_HOST` overrides; full no-op when `VITE_POSTHOG_API_KEY` is unset | Leave key unset for full no-op, OR set `VITE_POSTHOG_HOST=https://posthog.internal` |
| `https://www.googletagmanager.com/gtag/js` | GA4 loader script | `app/src/lib/ga.ts:61` | ✅ Only injected when `VITE_GA_MEASUREMENT_ID` is set; full no-op otherwise | Leave `VITE_GA_MEASUREMENT_ID` unset |
| `https://docs.groundx.ai` | "Docs" CTA | `app/src/views/Onboarding/OnboardingShell.tsx:361` | ❌ Hardcoded URL | **Gap** — add `VITE_DOCS_URL` env or `APP_CONFIG.docs.url`; on-prem deploy sets it to internal docs site OR hides the CTA via `APP_MODE_PRESET` |
| `https://calendly.com/groundx/30min` | "Book a call" CTA | `app/src/views/Onboarding/OnboardingShell.tsx:367` | ❌ Hardcoded URL (UI-08 also calls this out) | **Gap** — add `VITE_CALENDLY_URL` env or `APP_CONFIG.calendly.url`; UI-08 will land this. On-prem deploys typically hide the CTA entirely |
| `https://calendly.com`, `https://*.calendly.com` | CSP frame-src | `middleware/src/app.ts:108` | ⚠️ Hardcoded in CSP allowlist | When the Calendly URL flips to env-driven, the CSP allowlist should derive from the same env var. Today an on-prem deploy that drops Calendly entirely would also want to remove these from the CSP |
| `https://fonts.googleapis.com/css2?...` | Inter font CSS | `app/src/fonts.css:17` | ❌ Hardcoded `@import` | **Gap** — on-prem deploys can't reach Google. Strategy: bundle Inter as a self-hosted font (`/fonts/inter-*.woff2`), drop the `@import`, and pin the CSP `font-src: 'self'`. This is the only host with a real on-prem behavior change |
| `https://fonts.gstatic.com` | Google font binaries | `middleware/src/app.ts:136` (CSP) | ❌ CSP allowlist only | Drop from CSP when fonts.googleapis.com `@import` is removed |
| `https://api.fontshare.com/v2/css?...` | Thicccboi font CSS | `app/src/fonts.css:25` | ❌ Hardcoded `@import` | Same as Inter — self-host Thicccboi (`/fonts/thicccboi-*.woff2`) and drop the import |
| `https://cdn.fontshare.com` | Fontshare CDN | `middleware/src/app.ts:136` (CSP) | ❌ CSP allowlist only | Drop from CSP when fontshare `@import` is removed |
| `https://www.eyelevel.ai/product/terms-conditions` | Terms URL in EULA checkbox | `app/src/appConfig.ts:134` | ⚠️ Hardcoded in `APP_CONFIG.legal.termsUrl` | **Gap** — `appConfig.ts` is a single struct that could read env (`VITE_TERMS_URL`) with the public eyelevel.ai URL as default. On-prem deploys point at internal terms |

## Summary

- **6 of 13 hosts have proper env-var seams already.** GROUNDX_BASE_URL,
  LLM_BASE_URL, LLM_LIGHT_BASE_URL, SENTRY_DSN, VITE_POSTHOG_HOST,
  VITE_GA_MEASUREMENT_ID. The telemetry trio (PostHog / Sentry / GA)
  follows the same "no-op when unset" pattern from CF-13 / OB-02 / OB-03.
- **4 hardcoded URLs are gaps** that should turn into env vars before
  the first on-prem deploy: `docs.groundx.ai`, `calendly.com/groundx/30min`,
  the two font `@import`s (Inter via Google, Thicccboi via Fontshare),
  and the eyelevel.ai terms URL.
- **CSP allowlist hardcodes** for fonts + Calendly are a derived
  concern — once the underlying URLs are env-driven, the CSP entries
  should be derived from the same env vars, not hand-edited.

## Recommended follow-ups (file each as its own OpenSpec change if/when needed)

1. **Self-hosted font bundle.** Drop both `@import` statements in
   `app/src/fonts.css`; serve woff2 from `public/fonts/`. Tighten CSP
   `font-src` to `'self' data:`. Tracks to a single PR.
2. **`VITE_CALENDLY_URL` + `APP_CONFIG.calendly.url`.** Pair with UI-08
   (engineer-call wire-up). When unset, hide the "Book a call" CTA.
3. **`VITE_DOCS_URL` + `APP_CONFIG.docs.url`.** Defaults to public
   `docs.groundx.ai`; on-prem deploys point at internal.
4. **`VITE_TERMS_URL` + `APP_CONFIG.legal.termsUrl` reads env.**
   Default stays public; on-prem reads from env.
5. **Derive CSP frame-src + font-src from the same env vars.** Today
   `middleware/src/app.ts` has hand-edited CSP literals; once the
   Calendly + font URLs are env-driven, the CSP builder should
   compose from the same values.

## Out of scope for this audit

- `MOCK_MODE` fixture URLs (`api.groundx.test`, `llm.test`) — test-only,
  never reach production.
- IAM endpoints (`*.amazonaws.com`) — those are AWS-SDK-driven and
  configurable through the standard AWS env vars; not a "host" in the
  same sense.
- Inline `curl` example strings in copy (e.g. `IntegrateView.tsx:24`
  shows `api.groundx.ai` in a code-block) — these are documentation
  prose, not runtime calls. They should track whatever the canonical
  env-var-derived host is, but the audit only flags runtime calls.
