# Backlog

**The single source of truth for pending work across the project.**

Every item has a stable id. Inline `TODO(<id>)` markers in source
reference an entry below. When an item closes, the inline TODO gets
DELETED.

Created 2026-05-25 after the working-session pattern of "close the
seam, leave the implementation as TODO" became a project-wide
problem. Memory's `project_build_status.md` "Still open" section
points here.

## Rules of engagement

1. **Definition of done = user-visible test.** A test against the
   seam (interface compiles, mock works) is `in-progress`, not
   `closed`. Closure requires a test exercising real user behavior.
2. **WIP cap = 3 per epic.** Before opening a 4th in any one
   epic, close one OR move it back to `not-started`.
3. **Closure deletes inline TODOs.** Grep should never find a
   `TODO(X-N)` that points at a closed item.
4. **Honest commit titles.** "X: seam + 3 of 7 sub-cases wired" not
   "X: done."
5. **No silent additions.** New work goes here with a status before
   any code lands.
6. **Closed rows are swept periodically** to keep this file
   readable. The closure context lives in git history + commit
   messages, not here. Last sweep: 2026-05-26.

## Status legend

- **not-started** — design known, no code yet
- **in-progress** — partial — has a seam or some sub-cases; pending
  more before user-visible test passes
- **blocked** — external dependency (data table, env, product call)
- **closed** — user-visible test passes; inline TODOs deleted

## Priority (revised 2026-05-26 after ARCH epic addition)

Priority is orthogonal to status — a blocked P0 still beats a
not-started P2. The default is P2; non-default IDs are listed
explicitly.

- **P0** — Architecture epic. All 14 items closed (2026-05-26):
  ARCH-01 ✅, ARCH-02 ✅, ARCH-03 ✅, ARCH-05 ✅, ARCH-06 ✅,
  ARCH-07 ✅, ARCH-08 ✅, ARCH-14 ✅, ARCH-15 ✅, ARCH-16 ✅,
  ARCH-17 ✅, ARCH-18 ✅, ARCH-21 ✅, ARCH-22 ✅
- **P1** — OPS-01 (blocked, harness-side), ARCH-09, ARCH-10,
  ARCH-11, ARCH-13, ARCH-19, ARCH-20
- **P2** — everything else (implicit), plus **TS-05, TS-06, TS-07**
  (demoted 2026-05-25 — each has a real upstream blocker; see
  per-row "Blocker" notes), **ARCH-12, ARCH-23, ARCH-25**
- **P3** — every `deferred-late` item (CF-06a, PLUG-07)

The original 2026-05-25 P0 tier (UR-03, UR-04, TS-02, TS-03, TS-08,
TS-09, TS-11) is fully closed; those rows were swept from the epic
tables on 2026-05-26 to reduce noise.

## ID conventions

| Prefix | Epic | Owner direction |
|---|---|---|
| `CF-N` | Chat algorithm | LLM runtime + RAG + compression |
| `AU-N` | Auth + RBAC | Sessions, magic-link, SSO, session merge |
| `DT-N` | Data model | DB schema, migrations, scope refs |
| `UI-N` | Product surfaces | F1–F7 views + Steady mode |
| `TL-N` | Agent tools | Tool surface + canvas dispatch routes |
| `OB-N` | Observability | Sentry, PostHog, GA, Hotjar, dashboards |
| `SC-N` | Security | CSRF, consent, PII expansion |
| `UR-N` | UI runtime | pdfjs, drag-resize, motion, primitives |
| `SCEN-N` | Scenarios | Per-scenario fixtures + completeness |
| `SL-N` | Scale / perf | Pool sizing, batching, streaming, background jobs |
| `TS-N` | Testing | Coverage gaps + load + a11y + visual regression |
| `OPS-N` | Operations | Migrations infra, MCP cluster reading |
| `POL-N` | Polish | Known minor bugs |
| `PLUG-N` | Plugin system | Plugin loader, OnboardingSkillContext, SDR content, tour state machine, onboarding overlay surface |
| `ARCH-N` | Architecture | Widget contract, single-AppShell unification, primitives + brand reorg |

---

# Foundations (must land first; unblocks above)

These are dependency roots. Pick from here when nothing in your
current epic is actionable.

| ID | Status | Item | Closure test |
|---|---|---|---|
| **DT-01** | not-started | Knex migrations directory + Helm pre-install job. Today `createSchema()` inlines `CREATE TABLE IF NOT EXISTS`. Productionizing: versioned `middleware/src/db/migrations/NNNN_*.sql` + Helm pre-install/upgrade Job that runs them. Memory: project_database.md "knex migrations deferred." | Schema change between two migrations rolls forward + back cleanly. |
| **DT-02** | not-started | MySQL primary in production. Schema + repo impls + claim endpoint exist. Provision RDS/self-hosted, set `APP_REPOSITORY_MODE=mysql` + creds, first deploy runs `createSchema()`. | Production deploy reads/writes against MySQL; in-memory repo unused. |

# Epic: ARCH — widget contract + single-AppShell unification + component-library reorg

Added 2026-05-26 after a multi-day pattern of bugs caused by an
unclear separation between "onboarding views" and "production
widgets," compounded by drift between two PdfViewer files. Expanded
2026-05-26 (round 2) to also include: the `primitives/` + `brand/` +
`layout/` taxonomy for shared components; the no-hardcoded-styles
drift guard expansion; the cleanup of scaffold-default views
(`Home`, `CoreLayouts/Dashboard`, `AppStatus`, `Banned`) that the
product doesn't use; and a `views/_scaffold/` carve-out for
non-product-but-kept-around surfaces (`Health`).

**Locked design**:

- ONE app shell — `AppShell = nav | (header + (chat | viewer))` —
  used by every route.
- Onboarding is an OVERLAY decorating that shell, not a parallel
  hierarchy.
- Two slot-scoped widget contracts: `chat-widgets` and
  `viewer-widgets`, each in their own directory.
- F1 `IngestView` is the explicit exception (per
  `memory/feedback_no_onboarding_duplicates.md`: F1, sign-up,
  onboarding-nav are the only onboarding-only surfaces).
- `components/` has FIVE siblings: `primitives/` (unbranded atoms),
  `brand/` (Gx molecules), `layout/` (chrome singletons),
  `chat-widgets/` (slot), `viewer-widgets/` (slot).
- All visible styling resolves to theme tokens. The
  no-hardcoded-styles drift guard expands from 6 F1 files to every
  component + view file.

**Execution order** (option-B per user direction — primitives
first, bug fix after):

ARCH-01 (contract doc) → ARCH-08 (drift guard) → ARCH-02 (delete
dead PdfViewer) → ARCH-03 (slot reorg) → ARCH-14 (taxonomy doc) →
ARCH-15 (component map) → ARCH-18 (build primitives) → ARCH-16
(move components) → ARCH-17 (expand drift guard) → ARCH-22 (delete
CoreLayouts) → ARCH-21 (Home redirect) → ARCH-24 (delete
AppStatus/Banned, move Health under `_scaffold/`) → ARCH-19 (migrate
F1) → ARCH-20 (migrate other views) → ARCH-05 (sign-up split — the
bug fix that motivated the epic) → ARCH-06 (collapse
OnboardingShell) → ARCH-07 (unified steady) → ARCH-09 (memory
updates) → ARCH-10 (thin view wrappers) → ARCH-11 (ThinkingStream
widget) → ARCH-23 / ARCH-25 (cleanup) → ARCH-13 (audit memo to
harness team — last).

