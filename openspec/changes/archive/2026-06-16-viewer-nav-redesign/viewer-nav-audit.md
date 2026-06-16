# Viewer nav — editable audit & target table

> Working artifact for the `viewer-nav-redesign` change. **Edit freely.**
> CURRENT = code-verified reference (2026-06-16). TARGET = the agreed design.
> Mechanism locked: **B + C** — one typed, experience-first nav context + one
> pure resolver, with a shared journey-step catalog feeding the onboarding arm.

---

## What "the viewer nav" is

Every viewer widget is wrapped by one shared component,
`ViewerWidgetFrame` (`app/src/components/layout/ViewerWidgetFrame/`). Its
header bar can show, left-to-right: a **back/close button** (optional); a
stacked text block — **eyebrow** (small ALL-CAPS) → **title** → **subtitle**;
and **primary/secondary action** buttons. Below it: an optional
**loading/status strip**.

### What "other chrome" means

"Chrome" = the framing UI *around* the content, not the content itself. Split out:

| Element | What it is |
|---|---|
| **Frame style** | `chromePolicy` + `contentMode`. `framed` = white card + border + header bar; `edge-to-edge` = content runs to the edges (the PDF viewer). `contentMode` = body layout: `centered-panel`, `padded-scroll`, `edge-to-edge`, `embed`. |
| **Primary / secondary actions** | Optional header buttons (e.g. "Save", download, open-in-new). **Slot exists; none wired today.** |
| **Loading / status strip** | Thin bar under the header: spinner + label, or status/error. **Only BookCallView uses it.** |

---

## CURRENT STATE (code-verified reference)

| Surface (widget) | Mounted by | Appears in | Eyebrow | Title | Subtitle | Back | Frame style |
|---|---|---|---|---|---|---|---|
| **PdfViewer** (`doc-viewer`) | ScopedCanvas | Onb. Understand (F2), Onb. Interact (F5), Steady | — | "Document viewer" | — | no | edge-to-edge |
| **Extract** (`extract-workbench`) | ScopedCanvas | Onb. Analyze▸Extract (F3), Steady | "Analyze" | "Extract" | "Review structured fields and citations for the active scope." | no | framed / padded-scroll |
| **SmartReportRender** (`report`) | ScopedCanvas | Onb. Analyze▸Report (F4), Steady | "Report" | "Smart report" | "Render a scoped, citation-backed brief from the active documents." | no | framed / padded-scroll |
| **SmartReportBuilder** (`report-builder`) | ScopedCanvas | Onb. Analyze▸Report builder (F4a), Steady | "Report" | "Report builder" | "Edit report sections and review proposed changes for this scope." | no | framed / padded-scroll |
| **Integrate** (`integrate`) | ScopedCanvas | Onb. Integrate (F7), Steady | "Integrate" | "Integrate" ⚠️ dup | "Connect this GroundX scope to agents, apps, and API workflows." | no | framed / padded-scroll |
| **SignUpWidget** | OnboardingShell overlay | Onb. only | "Save your work" | "Create an account" | "Your chat, viewer state, and sample progress stay together after sign-in." | **yes** | framed / centered-panel |
| **BookCallView** | OnboardingShell overlay | Onb. only | "Need help?" | "Book a 30-minute engineer call" | "Choose a time in the calendar." | **yes** (+ loading/status) | framed / embed |
| **citation-peek** | *(unrendered)* | — | — | "Citation source" | — | — | edge-to-edge |
| **GateValueProp** | *(unused legacy — TO BE REMOVED)* | — | — | — | — | — | — |
| Ingest picker (F1) | own overlay (not the frame) | Onb. only | n/a | n/a | n/a | n/a | n/a |

Confirmed problems: (1) doc-viewer has no eyebrow + generic title; (2) same nav
for two different steps (Understand vs Interact); (3) Integrate eyebrow == title;
(4) mixed eyebrow semantics (Extract→"Analyze" vs Report→"Report"); (5) the three
text lines stack vertically (wastes height); (6) back button cramped beside them.

