# Adversarial Reviews

Each task must pass this gate before the next task starts.

## Template

- Task:
- Claims made:
- Counterevidence searched:
- Checks performed:
- Verdict:
- Required correction:

## Task 1: Create And Validate OpenSpec Plan

- Claims made:
  - The OpenSpec plan exists for issues #18, #19, and #20.
  - The plan is sequential and includes adversarial reviews after each issue.
  - No product code was changed while creating the plan.
- Counterevidence searched:
  - Active OpenSpec state before creating the plan.
  - Issue #18, #19, and #20 live metadata.
  - Placeholder and unchecked-task scan.
  - Git status after plan creation.
- Checks performed:
  - `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 list` showed no active changes before the plan.
  - `gh issue view 18`, `19`, and `20` confirmed all three target issues were open.
  - `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate 2026-06-04-close-issues-18-19-20 --strict` passed.
  - `git status --short` showed only the new OpenSpec change directory.
- Verdict: passed.
- Required correction: none.

## Task 2: Resolve #18 registerAdapter Spec Contradiction

- Claims made:
  - Durable `app-architecture` no longer says `registerAdapter` is retired.
  - The retained invariant is dispatch-first: the switch names every intent kind,
    and adapter-backed cases run through the existing fallback.
  - No product code changed for #18.
- Counterevidence searched:
  - Live `registerAdapter` source callers.
  - Durable `app-architecture` spec text before and after the patch.
  - Agent architecture docs that describe `dispatch` and `registerAdapter`.
  - OpenSpec strict validation.
- Checks performed:
  - `rg -n "registerAdapter|adaptersRef|submitSignup|wizardNext|closeDialog|dismissWizard" app/src openspec/specs/app-architecture/spec.md docs/agents/architecture.md`
  - `rg -n "registerAdapter.*RETIRED|RETIRED.*registerAdapter|no widget today uses it|registerAdapter" openspec/specs/app-architecture/spec.md openspec/changes/2026-06-04-close-issues-18-19-20/specs/app-architecture/spec.md`
  - `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate 2026-06-04-close-issues-18-19-20 --strict`
- Verdict: passed.
- Required correction: none. Issue #18 can be closed after final validation,
  archive, and commit.

## Task 3: Migrate Smart Report To filter.projectId (#19)

- Claims made:
  - Smart Report product scopes now emit and resolve `filter.projectId`, not
    the stale `filter.project` key.
  - App fixture/template routing, onboarding report scope construction,
    middleware doc-set resolution, and HTTP render tests agree on the canonical
    field.
  - The deprecated key is rejected by focused negative tests instead of silently
    widening to the whole bucket.
  - Issue #11 remains separate: the app fixture accepts `proj_utility` only as a
    local test projectId alias, not as the old `project` field.
- Counterevidence searched:
  - Product report fixture code, onboarding scope construction, fake API tests,
    Smart Report README examples, middleware resolver/index, and middleware app
    render route tests.
  - Focused static guard for stale `filter.project` syntax in report product
    app files.
  - Existing `/projects` scoped flow vocabulary, which already uses
    `filter.projectId` and was not modified by this task.
- Checks performed:
  - Red phase: focused app tests failed on stale implementation because the
    static guard found product report offenders and `projectId` scopes did not
    route to Utility; focused middleware tests failed because
    `resolveScopeDocSet` still read `filter.project`.
  - `npm --prefix app run test -- src/widgets/reportFixtures.test.ts src/widgets/reportScopeVocabulary.test.ts src/components/viewer-widgets/SmartReportRender/SmartReportRender.test.tsx src/components/viewer-widgets/SmartReportBuilder/SmartReportBuilder.test.tsx src/api/smartReport.test.ts src/test/makeFakeApi.test.ts`
  - `npm --prefix middleware run test -- src/services/reportRenderer.test.ts src/app.test.ts`
  - `rg -n "filter\\s*:\\s*\\{\\s*project\\s*:|filter\\?\\.project\\b|filter\\.project\\b" app/src/widgets/reportFixtures.ts app/src/views/Onboarding/OnboardingShell.tsx app/src/test/makeFakeApi.test.ts app/src/components/viewer-widgets/SmartReportRender/README.md app/src/components/viewer-widgets/SmartReportBuilder/README.md middleware/src/services/reportRenderer.ts middleware/src/app.test.ts`
- Verdict: passed.
- Required correction: none. Issue #19 can be closed after final validation,
  archive, and commit.

## Task 4: Gate Frontend Analytics Behind Consent (#20)

- Claims made:
  - `main.tsx` no longer initializes PostHog or GA before React renders.
  - Frontend analytics initializes only after accepted consent when PostHog or
    GA env values are configured.
  - Unconfigured local/test builds show no consent banner and make no tracker
    init calls.
  - GA defaults set by app/session contexts before consent are no-op safe and
    flush once GA initializes after consent.
  - Production-preview browser evidence shows no analytics requests before
    consent and GA/PostHog requests only after accept.
- Counterevidence searched:
  - Static `main.tsx` bootstrap source for `initAnalytics`, `initGa`,
    `gaSetDefaults`, and frontend analytics env reads.
  - Provider tests for cold-load banner, pre-accept no-init, persisted accepted
    consent, no-config no-op, and tracker init after accept.
  - GA wrapper tests for pre-init no-op and delayed default flush.
  - Browser network requests before and after clicking the consent action.
  - Chrome DevTools MCP availability: this session exposed page-selection and
    selected-request tools but not navigation/network-list tools, so the browser
    proof used a documented Playwright fallback.
- Checks performed:
  - Red phase: `npm --prefix app run test -- src/main.analyticsConsent.test.ts src/components/privacy/AnalyticsConsent/AnalyticsConsentProvider.test.tsx src/lib/ga.test.ts` failed because `main.tsx` still initialized analytics at boot, the provider module did not exist, and GA defaults did not flush after delayed init.
  - `npm --prefix app run test -- src/main.analyticsConsent.test.ts src/components/privacy/AnalyticsConsent/AnalyticsConsentProvider.test.tsx src/lib/ga.test.ts src/lib/analytics.test.ts src/App.test.tsx`
  - `VITE_POSTHOG_API_KEY=phc_test VITE_POSTHOG_HOST=https://app.posthog.com VITE_GA_MEASUREMENT_ID=G-TEST123 VITE_LLM_PROVIDER=openai npm --prefix app run build`
  - Production-preview Playwright audit against `http://127.0.0.1:5180/`:
    before consent `[]`; after consent included
    `https://us-assets.i.posthog.com/array/phc_test/config.js`,
    `https://www.googletagmanager.com/gtag/js?id=G-TEST123`, and PostHog
    config/flags requests; localStorage stored `accepted`.
  - Dev server note: Vite dev mode remained blocked by an existing MUI optimized
    dependency error (`createTheme_default is not a function`), so browser
    evidence was taken from production build + preview.
- Verdict: passed.
- Required correction: none. Issue #20 can be closed after final validation,
  archive, and commit.
