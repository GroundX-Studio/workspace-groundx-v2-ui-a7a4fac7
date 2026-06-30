# Design — viewer-nav-redesign

Source of truth for the mechanism + layout. Drift from this is a bug.

> **Reuse-first.** Confirmed existing pieces this change builds on (Task 2
> re-verifies before any code):
> - **3 shells** mount `<ScopedCanvas>`: `OnboardingShell` (`/onboarding`),
>   `SteadyShell` (`/c/:sessionId`, bare), `ScopedConversationShell`
>   (`/workspaces`, `/projects`). ALL THREE must feed the nav.
> - **`framePropsFromDescriptor`** (`viewerFrameDescriptor.ts`) is an existing
>   descriptor-merge helper that is UNUSED → the resolver replaces it; delete it.
> - **`ViewerWidgetFrame` already has a `loading={{label}}`/`status` strip**
>   (spinner + label, lines ~198-219). The Understand "processing" line REUSES
>   that slot — it is NOT a new subtitle path.
> - **`Label` eyebrow variant uppercases via CSS** (`textTransform: uppercase`,
>   Label.tsx). So eyebrow VALUES are stored mixed-case ("Understand") and
>   DISPLAY uppercase. Tests assert the value, not a literal "UNDERSTAND".
> - **Document name** sources already exist: onboarding from the scenario
>   (`scenario.documents[0].fileName`), steady from `DocumentsContext` state
>   (`documents[]` / `selectedDocument`). No new fetch path.
> - **`VIEWER_STEP_KIND_TO_STEP_ID`** already lives in `OnboardingShell` → moved
>   to the shared catalog, local copy deleted.
> - **Steady eyebrow is intentionally EMPTY for now** (decision 2026-06-16). The
>   real workspace/project name has no FE source yet — tracked in `task_3c2aace6`.
>   So this change does NOT build scope-name resolution (no `useScopeLabel`, no
>   Projects/Buckets/Groups wiring, no id-space dependency).

## 1. The model

```ts
// app/src/components/layout/ViewerWidgetFrame/viewerNavContext.ts
import type { CanvasKind } from "@groundx/shared";
import type { StepId, AnalyzeSubstep } from "@/components/layout/StepStrip/types";
import type { ViewerOverlay } from "@/contexts/ChatStoreContext";

export type ViewerNavContext =
  | { kind: "onboarding-step"; step: StepId; substep?: AnalyzeSubstep; documentName?: string }
  | { kind: "steady-canvas"; widget: CanvasKind; documentName?: string } // eyebrow EMPTY for now
  | { kind: "overlay"; overlay: ViewerOverlay["kind"] };
```

The top axis is onboarding-vs-steady (the only distinction the nav needs today:
journey words or none). `ScopedCanvas` gets a minimal `experience: "onboarding"
| "steady"` prop. This is NOT the `chatExperienceRegistry` (that catalog composes
*chat* experiences) — it is the nav's journey-words toggle, a different concern.
All three shells pass it. A new surface = a new union arm (`switch` `never`
default fails to compile until handled).

## 2. The resolver — REPLACES the dead `framePropsFromDescriptor`

```ts
export function resolveViewerNav(
  ctx: ViewerNavContext,
  defaults: ViewerFrameDescriptor, // widget intrinsic: title/subtitle/actions/frame style
): ViewerFrameDescriptor;
```

| ctx.kind | eyebrow | title | subtitle |
|---|---|---|---|
| `onboarding-step` | journey step from catalog (mixed-case value; displays uppercase) | sub-step from catalog, or `documentName` for understand | `defaults.subtitle` |
| `steady-canvas` | **none** (empty — `task_3c2aace6`) | `documentName` for doc-viewer, else `defaults.title` | `defaults.subtitle` |
| `overlay` | `defaults.eyebrow` | `defaults.title` | `defaults.subtitle` |

`chromePolicy`/`contentMode` always from `defaults`. Unset fields fall back to
`defaults` → never blank. NOTE: because the steady arm empties the eyebrow and
the onboarding arm overrides it from the catalog, the journey-word eyebrows
currently hard-coded in the **canvas** widget descriptors (Extract/Report/
Integrate `.tools.ts`) become unused — they are **removed** (dead data). Only the
overlay descriptors keep an intrinsic `eyebrow`.

The Understand **processing** line is NOT in this table — see §4a.

## 3. Shared journey catalog (single source — principle 6)

