# E2E audit — progress log (session 2026-06-01)

Status: **IN PROGRESS** — harness stood up, methodology established, initial passes started,
key setup finding resolved. NOT complete: the full §2 16-pass measured sweep + the §4 fix loop remain.

## Live-data restart (2026-06-01, after MOCK_MODE removal — "live data only")
Re-ran against REAL GroundX on the post-`retire-mock-mode` build (there is no MOCK_MODE anymore; the
middleware boots with `APP_REPOSITORY_MODE=memory` + the Partner key). Finding **F-1 is now RESOLVED**
(the mock dev-client stub that broke the viewer is deleted). Measured passes (all live, console clean):
- **2.1 F1 Ingest — PASS (live):** sample-utility card + byo-pdf/url/folder tiles render; the parsed-doc
  fetch (`/api/v1/ingest/document/c3bfff49…`) returns **200 real data**; clicking the sample advances to
  `/onboarding/28454/utility`. (Note: the preview driver is flaky clicking on a freshly-loaded page —
  needed a click-and-poll; not a product defect.)
- **2.2 F2 Understand/PdfViewer — PASS (live), the 24px-collapse trap CLEARED:** the PDF renders as a real
  page image **958×1240** (widget box 958×801) with 3 page thumbnails (p.1/p.2/p.3 = the 3-page utility
  bill), `pdf-viewer-error` ABSENT. This is the exact check that FAILED under the mock stub — now correct
  on live data.
- **Report surface — PASS (live), no-template state graceful:** for a fresh customer (no template) the
  `smart-report-render` widget shows `smart-report-empty`: "No report for this scope yet. Pin an answer or
  open the builder to start one." — never an error/fixture. Validates live-report-render + mock-removal end
  to end.
Still to drive (live): 2.3 Extract field add/edit/JSON-toggle + provenance highlight · 2.4 chat send +
citation chips · 2.5 report render-when-template-exists + section accept/reject + builder · 2.6 Integrate ·
2.7 sign-up gate · 2.9 gates · 2.10 citation round-trip click→viewer highlight · 2.11 auth (password toggle,
claim/flip) · 2.12 steady mode parity · 2.13 debug reset · 2.14 responsive/mobile · 2.15 reduced-motion ·
2.16 console/network sweep. Plus §3 defect log + §4 fix loop + §5 sign-off.

## Harness setup (done)
- Both dev servers run via `Claude_Preview preview_start` (frontend :5173, middleware :3001).
- **`.claude/launch.json` fix (local, UNCOMMITTED — user-specific path):** the user's default shell node
  is v10, so `npm --workspace` failed; wrapped both configs in a `bash -c` that prepends the node-v20 nvm
  bin to PATH. Middleware also exports `APP_REPOSITORY_MODE=memory` (in-memory repo → no MySQL needed).
  This path is machine-specific and is intentionally NOT committed.
- **Audit env = REAL GroundX (not MOCK_MODE).** See finding F-1.

## Findings

### F-1 — MOCK_MODE cannot serve the onboarding sample (env finding; possible ticket) — P2
- **Measured:** with `MOCK_MODE=1`, `GET /api/v1/ingest/document/c3bfff49-…` returns the `DevGroundXClient`
  stub `{mode:"development", ingest:{…}, path, method, hasApiKey}` — no `fileName`, no document content.
  The PDF viewer's Zod schema requires `fileName: string` → the canvas shows
  **"COULD NOT LOAD DOCUMENT"** (`pdf-viewer-error`, Zod `path:["fileName"] received:"undefined"`).
- **Root cause:** `middleware/src/services/devClients.ts` `DevGroundXClient` is a thin plumbing echo, NOT a
  fixture server. The onboarding "Try a sample" loads a REAL seeded GroundX doc (c3bfff49 in bucket 28454).
- **Resolution for the audit:** run middleware in real-GroundX mode (`.env.local` `MOCK_MODE=false` +
  Partner key, memory repo). Confirmed: the doc then returns **200 with real data**
  (`fileName:"utility-bill-april-2026.pdf"`, fileSize, tokens, …).
- **Open question for the product:** is an offline/MOCK demo of the sample intended? Today the demo path
  REQUIRES live GroundX. If an offline demo is wanted, the dev client needs a real per-scenario fixture for
  document / extract / xray. Otherwise this is "working as designed; document the live dependency." → triage.

### F-2 — cold-start anon session: first `POST /api/chat-sessions` 401, retry 200 — P3
- **Measured:** on a fresh load the first `POST /api/chat-sessions` → 401 (+ cascading PATCH/viewer-events
  404), then a retry `POST /api/chat-sessions` → 200 and `POST /api/intent` → 201 succeed. The anon session
  cookie establishes a beat after the first call.
- Impact: transient console/network noise on cold start; the flow self-heals via retry. Confirm the retry is
  intentional (vs a race that could occasionally not recover). → triage / low.

### Verified-working (measured, under MOCK — re-verify under real)
- **2.1 F1 Ingest:** sample-utility card + byo-pdf/url/folder tiles (locked) render; clicking the sample
  navigates to `/onboarding/28454/utility` and the flow advances (does NOT skip).
- **2.2 F2 Understand auto-advance:** the thinking-stream narration ("Reading … parsing layout · page 1 …
  Done. Ready to analyze") plays and auto-advances to "Step 3 of 4 · Analyze" (2/4 done) — the documented
  auto-advance, not a skip.

## Remaining (NOT done)
- Re-run 2.1/2.2 under real GroundX and MEASURE the PDF canvas dimensions (the 24px-collapse trap).
- §2.3–2.16: Extract widget + schema builder, Interact/chat + citation chips, Report render/builder,
  Integrate, sign-up gate, gates, citation round-trip, auth (incl. password toggle), steady mode, debug
  reset, responsive (mobile), reduced-motion, console/network sweep.
- §3 defect-log consolidation · §4 fix loop (failing test → fix → reverify) · §5 closeout.
- Note: interaction timing after a hard reload is flaky via the preview driver — drive with explicit waits.
