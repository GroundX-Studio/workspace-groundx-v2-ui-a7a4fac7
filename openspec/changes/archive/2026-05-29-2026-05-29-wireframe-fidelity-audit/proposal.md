# Wireframe-fidelity audit + remediation — onboarding flow (2026-05-29)

## Why

A full visual + structural audit of the implemented onboarding screens against the in-repo
wireframe spec (`openspec/wireframes/`, `source/spec-flow.jsx`) was run live via Chrome
DevTools MCP (frontend `:5173` + middleware `:3001`, Utility sample, anonymous session),
F1 → F6, with F7 read from source.

The audit accounts for the deliberate post-wireframe deviations (see "Confirmed intentional"
below) so they are not filed as regressions. What remains are genuine fidelity gaps. Per the
owner's direction (2026-05-29) the work is reprioritized around **three screens**, in order,
with the remaining findings demoted beneath them and screen-adjacent findings folded in.

## Prioritization (owner-directed)

> **P1 → P2 → P3 ship first, in this order.** Everything else follows, with any remaining
> finding that touches these three screens ranked above unrelated work.

### P1 — F6 Sign-up / Gate, rebuilt as a chat moment

The gate becomes a real chat moment, not a form in the canvas:

- **Magic-link in the chat.** The sign-in offer appears in the **left chat rail** as an
  assistant message with the wireframe's three doors — **email → "send magic link" · SSO ·
  book-a-call** (wireframe `Flow_Gate` L851-856).
- **Delayed / staggered appearance.** The gate message animates in like an AI turn — a beat
  of "thinking", then the message reveals (typing-style / fade-up), not an instant render.
- **Onboarding nav = Understand** while this screen is shown.
- **Viewer = value prop.** The right canvas drops the create-account form and instead shows
  **attractive, well-styled GroundX value-prop copy** (the pitch). Make it look nice — this is
  the "felt the value" surface the gate sits beside.

> Decision to confirm during build: the magic-link door's backend. Partner API today is
> password `register` + `login`; passwordless magic-link may need backend support. Options:
> (a) wire "send magic link" to a real passwordless send if available, or (b) the chat door
> collects the email and hands off to the existing register/login flow. The **chat UI +
> delayed reveal + three doors + value-prop viewer** are the deliverable regardless.

Folds in prior findings **F-4** (SSO door missing) and **F-6** (gate value-prop preamble).

### P2 — F1 → F2 → F3 transition, staggered like real reasoning

- On **sample pick**, land on **Understand** (nav = Understand) — do NOT jump straight to
  Interact (today both Ingest+Understand auto-complete and the flow lands on F5).
- The thinking-stream / status messages appear **staggered** — one at a time, with delays,
  like an AI emitting status as it reasons: *Reading … · parsing layout · page 1 · found
  header · extracting meter table · 8 rows · extracting charge ledger · 56 rows · matching
  legend · confidence check · 96% · Done. Ready to analyze.*
- The nav **stays on Understand while the messages stream**, then **auto-advances to Extract**.
- The **Extract experience renders in the viewer** exactly as the wireframe (`Flow_Extract`):
  PDF on the left, the schema/fields panel (Statement / Meters / Charges) on the right.

Folds in prior findings **F-2** (blank Understand canvas) and **F-5** (Understand nav
mislabeled "Available after sign-in").

### P3 — A message that triggers citations in the Interact PDF viewer

- Guarantee a chat message whose answer **lights citation regions on the canvas PDF**.
- **Recommended trigger message: _"What is the total amount due on this bill?"_** — its
  answer cites **"Amount Due $7,613.20"** (page 1, prominent red text in the remittance block)
  and **"Total Amount Due $7,613.20"** (page 2). Both are large, unambiguous, easy-to-verify
  highlight targets. Fallback: _"What is the largest charge on this bill?"_ → Water/Sewer
  $5,193.30. Both are already seeded turns, so this is about making the **chip → PDF highlight
  land on real geometry**, not authoring a new question.
- While here, fix the two Interact-screen defects so the citation demo is clean:
  - **F-1** — the canvas must be **doc-only**; remove `InteractView`'s duplicate chat
    (turns + input + Save) so the shell `ChatColumn` is the single chat surface.
  - **F-3** — citation snippets must be **human-readable**, never raw extract-JSON; every
    cited turn must carry answer prose (today "which meter had the highest demand charge?"
    shows no answer + JSON-blob citations).

## Findings ledger (severity + where each now lives)

| # | Frame | Sev | Finding | Now under |
|---|---|---|---|---|
| F-4 | F6 Gate | P1 | SSO door missing (`commitGate` has `"sso"`, no UI) | **P1** |
| F-6 | F6 Gate | P1 | Value-prop preamble reduced to one line | **P1** (viewer value prop) |
| F-2 | F2 Understand | P1 | Blank canvas — violates existing "F2 SHALL render the PDF viewer" req | **P2** |
| F-5 | F1 strip | P2 | "Understand" mislabeled "Available after sign-in" | **P2** |
| F-1 | F5 Interact | P1 | Duplicate chat surface in the canvas | **P3** |
| F-3 | F5 Interact | P1 | Broken 3rd turn (no answer) + raw-JSON citation snippets | **P3** |

## Confirmed intentional (NOT in scope)

- F1 headline relock + BYO Upload/Connect/Email tiles — `project_frame_content`.
- Plugin downloads "Coming soon" — UI-02 pending.
- Loan / Solar scenario cards absent — WF-10, blocked on source assets.

## Scope

In scope: P1, P2, P3 above. Out of scope: steady-mode fidelity (separate `groundx-wireframes`
checkout), F7 beyond source-read (auth-gated), WF-10 content.

## Affected

- App: `GateChatPanel.tsx` + gate chat-message reveal + value-prop viewer pane (P1);
  `OnboardingShell` frame sequencing + step-strip gating, the thinking-stream stagger, the
  Understand→Extract auto-advance, `UnderstandPlaceholder`/Extract canvas (P2);
  `InteractView.tsx` (de-dup) + citation→PDF highlight path (P3).
- Middleware: `services/chatRouter.ts` snippet/answer handling for extract-indexed docs (P3).
- Specs: `ui-views` (gate-as-chat + magic-link + value-prop viewer; staggered reveal +
  Understand→Extract; citation-trigger + doc-only canvas + readable snippets).
