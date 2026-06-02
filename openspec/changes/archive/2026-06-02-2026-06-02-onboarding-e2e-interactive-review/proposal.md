# End-to-end interactive review of the onboarding experience (Chrome DevTools MCP)

## Why

The Playwright suite asserts the golden-path *structure* (frame mounts, testids,
gate lifecycle) but does NOT catch **visual defects** (overflow, clipping,
overlap, misalignment, contrast, broken layout) or **incidental functional bugs**
on controls the happy path never clicks. We need a human-style sweep: click
**every** interactive control on **every** onboarding screen, walk **every** user
flow, at every supported viewport, and log what's broken.

This is an **audit** — its output is **findings filed as labeled GitHub Issues**
(the backlog home locked 2026-06-02), not a behavior change. The only durable
artifact is a `testing-suite` requirement codifying the interactive-inspection
protocol so it's repeatable.

## Inspection mechanism (locked)

- **Primary: Chrome DevTools MCP** — `navigate_page`, `take_snapshot` (a11y tree
  → enumerate every interactive node), `click` / `hover` / `fill` / `fill_form` /
  `press_key`, `evaluate_script` (DOM measurement — overflow, bounding boxes,
  zero-size, overlap, computed styles), `list_console_messages` (errors/warnings),
  `list_network_requests` (4xx/5xx/failed/slow), `resize_page` + `emulate`
  (viewports + reduced-motion).
- **Screenshots: Chrome DevTools `take_screenshot`**, with **`Claude_Preview`
  `preview_screenshot` as the fallback** — per `feedback_ui_verification_tooling`,
  Chrome DevTools screenshots have timed out before; T0 picks the working one.
- **Servers: `Claude_Preview` `preview_start`** of the `frontend` (5173) +
  `middleware` (3001) launch.json configs (real GroundX, memory repo). Port
  hygiene first — a stray `:3001`/`:5173` aborts startup (hit twice this week).
- **Live data:** real GroundX + a real LLM. Findings MUST distinguish genuine
  bugs from live-data / LLM-variance (an adversarial-gate responsibility).

## What Changes

A one-time exhaustive interactive sweep (no app code change). Every onboarding
surface + flow is exercised, at **desktop (1440×900), tablet (820×1180),
mobile (390×844)**:
- **F1** Ingest picker — sample card(s) + capability badges, BYO tiles
  (pdf/url/folder), connector logos, nav rail (Workspaces/Projects/Docs/Settings/
  Book-a-call/Back-home), step strip + locked states.
- **F2** Understand — thinking stream, PDF reading scanner, auto-advance.
- **F3** Extract — field rows → provenance peek, citation chips, category tabs,
  topbar (back/rerun/save/export), unlock banner, pinned-samples row, pick-a-view.
- **F4 / F4a** Report render + builder.
- **F5** Interact — chat (live), suggested seeds, cite chips → PDF lit-region jump.
- **F6** Gate — magic-link / SSO / book-a-call / keep-exploring + value-prop
  canvas; reached via the Extract unlock banner AND via BYO `/onboarding/signup`.
- **F7** Integrate (known stub — confirm + cross-ref issue #4).
- **Cross-cutting** — step-strip state machine, nav rail, compact-mode (topbar /
  nav drawer / view-swap pill), reduced-motion, back-out/dismiss (LC5), debug
  reset (DBG-01).

## What this is NOT

- Not a fix pass — bugs are LOGGED, not fixed (each becomes its own Issue;
  fixing is separate, prioritized later).
- Not re-running Playwright (that's the structural layer; this is the visual +
  exhaustive-click layer).
- Not the Loan/Solar journeys (not seeded — issue #2) or steady mode (issue #5).

## Impact

- Specs: `testing-suite` (ADDED requirement — the interactive-inspection protocol).
- Output: GitHub Issues (one per confirmed finding), labeled `bug` | `visual` +
  `area:onboarding` (or finer) + a severity label. New labels created in T9:
  `visual`, `area:onboarding`, `severity:high|med|low` (proposed — confirmed at T9).
- No app code change in this effort.