---

## TARGET — what each surface SHOULD show

Rule: **eyebrow** = journey step (onboarding) or scope name (steady);
**title** = sub-step or feature; **subtitle** = one-liner. `{curly}` = runtime value.

### Onboarding (journey words apply)

Eyebrow values are stored **mixed-case** (e.g. `Understand`) and **display
uppercase** via the `Label` eyebrow variant (CSS). Tests assert the value.

| # | Surface | Step context | Eyebrow (value) | Title | Subtitle / line |
|---|---|---|---|---|---|
| 1 | PdfViewer | Understand (F2) | `Understand` | `{document name}` | **while scanning** the frame's **loading slot** shows: `Reading the document — mapping each table, paragraph, and figure on the page.` (clears when scanning ends) |
| 2 | PdfViewer | Interact (F5) | `Analyze` | `Interact` | `{document name}` |
| 3 | Extract | Analyze▸Extract (F3) | `Analyze` | `Extract` | Review structured fields and citations for the active scope. |
| 4 | SmartReportRender | Analyze▸Report (F4) | `Analyze` | `Report` | Render a scoped, citation-backed brief from the active documents. |
| 5 | SmartReportBuilder | Analyze▸Report builder (F4a) | `Analyze` | `Report builder` | Edit report sections and review proposed changes for this scope. |
| 6 | Integrate | Integrate (F7) | `Integrate` | `Connect` | Connect this GroundX scope to agents, apps, and API workflows. |

### Steady (authenticated — NO journey words, eyebrow EMPTY for now)

Eyebrow is **empty** (decision 2026-06-16; real workspace/project name deferred to
`task_3c2aace6` — no FE name source today). Title = document name (doc-viewer) or
the feature name.

| # | Surface | Eyebrow | Title | Subtitle |
|---|---|---|---|---|
| 7 | PdfViewer | *(empty)* | `{document name}` | — |
| 8 | Extract | *(empty)* | `Extract` | Review structured fields and citations for the active scope. |
| 9 | SmartReportRender | *(empty)* | `Smart report` | Render a scoped, citation-backed brief from the active documents. |
| 10 | SmartReportBuilder | *(empty)* | `Report builder` | Edit report sections and review proposed changes for this scope. |
| 11 | Integrate | *(empty)* | `Connect` | Connect this GroundX scope to agents, apps, and API workflows. |

### Overlays (onboarding only)

| # | Surface | Eyebrow | Title | Subtitle | Back |
|---|---|---|---|---|---|
| 12 | SignUpWidget | `UNLOCK THE FULL WORKSPACE` | `Create your account` | Your chat, viewer state, and sample progress stay together after sign-in. | yes |
| 13 | BookCallView | `Need help?` | `Book a 30-minute engineer call` | Choose a time in the calendar. | yes (+ loading/status) |
| 14 | citation-peek | *ticketed — `task_023d7546`, citation review, not this change* | | | |

### Copy notes (GroundX brand voice: "mechanism over magic")

- Row 1 line is a **live processing-state** line rendered via the frame's
  **existing `loading` slot** (spinner + label), present-tense, quiet, mechanism
  over marketing. Shown only while the doc-viewer `scanning` beat is active;
  clears when it ends. NOT a new subtitle path. Bans: `magical`, `seamless`,
  `revolutionary`, `unleash`, pitch register.
- Row 12 eyebrow generalized from "Save your work" (assumed prior work) to
  `UNLOCK THE FULL WORKSPACE` (works from any entry point, incl. main-page links).

---

## Resolved decisions

1. **Steady eyebrow** (rows 7–11): **empty for now** (real name deferred — `task_3c2aace6`).
2. **Integrate sub-step title**: **`Connect`**.
3. **Layout**: space-efficient arrangement + back-button separation — designed & validated in Chrome DevTools (Task 2 / Task 8).
