# WF-01: wireframe fidelity pass — F1–F7 + step strip

## Why

A full walk of the live onboarding flow against the canonical wireframes
in `openspec/wireframes/source/spec-*.jsx` shows the implementation has
drifted hard on shape, layout, and behavior. The widget plumbing (chat
router, tool catalog, suggested actions) is solid; the **rendered F-frame
shells are not**. A new user dropped into `/onboarding` today gets a
narrative that doesn't match the spec at any frame.

This change is the cleanup pass. Findings below were captured with
Chrome DevTools MCP against the running app (localhost:5173) on
2026-05-28; screenshots are under `.review/` (gitignored).

## Punch list — observed vs canonical

### F1 — Ingest landing

| # | Observed | Canonical (`spec-nav-v2.jsx` `Canvas_Ingest`) | Severity |
|---|---|---|---|
| F1.1 | Left sidebar (Workspaces / Projects / Book a call / Docs) is rendered | F1 hides nav entirely — "no chrome" until F1→F2 | **major** |
| F1.2 | Empty chat pane on the right ("Ask anything about the sample…") | No chat panel in F1 (chat slides in during F1→F2 transition) | **major** |
| F1.3 | Only **1** sample tile (Utility Bill) | Three sample tiles: Utility · Loan · Solar | **major** |
| F1.4 | Capability legend reads "capabilities demonstrated: E I R · hollow = not in this sample" — close enough | Same intent; copy matches | ✓ |
| F1.5 | BYO row label is `🔒 BRING YOUR OWN — SIGN UP FREE TO UNLOCK` | Matches | ✓ |
| F1.6 | BYO tiles have diagonal-stripe lock overlay + green CTAs | Matches | ✓ |
| F1.7 | No "↳ Sign up triggers F1→F2 transition + loads F6 gate inline in chat" coral pill below BYO label | Spec pins it | minor |
| F1.8 | Step strip Ingest = green active; Understand/Analyze/Integrate = `Available after sign-in` lock | Spec: Understand/Analyze/Integrate hollow + not-yet-reachable (not "sign-in" locked — that's a step-strip semantic mismatch) | minor |

### F2 — Understand · live parse

| # | Observed | Canonical (`spec-chapters.jsx` `Flow_Processing`) | Severity |
|---|---|---|---|
| F2.1 | **No PDF viewer is mounted** during the thinking phase. The chat plays the thinking notes, but the canvas already renders `onboarding-frame-f3` (Extract workbench). | F2 = centered PDF viewer (≤ 560px wide, aspect 8.5/11) with scan-line animation + page thumbnails. Thinking notes IN the chat column, PDF in the canvas. | **critical** |
| F2.2 | Step strip jumps straight to "Extract" (green) — Understand is already ✓ done-traversed | Spec: Understand stays the active step throughout F2 | **major** |
| F2.3 | No scan-line animation / shimmer / cyan wash | Spec pins these as the core F2 visual signal | **major** |
| F2.4 | No page thumbnails strip below the viewer | Spec: 3-page thumbnails, parsing page bordered green + glow, queued dimmed | **major** |
| F2.5 | "Pick a view:" chip row offers only `Statement` and `Meters` | Spec: `statement · meters · charges · edit schema` (4 chips minimum) | minor |
| F2.6 | Thinking notes stream is rendered; copy mostly matches the wireframe (`parsing layout`, `found header`, `extracting meter table`, …) | ✓ — keep | ✓ |
| F2.7 | "Done. Ready to analyze." closer bubble present | Spec: `Done. 3 pages · 20 statement fields · 8 meters · 56 charges. Ready to analyze.` — implementation is truncated | minor |

### F3 — Extract · doc + fields side-by-side

| # | Observed | Canonical (`spec-flow.jsx` `Flow_Peek`, `spec-extract.jsx`) | Severity |
|---|---|---|---|
| F3.1 | **Layout is inverted**: fields panel LEFT, empty "PREVIEW · Click a field on the left to see its source pages and snippets" pane RIGHT | Spec: PDF viewer LEFT (`1.2fr`), Extracted fields RIGHT (`1fr`), with the source region highlighted on the PDF when a field is hovered | **critical** |
| F3.2 | Topbar text overlaps itself: "Designing utility · statement" overlaps "v1 · draft", "export", "rerun", "Save" — actions are unreadable | Spec: clean topbar with `← back`, schema name + version chip, ghost `export ▾`, `↻ rerun`, primary `💾 Save 🔒` | **major** (looks broken) |
| F3.3 | No category tabs row (statement · meters · +N more) | Spec: tabs `statement · 20` / `meter #3 · 10 · 3 of 10 locked 🔒` / `+7 more` | **major** |
| F3.4 | No "🔒 Preview · N meters and N statement fields are signed-in-only" unlock banner | Spec pins the banner | **major** |
| F3.5 | Field cards render as Title-case label + sentence-case description + value + `[1]` chip | Spec: uppercase snake_case key (e.g. `meter_id`) + value (`kalam`/Inter bold navy) + coral citation `[n] p.X` + active card on green inset | **major** (off-brand) |
| F3.6 | Citation chips are **cyan** | Spec: chips are coral when low-confidence/anomaly, cyan otherwise; F3 active = green inset | minor |
| F3.7 | Hamburger menu (uid 3_45 "Fields panel menu") is implemented | Spec: floating menu with `Save schema… 🔒 / Edit schema… 🔒 / Export CSV 🔒 / Export JSON 🔒 / Filter fields… / Group by` — verify items match | check |
| F3.8 | "Try asking a question →" button at bottom of left pane | Not in canonical F3 — likely a leftover affordance | minor |

### F4 — Expanded field citation (provenance)

| # | Observed | Canonical (`spec-flow.jsx` `Flow_Extract`) | Severity |
|---|---|---|---|
| F4.1 | F4 is essentially absent — clicking a field shows nothing distinct on the right (PREVIEW pane stays empty) | Spec: breadcrumb `← all fields › meters · #3 › peak_demand_kw`, PDF region lit green with `match · 98%` floating label, right-side `Field provenance` panel with FIELD / SOURCE / WHY MATCHED / CONFIDENCE / NEIGHBORS sections | **major** |
| F4.2 | No "▴ collapse" / "↗ open full doc" controls | Spec pins these in the breadcrumb row | **major** |

### F5 — Interact · synthesis answer

| # | Observed | Canonical (`spec-flow.jsx` `Flow_Answer`) | Severity |
|---|---|---|---|
| F5.1 | URL `/onboarding/28454/utility/interact` crashes with "Something went wrong" (no routes matched) | Spec: F5 is reachable via the step strip Interact sub-pill or a chat suggestion. **No URL path is required**, but the error boundary should not fire when the user lands on a step | **major** (UX) |
| F5.2 | No single-pane PDF viewer with 4 colored citation regions rendered when an answer is given | Spec: F5 = wide PDF with 4 lit regions, each color-keyed to a `[N]` CiteChip in the answer | **major** |
| F5.3 | Sample switcher row + collapsed-history strip not pinned in F5 layout | Spec pins both | minor |
| F5.4 | "🔒 Locked behind sign-in" unlock banner not pinned below the canvas | Spec: banner becomes visible after ≥1 extract + 2 questions | minor |

### F6 — Gate

| # | Observed | Canonical (`spec-flow.jsx` `Flow_Gate`) | Severity |
|---|---|---|---|
| F6.1 | Gate is implemented as an inline `GateChatRail` widget (✓ shape matches "lives inside chat") | Spec: same — inline in chat, NOT a modal | ✓ |
| F6.2 | Need to verify: dim-but-don't-blur canvas behind, ESC/× to dismiss without losing session, magic link + SSO + book-call three doors | Spec pins all of these | check (browser probe pending) |
| F6.3 | Gate copy ("One quick step. Sign in to unlock the full demo." / 4-bullet list / "Free tier: 100 pages parsed. No credit card.") — verify | Spec pins exact copy | check |

### F7 — Integrate

| # | Observed | Canonical (`spec-nav-v2.jsx` `Canvas_Integrate`) | Severity |
|---|---|---|---|
| F7.1 | Not visited in this pass (sub-pill is non-clickable; see step-strip bug) | Spec: 2-col grid (API tile + Agent Plugins tile), masked API key, 4 plugin rows | **major** (unverified) |
| F7.2 | Per `ui-views` spec requirement `F7 IntegrateView SHALL ship real connector cards + plugin downloads` — backlog item still open | known | (existing) |

### Step strip (cross-cutting)

| # | Observed | Canonical (`spec-widgets.jsx` W2) | Severity |
|---|---|---|---|
| SS.1 | Extract / Interact / Report sub-pills inside the ANALYZE bracket are rendered as plain `<div>` with no `role="button"`, no `onClick`, no `tabindex` (see `StepStrip.tsx:38`) — they cannot be navigated to | Spec: sub-pills are navigable once Extract is reached | **critical** (blocks F4→F5 + F3→F5 navigation) |
| SS.2 | Top-level steps (Ingest, Understand, Integrate) get "Available after sign-in" titles when locked | Spec: lock state is "not yet reachable" not "sign-in" — confusing copy for an anon user who's mid-flow | minor |
| SS.3 | Connector bars between pills are rendered | ✓ | ✓ |
| SS.4 | Per `app-architecture` spec, the step strip is supposed to navigate; the test backlog suggests partial coverage | gap | (existing) |

### Sidebar / AppShell

| # | Observed | Canonical (`spec-primitives.jsx` `AppShell`, `navTopFor`, `navBottomFor`) | Severity |
|---|---|---|---|
| NAV.1 | Sidebar renders even in F1 | Spec: F1 `navState='minimal'` (no nav) | **major** |
| NAV.2 | Top section shows `Workspaces` + `Projects` disabled with "Sign in to use" — matches the `navTopFor` shape for `loggedOut` | ✓ | ✓ |
| NAV.3 | Bottom section: `★ Book a call` (loggedOut, coral eyebrow + green outline) + `Docs` — matches | ✓ | ✓ |
| NAV.4 | No `Settings` / `API Keys` in loggedOut nav | ✓ — spec says signed-in only | ✓ |

### Scenarios (S-series)

| # | Observed | Canonical (`spec-scenarios.jsx`, `spec-scenario-end.jsx`) | Severity |
|---|---|---|---|
| S.1 | Only `utility` scenario fixture exists; `/api/scenarios` returns 1 scenario | Spec: 3 scenarios — Utility / Loan / Solar Portfolio. Loan = S1 surface, Solar = S2/S3/S3a | **major** |
| S.2 | S1 (Loan JSON render) — never reachable | Spec: surface ships | **major** (unverified — depends on S.1) |
| S.3 | S2 (Solar Portfolio cross-doc roll-up) — never reachable | gap | **major** |
| S.4 | S3 / S3a (Solar IC brief + report builder) — never reachable | gap | **major** |

### Bugs surfaced in passing

| # | Bug | Where |
|---|---|---|
| BUG.1 | Direct sub-frame URL (e.g. `/onboarding/28454/utility/interact`) trips error boundary | `router.tsx:60` — only `:bucketId/:scenarioId` route is defined; no per-sub-frame route. Fix: either define routes or redirect to canonical |
| BUG.2 | Empty assistant bubble above suggested-action chips | **already fixed** in `ChatColumn.tsx` (2026-05-28) |
| BUG.3 | Snippet-rereading prompt — LLM saying "no snippets" when JSON field present | **already fixed** in `chatRouter.ts` (2026-05-28) |
| BUG.4 | Console warning "No routes matched location" (preserved warning in current page) | follow-up to BUG.1 |

## What changes

This change is a **layout + behavior cleanup pass**, not a redesign. The
widget contract, chat-routing pipeline, tool catalog, and orchestrator
all stay as-is. What moves:

1. **F1 chrome**: AppShell hides sidebar + chat pane on F1; IngestView
   gets all available width. (Already partially gated by `isF1` in
   `OnboardingShell.tsx:163` — the chrome-hiding part is missing.)
2. **F1 scenarios**: extend the scenario fixture from 1 to 3
   (Utility / Loan / Solar) with the manifest shapes documented in
   `openspec/wireframes/source/uploads/preloaded-content-scenarios.md`.
3. **F2 PDF-viewer-during-scan**: render the PDF viewer in the canvas
   while the thinking-stream plays in chat. Move the scan-line
   animation + thumbnail strip into the canvas pane. Step strip stays
   on "Understand" until the chat lands its `Done.` bubble.
4. **F3 layout flip**: PDF viewer LEFT, fields RIGHT. Fix the topbar
   overlap. Render category tabs + sign-in unlock banner.
5. **F3 field-card anatomy**: uppercase snake_case key + value + coral
   citation chip + active-card green inset.
6. **F4 provenance panel**: when a field card is clicked, render the
   breadcrumb + lit PDF region + right-side `Field provenance` panel
   with WHY MATCHED / CONFIDENCE / NEIGHBORS sections.
7. **F5 wide PDF + colored citations**: when an answer with multiple
   citations lands, lit regions appear on the PDF in cite-chip colors.
8. **Step strip sub-pills**: Extract / Interact / Report become `role=
   "button"` + `onClick` + keyboard-reachable when their step is
   reachable.
9. **Sub-frame routes**: `/onboarding/:bucketId/:scenarioId/:step`
   routes exist for deep-linking, OR an effect redirects unknown paths
   to the canonical no-step URL. The error boundary must not fire.
10. **S1 / S2 / S3 / S3a**: out of scope for this change — fold into a
    follow-up once F1–F7 are fidelity-clean. Track as separate change.

## Out of scope

- S-series scenario surfaces (S1 / S2 / S3 / S3a). Tracked as a follow-up.
- F6 gate (already widget-shaped; verify in pass-2 if visual issues).
- BookCallView / SignUpWidget overlays (already implemented).
- Steady-mode session view (`SteadyShell`).
- The `widget-llm-integration` work — done and validated.

## Affected

- App: `views/Onboarding/{IngestView, UnderstandView, ExtractView,
  InteractView, IntegrateView, OnboardingShell}.tsx`,
  `components/layout/{AppShell, StepStrip}/`,
  `components/viewer-widgets/PdfViewer/`,
  `views/Onboarding/SchemaView.tsx` (F3a topbar).
- Middleware: `services/scenarioRegistry.ts` (extend to 3 scenarios) +
  3 manifest fixtures.
- Routes: `router/router.tsx`, `router/routerPaths.ts` (per-step
  routes or unified redirect).
- Specs: `ui-views`, `app-architecture` — modified to pin the
  canonical-shape requirements that the punch list violates.