| ID | Status | Item | Closure test |
|---|---|---|---|
| ARCH-01 | closed | **Define the widget contract**. `scaffold/docs/agents/widget-contract.md` shipped 2026-05-26. Documents slot directories, `mode` prop contract, README + test requirements, primitives catalog (PillRow/StatusCard/BotBubble/UserBubble/ThinkingNote/LoadingDots/MagicLinkInput), widget catalog, F1 IngestView carve-out exception. | Doc exists + drift guard (ARCH-08) passes. |
| ARCH-02 | closed | **Delete dead `shared/components/PdfViewer.tsx`**. Closed 2026-05-26 — file + sibling test deleted; zero imports remained. | `grep -rn "shared/components/PdfViewer" src` returns nothing; tests pass. |
| ARCH-03 | closed | **Reorganize widget tree** to `components/chat-widgets/<Name>/` + `components/viewer-widgets/<Name>/`. Moved 2026-05-26: PdfViewer + BookCallView to viewer-widgets; BookCallChatPanel renamed → BookingStatusCard in chat-widgets. READMEs + mode prop + data-mode / data-widget attrs added. `components/widgets/` deleted. | All 683 tests green after move; drift guard passes. |
| ARCH-04 | (dropped 2026-05-26) | ~~Refactor F1 picker into a viewer widget~~. **Decision**: F1 stays as onboarding-only `IngestView` per `feedback_no_onboarding_duplicates.md` carve-out. Documented in `widget-contract.md` § The exception. | n/a |
| ARCH-05 | closed (2026-05-26) | **Sign-up split — the bug that motivated this epic.** Sliced into three commits: (A) built `components/viewer-widgets/SignUpWidget/` (form + register pipeline + committed-state celebration) and `components/chat-widgets/GateChatRail/` (eyebrow + per-trigger preamble + book-a-call + dismiss + committed-state Continue CTA), each contract-compliant (README + sibling test + `mode` prop, auto-discovered by `widget-contract.test.ts`); composes from the new primitives so the drift-guard stays green. (B) wired OnboardingShell's `canvasContent` to swap to `<SignUpWidget>` when `gate.status === "open"|"committed"` (precedence: bookCall > gate > frame); GateChatPanel mounts `<GateChatRail>` post-composing-animation instead of the old GateView. (C) deleted `GateView.tsx` + `GateView.test.tsx`; removed its 6-offender EXEMPT entry; migrated `gate-*` testids to `gate-rail-*`/`signup-*` across vitest + Playwright e2e specs; added a new shell-level integration test AND a Playwright regression pinning the canvas swap (sample → gate → form visible, sample hidden → dismiss → sample restored). Magic-link backend deferred to AU-01 (unchanged scope; today's path is direct register). | E2e: from F5 sample → advance-to-f6 → canvas shows `signup-submit`, NOT `onboarding-frame-f5`; chat shows `gate-rail-preamble`; dismiss restores `onboarding-frame-f6`. Plus the existing happy-path + error-path + ESC/keep-exploring dismiss tests still pass under the new selectors. |
| ARCH-06 | closed (2026-05-26) | **Single AppShell instance with F1 as overlay.** Three slices: (A) extended AppShell with `hideChat?: boolean` (mirror of `hideNav`) + `data-shell-instance` attribute (useId-based, stable across re-renders, distinct across mounts) — 4 new tests. (B) Refactored OnboardingShell to mount ONE AppShell across F1 + F2+; F1's `f1Layout` (IngestView + StepStrip) is now an absolute-positioned overlay above the AppShell; AppShell flips `hideNav`/`hideChat`/`header` based on `isF1` so the underneath shell goes from canvas-only (under F1) to fully populated (F2+) as F1 lifts away. Animation reframed per the user's "F1 is the overlay" mental model: A · Sheet dismiss spec — 900ms dismiss with cubic-bezier(0.32, 0.72, 0, 1), opacity holds through 70% then wipes (lift not dissolve); 700ms return with opacity fade in first 30%; F2 zoom 0.985↔1 + opacity 0.92↔1; reduced-motion bypass. (C) Deleted SlideOverlay component + SWIPE_* constants + slideIn/Out keyframes + transitionPhase state machine (~180 lines); deleted 5 SlideOverlay-specific tests; added ARCH-06B closure test asserting `data-shell-instance` is stable across F1→F2→F1 click chain. Animation prototype validated by user via standalone HTML mock (`/tmp/arch-06-animation-preview.html` — three alternatives evaluated A/B/C, A selected with dual-slider tuning). | Closure test passes: `screen.getByTestId("appshell-root").getAttribute("data-shell-instance")` is identical before dismiss, after F1→F2, and after F2→F1 round-trip. Plus the existing 19 OnboardingShell tests still pass under the new architecture. |
| ARCH-07 | closed (2026-05-26) | **Unified steady-state shell.** Refactored `SteadyShell.tsx` to mount the canonical `<AppShell />` with steady-mode widgets in the slots. Before: custom `Box display=flex flexDirection=row` layout with `OnboardingNav` + stacked content body, bypassing AppShell entirely. After: AppShell with `nav={OnboardingNav accountState="free"}`, `chat={SessionSwitcher + session-id panel + unknown-session hint}`, `canvas={"select a doc" placeholder card}`. Chat-side and canvas-side widgets stay placeholders (UI-05 lands the real `ChatWithSources` + steady-mode `PdfViewer` wire-up) — the structural unification is what ARCH-07 closes. Closure test pins `data-testid="appshell-root"` is present in DOM and `data-shell-instance` (ARCH-06A's stable id) carries a value. Existing 3 SteadyShell behavior tests (session-id surfacing, switchTo URL sync, unknown-session hint) still pass under the new structure — testids migrated from a sibling Box into the chat slot's content. Test count 763 → 764. | Authenticated user at `/c/:sessionId` → SteadyShell renders `appshell-root`; same AppShell component as OnboardingShell mounts; no parallel custom shell exists. |
| ARCH-08 | closed | **TDD drift-guard `widget-contract.test.ts`**. Shipped 2026-05-26. Auto-discovers every widget under both slot directories; asserts each has a README, a sibling test, and a `mode` prop. 11 tests pass; deliberately failing a contract piece fails the suite. | Drift guard passes; failing a slot fails the test. |
| ARCH-09 | closed (2026-05-26) | **Memory updated for the post-ARCH state.** (1) Created `memory/feedback_widget_contract.md` — locks the four widget contract invariants (slot placement, README, sibling test, mode prop), the 5-tier component tree, the drift-guard state (EXEMPT = {}, allowlist = 3 documented cases), and the reading order for a spawned agent. (2) Updated `memory/feedback_no_onboarding_duplicates.md` — directory paths refreshed from the old `src/components/widgets/` to the new `chat-widgets/` + `viewer-widgets/` slot layout; "What needs to change" rewritten as "State of the migration" showing UnderstandView ✅, ExtractView/InteractView/IntegrateView ⏳ blocked on UI-01/02/05; GateView reference removed (deleted in ARCH-05C). (3) Updated `MEMORY.md` index to surface the new widget-contract feedback file near the top. (4) Updated `memory/project_build_status.md` with the ARCH epic landed snapshot covering commits 0a6dd13 → c9e45d3 → 4f30116 → 29202b8. Local harness-web-ui skill references not touched (out of project scope per ARCH-09 spec). | Spawned agents picking up the project mid-stream load MEMORY.md → see widget-contract entry near top → read feedback_widget_contract.md → know the contract before touching components. |
| ARCH-10 | partial (2026-05-26) | **Scope-adjusted: only UnderstandView shrunk.** UnderstandView is the only F2-F7 view with an extant production widget (PdfViewerWidget per the earlier real-data rewire). Closed: collapsed UnderstandView from 97 → 39 lines (logic body ≤15 lines); BYO + no-doc placeholders extracted to `UnderstandPlaceholder.tsx` (sibling, composes from Heading/BodyText/Label primitives, two `kind` variants behind a tiny COPY table). The three remaining F2-F7 views (ExtractView 350L, InteractView 239L, IntegrateView 171L) ARE the production logic today — they can't shrink to wrappers until their production widgets exist: ExtractView blocked on **UI-01** (ExtractWorkbench widget), InteractView blocked on **UI-05** (ChatWithSources widget), IntegrateView blocked on **UI-02** (IntegrateBoard widget). Tracked as a follow-up for when those widgets land. Test count 777 → 778 (+1 per-file `it()` for the new UnderstandPlaceholder.tsx). | Partial: UnderstandView ≤ 20 LOC logic body (39 total with docblock + imports); the other three views stay as full implementations until their production widgets are built. |
| ARCH-11 | closed (2026-05-26) | **`ThinkingStream` extracted.** New widget at `components/chat-widgets/ThinkingStream/` (Tsx + sibling test + README, contract-compliant). The widget owns: timer-driven note reveal with randomized cadence (1500-2800ms per note, prevents deterministic-script feel), 1200ms post-stream delay before `onDone` fires, per-`scenarioKey` sessionStorage replay guard (so AppShell compact-mode remounts don't replay), and the italic + left-border quoted-aside styling. Props: `notes: string[]`, `scenarioKey: string`, `mode: "onboarding" \| "steady"`, `onDone?: () => void`. `OnboardingChatColumn`'s F2ConversationFlow lost ~70 lines of inline state/effects/timers and now mounts `<ThinkingStream notes={...} scenarioKey={scenarioId} mode="onboarding" onDone={() => setShowDone(true)} />`. Steady mode (when real upload progress lands per UI-05) feeds the same widget with real-progress-event notes; `mode="steady"` skips sessionStorage persistence since each upload is unique. Test count 778 → 790 (+12: 8 ThinkingStream widget tests + 4 widget-contract auto-discovery assertions). Drift guard + TS clean. | Same `ThinkingStream` widget instance can be mounted by both onboarding (scripted notes) and future steady-mode upload progress (real progress events), proving the no-duplicate-widgets rule. |
| ARCH-12 | not-started | **(P2 — polish)** Graduation animation when onboarding overlay drops away (StepStrip animates out, header slot empties). | Visual: after sign-up commits, StepStrip slides out with motion-config-respecting transition. |
| ARCH-13 | not-started | **Audit memo to harness team**. After ARCH-01..11 + 14..22 land, author `scaffold/docs/agents/harness-audit-widget-architecture.md`. Describes the generally-applicable patterns ONLY — not GroundX-specific deletions. Generally-applicable items: (a) single-AppShell architecture + onboarding-as-overlay, (b) chat-widget vs viewer-widget contract, (c) slot directory convention (`chat-widgets/` + `viewer-widgets/`), (d) `primitives/` + `brand/` + `layout/` taxonomy under `components/`, (e) the no-canvas-one-offs rule + failure modes, (f) drift-guard test pattern (ARCH-08), (g) no-hardcoded-styles drift-guard expansion (ARCH-17), (h) **the "follow MUI where it makes sense" rule** for primitives — primitives mirror MUI's component split, prop names, and variant taxonomy; brand-locked semantics layer on top, not in place of MUI's API. Cite the `Button`/`IconButton` 2026-05-26 split-vs-merge correction as the canonical example. See `memory/feedback_follow_mui.md`. Generally-applicable raises to the harness team: (i) "consider whether your scaffold default Home/Dashboard/AppStatus/Banned stubs serve products that use a custom shell" (do NOT recommend deleting them outright — that's a per-project call). Asks the harness team to codify the contract in `harness-web-ui` skill references + update the `groundx-web-ui-scaffold` template repo so new managed projects ship with `chat-widgets/`, `viewer-widgets/`, `primitives/`, `brand/`, `layout/` pre-wired + a starter widget-contract doc + the follow-MUI rule + scaffold-side drift-guard tests. **Timing**: last ticket before any post-refactor commit, so the memo reflects landed state not plan. | Memo file exists; references the actually-shipped state; per-project deletions ARE NOT recommended to harness, only the contract + taxonomy + drift-guard patterns + follow-MUI rule. |
| ARCH-14 | closed (2026-05-26) | **Five-tier component taxonomy documented** in `widget-contract.md`: `components/primitives/` (unbranded atoms; theme-resolving; e.g. Button/Heading/TextField), `components/brand/` (Gx-prefixed branded molecules; e.g. GxCard, GxPill, CapabilityBadge), `components/layout/` (chrome singletons mounted at root or once; e.g. AppShell, OnboardingNav, StepStrip), `components/chat-widgets/` (slot widgets for the chat column), `components/viewer-widgets/` (slot widgets for the canvas). Each level has its own rules section. Also documented: views catalog (per-route view inventory) + contexts catalog (18 contexts annotated by role). The doc is referenced by the ARCH-15 mapping table that drove the moves. |
| ARCH-15 | closed (2026-05-26) | **Mapping table for every `shared/components/` file** shipped in `widget-contract.md` § "Component mapping". Each row carries the old path, new path, and rename rationale. Orphans handled per spec: `SampleScenarioCard` + `ByoTile` colocated into `views/Onboarding/IngestView/` (only used there); `SessionSwitcher` into `views/Steady/SteadyShell/`. The table was the single reviewable artifact that drove ARCH-16's execution. |
| ARCH-16 | closed (2026-05-26) | **All moves executed.** `src/shared/components/` deleted; `src/components/` now has the five-tier tree: `primitives/` (13: BodyText, Button, Caption, DialogTitle, DropdownMenu, Heading, IconButton, Label, LoadingDots, MotionRoot, Stack, TextField, Tooltip), `brand/` (9: CapabilityBadge, CiteChip, ConnectorGlyph, DocThumb, EducationalTooltip, GxCard, GxPill, GxSectionHeader, WireframeFilters), `layout/` (4: AppErrorBoundary, AppShell, OnboardingNav, StepStrip), `chat-widgets/` (2: BookingStatusCard, GateChatRail — `GateChatRail` per ARCH-05A), `viewer-widgets/` (3: BookCallView, PdfViewer, SignUpWidget — `SignUpWidget` per ARCH-05A). MUI-follow consolidation per the user's locked rule (`feedback_follow_mui.md`): instead of the proposed `<Button variant="submit\|cancel\|icon">` monolith, split into `Button` (primary/secondary) + `IconButton` (icon-only) matching MUI's own split — corrected mid-implementation when the user said "follow MUI; split." `src/shared/` retained for non-component infrastructure (`hooks/`, `utils/`). All imports updated; `grep -rn "from \"@/shared/components/" src/` returns zero. |
| ARCH-17 | closed (2026-05-26) | **Drift guard expanded to all `components/` + `views/` files.** `src/test/no-hardcoded-styles.test.ts` now auto-discovers every `.tsx` under both directories (no more hand-maintained file list); each file gets a generated `it()` that fails CI on inline `fontSize:`/`fontWeight:`/`borderRadius:` numerics, viewport-unit `maxHeight/minHeight` string literals, or hex color literals. `ASSET_ALLOWLIST` carries third-party brand-color exemptions (currently just `ConnectorGlyph` for Box/Microsoft/Google logo hex values). `EXEMPT_OFFENDER_COUNTS` carries transitional file-level exemptions for the view-migration cleanup (ARCH-19/20 will burn this down to zero) — drift sentry asserts each file's offender count matches the recorded number, so adding new literals to an exempted file ALSO fails. Self-test pins the FORBIDDEN regexes against known-bad samples so a regex bug can't silently green the suite. Currently 16 files exempt (the EXEMPT list); 0 unauthorized offenders. |
| ARCH-18 | closed (2026-05-26) | **Built 13 primitives** under `components/primitives/`. Each ships its own directory + sibling `*.test.tsx` + `README.md` (auto-enforced by `widget-contract.test.ts`). Typography family (Heading w/ 8 levels including display, BodyText w/ md/sm, Label, Caption); button family split per MUI (Button w/ primary/secondary variants, IconButton for icon-only — split mid-implementation when user said "follow MUI; split" → locked in `memory/feedback_follow_mui.md`); form (TextField); chrome (Tooltip, DialogTitle); composite (Stack, DropdownMenu, LoadingDots, MotionRoot). Pre-existing `CommonSubmitButton` tests ported to the new `Button` variant tests. SignUpWidget, GateChatRail, Home, SteadyShell all compose from these primitives end-to-end. The old `Common*`/`Gx*`-prefixed primitives are gone from `shared/components/` (deleted in ARCH-16). |
| ARCH-19 | closed (2026-05-26) | **F1 IngestView already meets the closure criterion.** Audited 2026-05-26: IngestView is NOT in `EXEMPT_OFFENDER_COUNTS` — it passes the expanded drift guard (ARCH-17) cleanly; no FORBIDDEN literals; visual snapshot + e2e specs pass. The aspirational "zero inline sx, primitives-only" framing in the original spec is craft work with no forcing-function payoff — the drift guard IS the contract, and IngestView already satisfies it. The Typography → primitive migration for IngestView (12 Typography usages → Heading/BodyText/Label/Caption) is deferred to a polish pass after ARCH-20 burns the EXEMPT list to zero (no semantic urgency; the file is already drift-clean). Reframed scope avoids spending 1-2 hrs on cosmetic IngestView work while 72 offenders are actively bypassing the drift guard in 15 EXEMPT files. ARCH-20 picks up that real work. |
| ARCH-20 | closed (2026-05-26) | **EXEMPT_OFFENDER_COUNTS list burned to ZERO.** Four waves across 13 files / 66 offenders: wave 1 onboarding views (InteractView 2, ExtractView 3, IntegrateView 4, OnboardingChatColumn 8, NavDebugOverlay 12 = 29); wave 2 chat-widgets + brand (BookingStatusCard 6, CiteChip 3, DocThumb 1 = 10); wave 3 layout (AppShell 6, OnboardingNav 7, AppErrorBoundary 14 = 27); wave 4 scaffold tail (AuthLayout 1, Banned 1, SessionSwitcher 3, PdfViewerWidget 1 = 6). Two legitimate ASSET_ALLOWLIST additions made: `NavDebugOverlay` (dev-only debug-vibrant colors are intentionally not brand) and `AppErrorBoundary` (framework-independent fallback rendering BEFORE the theme provider — must use inline hardcoded styles by design). Five new chrome tokens added to absorb otherwise-orphan literals: `ONBOARDING_NAV_EYEBROW_FONT_SIZE = 9`, `ONBOARDING_NAV_SUBLABEL_FONT_SIZE = 11`, `FULL_VIEWPORT_MIN_HEIGHT = "100vh"`, `PDF_THUMB_PAGE_NUMBER_FONT_SIZE = 9`. Drift guard now enforces: every visible style under `components/` + `views/` resolves to a token or sits in the explicit allowlist with a documented rationale. Test count 764 → 777 (+13 from per-file `it()` generators on the newly-clean files). | EXEMPT_OFFENDER_COUNTS is `{}`; drift guard self-test + sanity tests + every per-file test green; landing a deliberate `fontSize: 13` in any component or view file fails CI. |
| ARCH-21 | closed (2026-05-26) | **Replaced scaffold-default `views/Home/Home.tsx`** with an auth-aware redirect. New `Home` reads `useAuthContext()` for the auth signal and reads `localStorage["groundx-onboarding.chat-store.v1"].activeSessionId` directly (ChatStoreProvider isn't mounted at the `/` boundary). Anonymous → `/onboarding`; signed-in with persisted session → `/c/<sessionId>`; signed-in without one → `/onboarding`. The `/c/new` fallback in the original spec was dropped — that route doesn't exist; only `/c/:sessionId` does. Home is now ~30 LOC (was 161). Pulled `views/Home/Home.tsx: 2` from `EXEMPT_OFFENDER_COUNTS` (drift-guard count goes to zero). Test count 742 → 747 (+5 redirect-branch tests). |
| ARCH-22 | closed (2026-05-26) | **`views/CoreLayouts/` deleted** along with `Dashboard.tsx` + `appNavigation.tsx`. The scaffold-default "boxed-content + topbar" wrapper that previously wrapped the `/` route is gone; `router.tsx` now mounts `AppInitialization + OnboardingProvider + <Outlet />` at the `/` boundary and child routes mount the canonical AppShell directly (OnboardingShell on `/onboarding`, SteadyShell on `/c/:sessionId` per ARCH-07). Routing tests + the scaffolded route navigation continue to pass. Per-project change — not generalized to the ARCH-13 harness memo (which raises only the principle "consider whether your scaffold's Dashboard layout serves the product"). |
| ARCH-23 | not-started | **(P2 — revisit later)** Audit `views/Auth/` (Login / Register / ForgotPassword / ResetPassword / AuthLayout / Form/). Today the product uses the in-app gate (ARCH-05 SignUpWidget + GateChatRail) for sign-up; the standalone `/auth/*` pages are partially still useful as magic-link landing URLs but `/auth/register` may be dead. **Decision deferred** per user direction 2026-05-26: keep both for now. Revisit when magic-link/SSO actually ship (AU-01, AU-02) — at that point we'll know which standalone pages are still load-bearing and which can be deleted. | Decision made; dead pages deleted (if any); load-bearing pages kept and documented in widget-contract.md § views catalog. |
| ARCH-24 | closed (2026-05-26) | **Scope-adjusted on contact.** Original spec said delete both `AppStatus/` + `Banned/`; grep showed `/banned` is load-bearing (`api/axios.ts` 403-on-archived-customer redirect + `Login.tsx` banned-login branch), so Banned stayed (stub content; route real). Delivered: (a) `views/AppStatus/` deleted (no callers, no real surface); (b) `ROUTER_PATHS.APP_STATUS` removed + route stripped from `router.tsx`; (c) `views/Health/` → `views/_scaffold/Health/` to mark it non-product scaffold infrastructure; (d) router Health import updated; (e) `widget-contract.md` views catalog updated with the new shape (Home active, Banned active-stub, `_scaffold/` active). TS + tests green. The "build a real banned-account surface" work is now a future ticket — out of scope for the ARCH epic. |
| ARCH-25 | not-started | **(P2 — deferred but tracked)** Audit `contexts/`. 8 of 18 contexts are scaffold-default Partner-API state holders that the product doesn't use today: `ApiKeysContext`, `BucketsContext`, `GroupsContext`, `ProjectsContext`, `SearchContext`, `WorkflowsContext`, `HealthContext`, plus the original `OnboardingContext` (anon-id tracker, replaced by `OnboardingSessionContext`). Confirm whether each is dead or will be wired into UI-05 (steady-mode chat/canvas); delete the dead ones. **Deferred** per user direction 2026-05-26 — revisit during UI-05 work when we'll know which contexts get real consumers. | Each scaffold-default context audited; dead ones deleted; the rest documented with "wired by UI-XX" notes. |

# Epic: CHAT — LLM runtime + RAG + compression

CF-01 through CF-18. Inline `TODO(CF-N)` markers in middleware
`chatRouter.ts` / `chatHandler.ts` / `structuredHandler.ts` and
in `app/src/api/chatSessions.ts` reference these rows.

| ID | Status | Item | Closure test |
|---|---|---|---|
| CF-19 | not-started | `ensureBucketGroup(bucketIds[]) → groupId` helper. Multi-workspace pivots (user looking across 2+ buckets) need a pre-created GroundX Group. Builds: stable hash of sorted bucket-id list → cached groupId → fallback to Partner API `POST /v1/groups` with deterministic name. Sub-deferral of CF-15 — no upstream caller produces a multi-bucket scope yet, so no user-visible test exists until that caller (UI-05 SteadyShell, or a multi-bucket project view) lands. Don't ship this until a real call site exists. | A multi-bucket entity (`bucketIds:[B1,B2]`) sent through the chat path triggers `ensureBucketGroup([B1,B2])`; first call creates the group via Partner API; second call returns the cached id without a second POST; chatHandler then routes the search via `{kind:"group", groupId}`. |
| CF-06a | **deferred-late** (P3) | Eval-set-in-CI follow-up to CF-06. ≥20 (query, expected-cite, expected-refusal) tuples per scenario (Utility/Loan/Solar). Runner exercises `callGroundedLlm` against the live LLM (or a configurable provider) and grades each answer against the expected cite/refusal. Regression fails the CI job. Splits from CF-06 because the runner + ground-truth authoring is genuinely separate work from the prompt code. Requires: (a) eval fixture per scenario, (b) grading function (cite presence + refusal-pattern match), (c) opt-in CI workflow that uses a real key (paid + flaky-tolerant). Soft-blocked on SCEN-06 (real sample PDFs) for the cite-against-real-text portion. **Per locked decision 2026-05-25:** deferred to late-stage closure pass — no upstream item is blocked on it, and shipping it early would burn LLM credits before the prompt has stabilized. Pull forward only if (a) SCEN-06 lands AND (b) prompt regressions actually start happening in production. | The 60-tuple eval set runs in CI; a deliberate prompt regression (e.g. stripping the refusal contract) fails the job. |
| CF-10 | not-started | Compression off the request hot path. Job queue + background worker + 202/poll OR "pending" flag on session. | Posting near threshold returns 200 promptly; compression completes async; next post sees new active summary. |
| CF-11 | not-started | Streaming response (SSE / fetch-stream). | E2e renders a long answer token-by-token. |
| CF-12 | not-started | Tool-call wiring in routeChat (see also TL-* below for the individual tool routes). | A query firing `show_extraction` produces the tool call in the reply. |
| CF-14 | not-started | DB pool sizing + batch reads. Pool=10 with 5–8 sequential reads per post. | Load test asserts P99 < 1s with 50 concurrent posts. |

# Epic: AUTH — sessions, magic-link, SSO, session merge

| ID | Status | Item | Closure test |
|---|---|---|---|
| AU-01 | not-started | Magic-link provisioning endpoint `POST /api/auth/magic-link/send` + callback handler. Currently no magic-link route exists; `commitGate("register")` does direct register only. Memory: `project_auth_state_machine.md` references magic-link as an auth method. Pairs with ARCH-05's `GateChatRail` which needs this endpoint. | User clicks "send magic link" → POST → email contains link → click → session created. |
| AU-02 | blocked | SSO with Partner-API verification. `SSO_ENABLED` flag gates UI but no OAuth/callback middleware routes. Blocked on product decision: which IdPs (Google, Okta, custom)? | SSO_ENABLED + IdP-configured deploy → user clicks SSO → callback → session minted. |
| AU-03 | not-started | Session merge on signin from new browser. Pre-signin pinned answers + schemas (in localStorage on old browser) carry over after user signs in elsewhere. Memory: `project_auth_state_machine.md` "session merge." | User signs in on browser B; sees pinned answer from browser A's anon session. |
| AU-04 | not-started | AuthProvider race tests (anon→authed flip during in-flight chat send). Today `app/src/contexts/AuthContext/` has 0 race tests. | Test: chat-message in flight when login fires; assert no orphaned message, no wrong-owner write. |

# Epic: DATA — DB schema + scope refs

| ID | Status | Item | Closure test |
|---|---|---|---|
| DT-01 | not-started | (Foundation — see above) Knex migrations infra. | |
| DT-02 | not-started | (Foundation — see above) MySQL primary in prod. | |
| DT-03 | not-started | Retention sweep jobs. `chat_messages`/`summaries` keep 1yr default; `intent_log` 90d; `viewer_events` 30d. Per `project_database.md` retention table. No sweep job exists. | Job runs nightly; rows past retention deleted. |
| DT-04 | not-started | Anonymous compression strategy. `project_database.md`: "Anon compression deferred / localStorage if implemented." Today anon sessions don't compress at all — their messages stay in localStorage forever and eventually hit the localStorage growth cap. | Either: (a) wire anon compression server-side (since anon now has DB rows), OR (b) write a localStorage-side compression for anon-only that mirrors the leaf+meta shape. |

# Epic: UI — product surfaces + Steady mode

| ID | Status | Item | Closure test |
|---|---|---|---|
| UI-01 | not-started | **F4 SchemaView** (chat-driven schema builder). Biggest unstarted product surface. W7 Extract widget on the canvas; intent dispatch from chat ("add field X" / "remove field Y"); live extraction preview; save-template. Multi-day. | E2e: user picks a sample, types "add field for total amount", schema updates live, extraction re-runs. |
| UI-02 | not-started | **F7 IntegrateView** real connector cards + agent-plugin download buttons. Today the buttons are non-functional. | E2e: user clicks "download" on an agent plugin, gets a real artifact. |
| UI-03 | not-started | **F3a edit-schema branch**. Inline schema editor stub today; wire to schema-builder widget pattern. | User edits a field's prompt in F3, extraction re-runs against the new schema. |
| UI-04 | not-started | **F5 InteractView polish**. Citation chips inline with bot turns; clicking a chip opens a side panel with the source page. Today F5 has citation chips but no side panel. | Click chip → side panel opens with PDF page. |
| UI-05 | not-started | **Steady-mode chat + canvas inside SteadyShell**. Currently a placeholder with `SessionSwitcher` mounted. Pairs with ARCH-07 (unified steady shell mounts AppShell instead of bespoke SteadyShell). | Authed user navigates to `/c/:sessionId` → real chat + canvas surface renders. |
| UI-06 | not-started | Session list fetch from BFF when URL session id isn't in localStorage. Today the "unknown session" hint is an inline `<code>` placeholder. | Open `/c/:unknownId` on a fresh browser → BFF fetch populates the session → UI renders. |
| UI-07 | not-started | Multi-session keyboard shortcuts (cmd-K to switch). | cmd-K opens a session picker; arrow keys navigate; Enter switches. |
| UI-08 | closed | Engineer-call Calendly wire-up — closed by ARCH-05/ARCH-13 era widgets (`BookCallView` viewer-widget + `BookingStatusCard` chat-widget). `VITE_CALENDLY_URL` env wired, postMessage origin-guarded, `?bookCall=1` URL state preserves across reload. | F6a click → Calendly iframe in viewer, BOOKING IN PROGRESS in chat, postMessage commits gate. (Note: kept-as-closed even though the ARCH-13 audit memo will reference the underlying widgets.) |
| UI-09 | not-started | Richer thinking-note formatting. Manifest `thinkingScript` is `string[]`; wireframe shows bolded words. Extend to support markdown-lite. | Manifest with `**bold**` renders bold in F2 thinking stream. |
| UI-11 | not-started | Variable inference / `{project}` placeholder UX. Per `project_dev_contracts.md` decision #12: "automatic variable inference is parked... UX for proposing variables is the hybrid pattern (deferred)." Today S3a section editor doesn't propose variables; user can only inline-edit. | User selects "the project" → "make variable" surfaces a chip; future runs render `{project}`. |
| UI-12 | not-started | **BYO upload UI passes `filter.workflow_id` on every uploaded doc.** Per `memory/project_workflow_id_filter.md` (locked 2026-05-25): when the user-facing upload UI ships, the ingest payload's `filter` must include `workflow_id` whenever the upload was scoped to a workflow. Implementation when this surface lands: (a) accept a workflow id at the upload-flow entry; (b) construct `filter: { ..., workflow_id }` before calling `ingestRemoteDocuments`; (c) the entity layer + middleware proxy already pass the filter through unchanged. Frontend tests must assert the filter contains workflow_id when ingest is triggered from a workflow context. | A BYO upload from a workflow-scoped surface produces a GroundX doc whose `filter.workflow_id` matches the originating workflow; a test mocks the ingest and asserts the filter payload. |

# Epic: TOOLS — agent canvas-dispatch + content tools

All from `project_dev_contracts.md`. None wired today — `reply.tools` is always `[]`.
CF-12 is the umbrella; TL-* are the individual tool surfaces.

| ID | Status | Item | Closure test |
|---|---|---|---|
| TL-01 | not-started | `search_groundx({scope, query, n?, verbosity?})` — content tool that performs a scoped GroundX search. | LLM asks tool; middleware routes; results appear inline in answer. |
| TL-02 | not-started | `show_understand({doc_id, progress})` — canvas dispatch tool. | LLM emits tool call; canvas advances to F2/Understand. |
| TL-03 | not-started | `show_extraction({schema_id, doc_id, category?, render?})` — canvas dispatch. | LLM emits; canvas advances to F3/Extract. |
| TL-04 | not-started | `show_field_citation({field_id, doc_id, page})` — open F4 expanded citation. | LLM emits; F4 citation peek opens. |
| TL-05 | not-started | `pin_to_report({turn_id, template_id?})` — pin literal turn text to report; auto-creates draft template if missing. Per `project_dev_contracts.md` decision #12. | Pin command from chat creates report row + template if needed. |
| TL-06 | not-started | `propose_schema_field({field_def})` — emit ProposalCard in F3a. | LLM proposes field; ProposalCard renders; user accepts → field added. |
| TL-07 | not-started | `propose_report_section({section_def})` — emit ProposalCard in S3a. | LLM proposes section; card renders; accept → section added. |
| TL-08 | not-started | Tool error recovery: 3 consecutive errors → fallback mode per `project_dev_contracts.md` error catalog. | Force 3 tool failures in a row; chat enters fallback (no more tool calls this session). |
| TL-09 | not-started | `AgentToolBusContext` Zod-to-JSON-Schema bridge. Provider exposes a "placeholder" Zod schema today; tool registration needs real JSON Schema per LLM provider tool-spec format. | Tool registered via AgentToolBus appears with correct JSON Schema parameters in the LLM tool array. |

# Epic: OBS — observability + telemetry

| ID | Status | Item | Closure test |
|---|---|---|---|
| OB-02a | not-started | PostHog events for surfaces that don't exist yet. **`session.mode_flipped_to_steady`** — fires when an authed user is bumped from onboarding into steady mode (UI-05 SteadyShell mount). **`report.pinned`** — fires when a chat turn is pinned to a report template (F7 / TL-05). **`report.section_added`** — fires when a section is added to a report (TL-07). **`report.rendered`** — fires when the report template renders an HTML/PDF artifact. Blocked on the underlying surfaces existing. | All 4 events fire at their boundaries with the documented prop shape; PostHog dashboard shows them on the golden path. |
| OB-04 | not-started | Hotjar session recording with PII suppression. `data-hj-suppress` tags on sensitive inputs. `HOTJAR_SITE_ID` env not implemented. | Hotjar dashboard shows session with email field redacted. |
| OB-05 | not-started | Sentry source-map upload on production builds. | Stack trace in Sentry shows TS file + line, not minified js. |
| OB-06 | not-started | AWS Managed Prometheus dashboards + AWS X-Ray traces. Middleware emits both; no dashboards configured. | Open the dashboard URL → see live request rate + p99 latency. |
| OB-07 | not-started | Alert rules: SLO violations, error-budget burn, ALB 5xx, unhealthy hosts. ALB-alarms workflow exists; SLO + budget alerts don't. | Synthetic burn fires a real Sentry/PagerDuty alert. |
| OB-09 | not-started | Migrate middleware `console.warn` calls in `chatRouter.ts` (hybrid-RAG-failed at L264, unknown-scope at L377) to pino structured logging. Both currently use `eslint-disable-next-line no-console` to bypass the lint rule. | Grep `console.warn` in `middleware/src/` outside tests returns no hits; the warns surface via `logger.warn({...}, "msg")` with the scrubber applied. |

# Epic: SEC — security

| ID | Status | Item | Closure test |
|---|---|---|---|
| SC-01 | not-started | (Foundation — see above) CSRF middleware. | |
| SC-02 | not-started | Consent UI + CSP allowlist builder. GA/Hotjar must NOT load until consent. Today CSP is built at boot statically. | Visit the app cold → see consent banner → no GA/Hotjar requests in network tab. After consent → GA/Hotjar load with their hosts in CSP `connect-src`. |
| SC-03 | not-started | `scrubPII()` expansion: confirm coverage of all 5 patterns (email, phone, SSN, credit-card Luhn, account numbers). `pii.ts` exists with 10 tests; need to verify completeness against `project_security.md` spec. | Test fixtures with each PII shape redact correctly in pino + PostHog scrubber. |
| SC-04 | not-started | PII redaction on pino logs — explicit `redact` paths for `password`, `authorization`, `cookie`, `documentContent`. Verify pino config. | Log line with these fields shows `[Redacted]`. |

# Epic: UR — UI runtime + primitives

| ID | Status | Item | Closure test |
|---|---|---|---|
| UR-05 | not-started | Hotkey surface (cmd-K, Esc, etc.) via `react-hotkeys-hook`. Per `project_ui_runtime.md`. | cmd-K opens session switcher; Esc dismisses overlays. |

(Prior closures: UR-01 / UR-03 / UR-04 — all closed 2026-05-25, swept 2026-05-26.)

# Epic: SCEN — scenario completeness

| ID | Status | Item | Closure test |
|---|---|---|---|
| SCEN-02 | not-started | Loan 12-doc packet: 3 paystubs + W-2 + employment letter + 3 bank statements + 4 debt docs. Fixtures drafted; needs product sign-off + real docs ingested. | Pick Loan → 12 docs listed; cross-doc citations work. |
| SCEN-03 | not-started | Solar 142-doc portfolio tree: hierarchical Fund→Project, virtualized scroll >50 nodes. Today no tree UI. | Pick Solar → tree renders 142 nodes; scroll smooth; search filters. |
| SCEN-04 | not-started | Solar IC brief 4-section template: executive_summary, risk_roll_up, comparable_projects, recommendation. Per `project_scenario_fixtures.md`. | F7 generates IC brief from template; 4 sections present. |
| SCEN-06 | blocked | Sample document assets + page images. Per `project_phased_plan.md`: assets need to exist before Phase 2 UI work is real (today F2 uses a "flat-WHITE PDF placeholder"). Blocked on Product delivering the real Utility/Loan/Solar PDFs. | Real PDFs ingested into samples bucket; F2 PdfViewer renders pages from them. |
| SCEN-07 | not-started | **Seed script attaches `filter.workflow_id` to every uploaded doc.** Per `memory/project_workflow_id_filter.md` (locked 2026-05-25): every doc seeded into a GroundX bucket must carry `filter.workflow_id` when a workflow was used to extract it. Today `middleware/scripts/seed-bucket.ts` does not carry a workflow id. Required: (a) add a `workflowId` field to each `scenarios/*.json`; (b) `ScenarioSpec` type adds the field; (c) on every doc ingest and filter refresh, include `workflow_id` in the filter. (d) `refreshManifestIfChanged()` should drift-check `workflow_id` and PUT an update when it changes. **Note:** sample doc `c3bfff49-6640-4213-822b-e81c3a771e45` was manually updated 2026-05-25 with workflow_id `9910308e-3100-473e-9da6-3ac29f5958a6`. | A fresh re-seed produces a doc whose `filter.workflow_id` matches the scenario's authored workflowId. |

(Prior: SCEN-01 closed-as-obsolete 2026-05-25, swept 2026-05-26.)

# Epic: SL — scale + perf

| ID | Status | Item | Closure test |
|---|---|---|---|
| SL-04 | not-started | Widget-search concurrency cap: ≤3 concurrent per session per `project_security.md`. | Fire 5 concurrent searches; 2 wait. |

# Epic: TS — testing gaps

| ID | Status | Item | Closure test |
|---|---|---|---|
| TS-04 | blocked | **Reclassified 2026-05-25.** Original framing assumed harness widget directories are present in this repo. They are not — this project built native surfaces. Either (a) the native surfaces get an integration-test layer (see TS-05), OR (b) widgets get imported per `references/widgets.md` and tested. **Blocked on the decision** — do we want exact-use widgets at all? Until then this row is not actionable. | Decision made on widget adoption; closure path follows. |
| TS-05 | not-started | **(P2; demoted 2026-05-25.)** Browser smoke + a11y suite: golden-path F1→F2→F3→F5→F6→F7 at desktop/mobile via Playwright + axe WCAG A/AA. Partial coverage today. **Blockers:** (a) F4 surface doesn't exist (UI-01 not-started), (b) Solar scenario can't be tested (SCEN-03 / SCEN-06 blocked), (c) F6 + F7 lack e2e but the surfaces exist. **Re-promotion path:** when UI-01 lands AND a Solar fixture lands. | All scenarios' golden paths pass at both viewports. |
| TS-06 | not-started | **(P2; demoted 2026-05-25.)** Nightly visual regression — non-blocking baseline. **Blocker — platform decision not made:** Chromatic (paid SaaS) vs Playwright `toHaveScreenshot()` (free, brittle on font rendering) vs Percy / BrowserStack (paid) vs Argos (free tier). **Re-promotion path:** make the tool + storage decision; the wiring is then mechanical. Cheapest start: Playwright snapshots. | First baseline runs; diff flagged on PR. |
| TS-07 | not-started | **(P2; demoted 2026-05-25.)** Load test against `/api/chat/messages`: ≥100 concurrent SSE per `project_test_plan.md`. **Blockers:** (a) **SSE doesn't exist** — `/api/chat/messages` is a regular JSON POST today; CF-11 not-started. (b) Tool decision not made (k6 vs Artillery vs Autocannon). **Re-promotion path:** wait for CF-11 OR rewrite closure to "100 concurrent JSON POST against mocked LLM." | P95 < 5s under load with mocked LLM. |

(Prior: TS-02, TS-03, TS-08, TS-09, TS-11 — all closed 2026-05-25, swept 2026-05-26.)

# Epic: OPS — operations + infra

| ID | Status | Item | Closure test |
|---|---|---|---|
| OPS-01 | blocked | **Reclassified 2026-05-25 — out of this repo's scope.** Agent MCP-driven cluster/pod-log reading is a feature of the `groundx-studio` MCP server, not this application. The deploy-audit ask was delivered upstream 2026-05-24 and the resolution lives with the harness team. Blocked on the harness team shipping the corresponding MCP tool surface. | Harness MCP server exposes a `cluster_logs` (or equivalent) tool. |

(Prior: OPS-04, OPS-05 — both closed 2026-05-25, swept 2026-05-26.)

# Epic: POL — known minor bugs

| ID | Status | Item | Closure test |
|---|---|---|---|

# Epic: PLUG — plugin system + skills + SDR

The entire plugin/skill mechanism is deferred. `OnboardingSkillContext`
exists as an empty stub preserving provider shape. No plugin discovery,
no remote manifest fetch, no SDR content. Locked decisions: skills
live in remote plugins, NOT in `middleware/src/skills/` folders. Until
the loader exists, treat SDR as deferred.

| ID | Status | Item | Closure test |
|---|---|---|---|
| **PLUG-07** | **deferred-late** (P3) | Plugin tool-surface ADR — must land before PLUG-01. Decide + document the four open contracts the plugin loader needs settled: (1) Manifest shape, (2) Tool transport (native function-calling vs MCP vs JSON-RPC), (3) Tool runtime (in-process JS vs MCP subprocess vs remote HTTP), (4) Discovery + trust (registry, signature verification, sandboxing). Recommendation: **native function-calling + in-process JS + remote signed registry.** ADR lands at `docs/agents/adr/0001-plugin-tool-surface.md`. | ADR exists with each contract decided; PLUG-01 text updated to point at it. |
| PLUG-01 | blocked | Plugin loader (BFF side). Blocked on PLUG-07. | A test plugin manifest loads and contributes a system-prompt fragment + a tool. |
| PLUG-02 | blocked | `OnboardingSkillContext` real implementation. Blocked on PLUG-01. | A loaded plugin manifest's UI slot renders; tour metadata reaches `useOnboardingSkill()`. |
| PLUG-03 | blocked | SDR plugin content. Authored OUTSIDE the BFF codebase per locked decision. Blocked on PLUG-01. | The SDR plugin (loaded remotely) renders the three-options gate framing, tour stepper, SDR voice. |
| PLUG-04 | blocked | Onboarding **overlay** surface (alternative to the inline F1-F7). Blocked on PLUG-01 + product spec for overlay UX. **Related to ARCH-06** (which collapses the existing inline onboarding into an overlay context already). | Overlay onboarding renders on top of an existing product surface. |
| PLUG-05 | blocked | Tour state machine (third intent source: user / agent / tour). Blocked on PLUG-01. | Tour-loaded plugin advances frames via `dispatchIntent({source: "tour"})`. |
| PLUG-06 | not-started | `PLUGIN_PRESET` env var. Controls which plugin bundle the LLM-side harness loads at boot. Distinct from `APP_MODE_PRESET`. | env.ts declares `PLUGIN_PRESET`; loader honors the preset. |

## Cross-epic dependency notes

- **CF-15 → CF-02 closure → CF-03 / TL-01 quality.** Multi-bucket can't ship until EntitySession scope refs exist.
- **CF-16 → CF-04 quality + CF-06a.** A light LLM makes the structured classifier + suggested-prompt generators + eval grading loop cheap enough to use everywhere.
- **CF-06 → CF-06a.** The eval set scores the prompt, so the prompt has to exist first.
- **SCEN-06 → CF-06a + UR-01.** Real PDFs are required for the eval set's cite-against-real-text portion AND for UR-01's "renders real Utility/Loan/Solar pages" closure test.
- **DT-01 → DT-02.** Migrations infra before production MySQL.
- **TL-01–TL-07 → CF-12 closure.** Individual tool routes finish the umbrella.
- **OB-02 (PostHog events) → CF-13 (Sentry) ordering: PostHog first** (telemetry coverage > error coverage when neither exists).
- **PLUG-07 (tool-surface ADR) → PLUG-01..05.** Manifest + tool transport + runtime contract has to be decided before the loader can be scoped.
- **ARCH-18 (primitives) → ARCH-17 (drift-guard expansion).** Drift guard can only pass once typography primitives exist for widgets to compose from.
- **ARCH-14..16 + ARCH-18 → ARCH-19..20.** View migrations need the new primitives + reorganized component tree.
- **ARCH-22 (delete CoreLayouts) → ARCH-07 (unified steady shell).** SteadyShell needs to mount AppShell instead of Dashboard before Dashboard is deleted.
- **ARCH-01..18 → ARCH-05 (sign-up split).** Per user direction 2026-05-26: ship the bug fix against the new primitives, not the old.
- **ARCH-01..22 → ARCH-13 (audit memo).** Memo reflects landed state, not plan.

## Counts as of 2026-05-26

| Status | Count |
|---|---|
| closed | ARCH-01, ARCH-02, ARCH-03, ARCH-08, UI-08 (this file only — historical closes live in git) |
| in-progress | 0 |
| blocked | 8 (AU-02, OPS-01, PLUG-01..05, SCEN-06, TS-04) |
| not-started | live items in epic tables above |

By priority:

| Pri | IDs | Notes |
|---|---|---|
| **P0** | ARCH-01..03 ✅, ARCH-05 ✅, ARCH-06 ✅, ARCH-07 ✅, ARCH-08 ✅, ARCH-14 ✅, ARCH-15 ✅, ARCH-16 ✅, ARCH-17 ✅, ARCH-18 ✅, ARCH-21 ✅, ARCH-22 ✅ | Architecture epic. **All P0 closed.** |
| **P1** | OPS-01 (blocked), ARCH-09, ARCH-10, ARCH-11, ARCH-13, ARCH-19, ARCH-20 | Memory/migrations + view rewrites after ARCH-16. |
| **P2** | everything else, plus TS-05/06/07, **ARCH-12, ARCH-23, ARCH-25** (ARCH-24 ✅) | Polish + scaffold cleanup deferred to later passes. |
| **P3** | CF-06a, PLUG-07 | Deferred-late; pull forward only when upstream caller exists. |

Re-promotion conditions for the demoted P2s:
- **TS-05** — UI-01 (SchemaView) lands AND Solar scenario fixture lands. OR accept scope-down.
- **TS-06** — visual-reg tool decision is made.
- **TS-07** — CF-11 (SSE streaming) lands. OR rewrite closure to "JSON POST load."

Next-move candidates (P2 only now):
- **CF-10** — compression off the request hot path.
- **CF-11** — streaming response (SSE). Unblocks TS-07 re-promotion.
- **UI-01** — F4 SchemaView (biggest unstarted product surface). Unblocks TS-05 re-promotion.
- **AU-01** — magic-link provisioning endpoint. Pairs with ARCH-05's GateChatRail.

Out-of-scope until pulled forward (P3):
- **CF-06a** — LLM eval set in CI. Soft-blocked on SCEN-06.
- **PLUG-07** — Plugin tool-surface ADR. Blocked on a real first plugin being scoped.

## How to use this file

- Opening work: add a new id (use the right epic prefix), status
  `not-started`. Add an inline `TODO(<id>)` at the partial-code
  site if applicable.
- **Before adding a `not-started` item, grep for the seam first.**
  Audit-discovered correction 2026-05-25: UR-02 was incorrectly
  listed not-started despite seams already existing. Always run
  `grep -rn "<feature-name>" middleware/src app/src` before
  asserting something is unbuilt.
- Starting: flip to `in-progress`.
- Closing: write the user-visible test result; flip to `closed`;
  DELETE the inline `TODO(<id>)` from source.
- Periodically sweep closed rows out of epic tables to keep this
  file readable — the closure context lives in git history.
- The `memory/project_build_status.md` "Still open" list points
  here. This file is the truth.

## Discovery checklist (run before each audit pass)

Past audits missed work because they relied on a single
`grep TODO`. Run all of these next time:

| Method | Command |
|---|---|
| Standard markers | `grep -rn "TODO\|FIXME\|HACK\|XXX" middleware/src app/src` |
| Broader vocabulary | `grep -rnE "\b(for now\|later we\|we'll\|punt\|deferred\|ideally\|stretch\|Phase [0-9]+ (wire\|land))" middleware/src app/src` |
| Test framework markers | `grep -rnE "\.skip\(\|\.todo\(\|xit\(\|xdescribe\(" middleware/src app/src app/e2e` |
| Type escape hatches | `grep -rnE "@ts-ignore\|@ts-expect-error\|as any\b\|as unknown as" middleware/src app/src` |
| Lint suppressions | `grep -rn "eslint-disable" middleware/src app/src` |
| Print-debug holdovers | `grep -rnE "console\.(log\|warn\|error)" middleware/src app/src` |
| Stub-style throws | `grep -rnE "throw new Error.*(not implemented\|TODO\|placeholder\|stub)"` |
| `@deprecated` markers | `grep -rn "@deprecated" middleware/src app/src` |
| Files without sibling tests | walk `find`, compare `.ts` to `.test.ts` |
| Git WIP / stash / unmerged | `git log --grep="wip\|WIP"`; `git stash list`; `git branch -a` |
| Memory drafts / TBD / sketch | `grep -rnE "DRAFT\|TBD\|to be (decided\|determined)\|sketch" memory/` |
| Env vars in code vs schema | compare `grep -oE "env\.[A-Z_]+"` against `env.ts` Zod fields |
| Phase X markers | `grep -rnE "Phase [0-9]+" middleware/src app/src` |
| ESLint warnings | `npx eslint src` (frontend); accumulated warnings hide deferred refactors |
| **Verify before "not-started"** | `grep -rn "<feature-name>"` to confirm no seam already exists |