```ts
// app/src/components/layout/StepStrip/journeyCatalog.ts
export const JOURNEY_CATALOG: Record<StepId, JourneyStepEntry> = {
  ingest:     { stepLabel: "1 Ingest",     eyebrow: "Ingest" },
  understand: { stepLabel: "2 Understand", eyebrow: "Understand" },
  analyze:    { stepLabel: "Analyze",      eyebrow: "Analyze", substeps: {
                  extract:  { label: "Extract",  title: "Extract" },
                  interact: { label: "Interact", title: "Interact" },
                  report:   { label: "Report",   title: "Report" },
               } },
  integrate:  { stepLabel: "4 Integrate",  eyebrow: "Integrate", title: "Connect" },
};

export const INGEST_LIVE_LABEL =
  "Reading the document — mapping each table, paragraph, and figure on the page.";

// MOVED from OnboardingShell (local VIEWER_STEP_KIND_TO_STEP_ID DELETED).
export const VIEWER_STEP_TO_JOURNEY: Record<string, { step: StepId; substep?: AnalyzeSubstep }> = {
  "ingest-picker":    { step: "ingest" },
  "doc-viewer":       { step: "understand" },
  "extract-workbench":{ step: "analyze", substep: "extract" },
  "interact-chat":    { step: "analyze", substep: "interact" },
  report:             { step: "analyze", substep: "report" },
  integrate:          { step: "integrate" },
};
```

Eyebrow values are mixed-case; the `Label` eyebrow variant renders them
uppercase. A static `Record` (not a glob `Catalog<T>`). Distinct from
`stepToCanvasKind` (step → widget, a different concern). OnboardingShell's pill
labels + `analyzeSubsteps()` read this; its local `VIEWER_STEP_KIND_TO_STEP_ID`
is deleted. The single-source guard lives in the EXISTING
`recurrence-drift-guards.test.ts` (Task 3), not a new file.

## 4. Wiring — all THREE shells

`ScopedCanvas` gains `experience: "onboarding" | "steady"`; each shell passes its
own value: `OnboardingShell` → `"onboarding"`; `ScopedConversationShell` +
`SteadyShell` → `"steady"`. `ScopedCanvas` builds the ctx:
- `"onboarding"` → `{ kind: "onboarding-step", ...VIEWER_STEP_TO_JOURNEY[step.kind], documentName }`
- `"steady"` → `{ kind: "steady-canvas", widget: kind, documentName }`
- renders `<ViewerWidgetFrame {...resolveViewerNav(ctx, mount.descriptor.viewerFrame)} loading={loading} />`.

Overlay mounts (OnboardingShell `sign-up`/`book-call`) build `{ kind: "overlay",
overlay }`; `closeAction` unchanged.

### 4a. Processing line + document name (reuse existing slots/sources)

- **Processing line** — when the onboarding `doc-viewer` step is `scanning`,
  `ScopedCanvas` passes the frame's EXISTING `loading={{ label: INGEST_LIVE_LABEL }}`
  prop (spinner + label strip). It is NOT a resolver subtitle and NOT a new
  mechanism. Cleared when `scanning` is false.
  **Decision (2026-06-16): COEXIST.** `PdfViewerWidget` already renders a dim
  veil + sweeping beam during the same beat; the loading-strip line shows
  ALONGSIDE it (both display). No suppression — the existing scanner is left
  exactly as-is and `ScopedCanvas` just adds the `loading` line on top.
- **Document name** — `useDocumentName(documentId, options?)` resolves in order:
  (1) `DocumentsContext` `selectedDocument`/`documents[]`; (2) the active scenario
  fixtures; (3) an authoritative `DocumentsContext.getDocument(id)` fetch, cached
  per id, gated on a RESOLVED id (`isResolvedDocumentId` — skips the
  `scenario:utility` placeholder that 406s). Loaded scenario/list data carries a
  `documentId` but usually NO `fileName` (ChatColumn falls back to "sample.pdf"
  for the same reason), so state alone can't resolve the name in onboarding.
  **Dedupe (R2):** the doc-viewer shell passes `{ fetchFallback: false }` and
  instead uses the name the `PdfViewer` reports up (`onFileNameResolved`) from the
  X-Ray it ALREADY fetches — so the nav never issues a second round-trip for the
  same document. `ScopedCanvas` keeps `viewerFileName` state (reset on id change)
  and uses `useDocumentName(id, {fetchFallback:false}) ?? viewerFileName`.
  Placeholder while unresolved: `"Document"`. (The original "no fetch / state only"
  intent was wrong — the review caught the Understand title showing the
  placeholder; the fix resolves the real name AND avoids the duplicate fetch.)

## 5. Layout redesign (SHIPPED — validated live in Chrome DevTools 2026-06-16)

Final design (approved direction "A + chevron"):
- **Eyebrow › title on ONE row:** the eyebrow is a **coral** (`EYEBROW_ON_LIGHT`)
  uppercase kicker, then a muted `ChevronRightRounded`, then the title. The title
  is `Heading level="h6"` lightened to `FONT_WEIGHT_LABEL` (600) — not the heavy
  700 `h5`. The chevron only renders when both eyebrow and title are present.
- **Subtitle:** muted (`MUTED_ON_LIGHT`), `BodyText sm`, truncated to one line
  (ellipsis) → header is 1–2 lines, never the old three-line stack.
- **Back/close:** an icon-only `IconButton` (the back/close glyph) labelled via
  `aria-label` — replaces the old bordered text button + divider crutch.
- **A11y note (conscious accept):** the eyebrow uses the brand token
  `EYEBROW_ON_LIGHT` (#f3663f) — the standard eyebrow color used across the app
  (sign-up, F1, etc.). On white that is ≈3.1:1, BELOW WCAG AA (4.5:1) for small
  text, and it is currently UNGUARDED (no contrast test covers it). Accepted as
  the brand-standard eyebrow treatment; flagged here so it's a known, conscious
  trade-off rather than an unnoticed regression.
- The existing `loading`/`status` strip stays below the header (the processing
  line lives there). Chrome tokens only (`no-hardcoded-styles` guard green, no new
  exemption). `flexWrap` on the eyebrow row + the truncated subtitle keep it sane
  at narrow widths.

## 6. File map

| File | Action | Responsibility |
|---|---|---|
| `app/src/components/layout/StepStrip/journeyCatalog.ts` | **create** | Catalog + `VIEWER_STEP_TO_JOURNEY` + `INGEST_LIVE_LABEL`. |
| `app/src/components/layout/ViewerWidgetFrame/viewerNavContext.ts` | **create** | `ViewerNavContext` union. |
| `app/src/components/layout/ViewerWidgetFrame/resolveViewerNav.ts` | **create** | Pure resolver (replaces the dead `framePropsFromDescriptor`). |
| `app/src/components/layout/ViewerWidgetFrame/viewerFrameDescriptor.ts` | **modify** | DELETE unused `framePropsFromDescriptor`. |
| `app/src/components/layout/ViewerWidgetFrame/useDocumentName.ts` | **create** | Resolve doc name from scenario (onboarding) / `DocumentsContext` state (steady) — reuse existing state, no fresh fetch. |
| `app/src/components/layout/ViewerWidgetFrame/ViewerWidgetFrame.tsx` | **modify** | Header layout redesign. Presentational only. |
| `app/src/components/layout/ScopedCanvas/ScopedCanvas.tsx` | **modify** | Add `experience` prop; build ctx; pass `loading` for the scanning beat; feed frame via resolver. |
| `app/src/views/Onboarding/OnboardingShell.tsx` | **modify** | `experience="onboarding"`; overlays via resolver; labels + `analyzeSubsteps` + delete `VIEWER_STEP_KIND_TO_STEP_ID` → catalog. |
| `app/src/views/Scoped/ScopedConversationShell.tsx` | **modify** | `experience="steady"`. |
| `app/src/views/Steady/SteadyShell/SteadyShell.tsx` | **modify** | `experience="steady"`. |
| `app/src/components/viewer-widgets/{Extract,Integrate,SmartReportRender,SmartReportBuilder}/*.tools.ts` | **modify** | Remove now-unused journey-word `eyebrow`; Integrate title → `Connect`. |
| `app/src/views/Onboarding/viewerOverlayFrameDescriptors.ts` | **modify** | `sign-up` eyebrow `UNLOCK THE FULL WORKSPACE`, title `Create your account`. |
| `app/src/components/viewer-widgets/GateValueProp/*` | **delete** | Remove unused legacy widget (4 files). |
| `app/src/test/viewer-widget-shell-contract.test.ts` + `recurrence-drift-guards.test.ts` | **modify** | Drop GateValueProp refs; ADD the single-source guard to the latter. |

## 7. Test surface

- Unit: `journeyCatalog.test.ts`, `resolveViewerNav.test.ts`,
  `useDocumentName.test.ts`; the new guard case in `recurrence-drift-guards.test.ts`.
- Render: `ViewerWidgetFrame.test.tsx` (layout).
- Integration: `ScopedCanvas` + all THREE shells assert per-surface content.
  Eyebrow assertions check the VALUE ("Understand"), not the CSS-uppercased
  string, plus that the eyebrow variant is applied.
- Guards green: `widget-contract`, `no-hardcoded-styles`,
  `viewer-widget-shell-contract`, `recurrence-drift-guards`.
- Chrome DevTools MCP: Task 2 (current) + Task 8 (post) across all surfaces +
  all three shells.
