# Real-data rewire gap — corrected after 2026-05-25 architectural feedback

**Read `memory/feedback_no_onboarding_duplicates.md` first.** This
file is the project-side translation of that rule plus the concrete
rewire plan.

## The single rule

There are **three** onboarding-specific surfaces. Everything else is a
production widget used identically in onboarding and steady, with a
`mode` prop that locks certain controls.

| Surface | Onboarding-specific? | Notes |
|---|---|---|
| Sign-up flow | ✅ Yes | `GateView`, `GateChatPanel`, the auth forms |
| Onboarding nav | ✅ Yes | `OnboardingNav.tsx` — the left rail with the locked-state CTAs |
| F1 Ingest picker | ✅ Yes | `IngestView.tsx` — the scenario picker grid |
| **PDF viewer (F2)** | ❌ No | production widget, real xray data |
| **Extract experience (F3)** | ❌ No | production widget, real `getGroundXDocumentExtract` data |
| **Chat-with-sources (F5)** | ❌ No | production widget, real LLM + real RAG |
| **Report (F7)** | ❌ No | production widget |
| **Integrations (F7)** | ❌ No | production widget |

In onboarding mode, the production widgets lock features:

- Edit schema (add/rename/delete fields) → locked
- Change extraction workflow → locked
- Switch bucket / project → locked
- Save as template / pin to report → locked
- Configure connectors → locked

Same widget, same code, same data flow. Mode flag is the only delta.

## How the project drifted

The drift pattern across `src/views/Onboarding/`:

| File | Drift |
|---|---|
| `UnderstandView.tsx` | Standalone implementation reading `scenario.manifest`. Should be a thin wrapper that mounts the production PDF viewer widget with `documentId` from the active session + `mode` from `appMode`. |
| `ExtractView.tsx` | Standalone implementation reading `scenario.manifest.extractionSchema` + `sampleExtractionValues`. Should mount the production Extract widget with `documentId` + `mode`. The schema metadata comes from `getGroundXWorkflow(document.filter.workflow_id)`; the values come from `getGroundXDocumentExtract(documentId)`. |
| `InteractView.tsx` | Standalone implementation. Should mount the production Chat widget. The chat infrastructure is correct (real LLM + real RAG); the view just needs to delegate. |
| `IntegrateView.tsx` | Standalone implementation with hardcoded plugin list. Should mount the production Integrations widget with `mode`. |

The data layer (entity functions in `app/src/api/entities/`, the
context providers, the middleware proxy) is correct. The drift is
entirely in `src/views/Onboarding/<Frame>View.tsx`.

## Why the mock manifest exists

`middleware/scripts/scenarios/utility.json` ships an
`extractionSchema` + `sampleExtractionValues` + `sampleChatScript`
inside the manifest. The seed script writes this manifest into the
first sample doc's `filter.manifest` field. The frontend's
`useScenarioRegistry()` reads it back. **That entire mock-data path
is the drift.** It looked real on first glance but it bypasses every
real GroundX endpoint.

## What the rewire actually is

### Step 1: extract the production widgets

**Production widget directory (locked 2026-05-25): `app/src/components/widgets/`.**

Today this directory doesn't exist. Each of the 5 widgets needs to be
authored:

```
app/src/components/widgets/
├── PdfViewer/                  ← was: views/Onboarding/UnderstandView UX shell
├── Extract/                    ← was: views/Onboarding/ExtractView UX shell
├── ChatWithSources/            ← was: views/Onboarding/InteractView UX shell + OnboardingChatColumn delegation
├── Integrations/               ← was: views/Onboarding/IntegrateView UX shell
└── Report/                     ← does not exist yet (UI-02 / TL-05..07 territory)
```

**Rewire order (locked 2026-05-25): PdfViewer → Extract → ChatWithSources → Integrations → Report.** Reviewer-impact ranked: F2 silhouette is the biggest visible mock, F3 hardcoded schema is next, chat is already mostly real, F7 is small, Report is greenfield.

The current onboarding views are reasonable starting points for the
**visible UX** (the scan-line animation, the schema-fields table, the
chat column chrome). They are wrong in their **data sources**. So the
extraction is:

- Lift the UX shell into `src/widgets/<Widget>/`
- Replace the mock-data reads with the corresponding entity/context
  calls (`getGroundXDocumentXray`, `getGroundXDocumentExtract`, etc.)
- Add a `mode: "onboarding" | "steady"` (or `isLocked`) prop that
  gates the editable affordances
- Move the existing unit tests with them; rewrite the data mocks

### Step 2: shrink the onboarding views to layout wrappers

Each of the four files becomes ~30 lines:

```tsx
// src/views/Onboarding/UnderstandView.tsx (after)
import { PdfViewerWidget } from "@/widgets/PdfViewer";
import { useAppMode } from "@/contexts/AppModeContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";

export const UnderstandView: FC = () => {
  const { state: appMode } = useAppMode();
  const { state: session } = useOnboardingSession();
  const documentId = session.activeDocumentId;
  if (!documentId) return <SignInPlaceholder />;  // BYO branch only
  return <PdfViewerWidget documentId={documentId} mode={appMode.mode} />;
};
```

Same shape for `ExtractView`, `InteractView`, `IntegrateView`. They
own only the BYO branch and the mode/document handoff.

### Step 3: strip the mock manifest

In `middleware/scripts/scenarios/utility.json` (and the other
scenario JSONs once they're authored), drop:

- `extractionSchema` — schema now comes from
  `getGroundXWorkflow(document.filter.workflow_id)`. The workflow's
  `extract.{statement,meters,charges}.fields[]` IS the schema
  (description + identifiers + type + format + default + per-group
  meter / charge detection prompts). Per-doc lookup via
  `filter.workflow_id` is the only mechanism — there is no
  account-default-workflow path. See
  `docs/agents/groundx-real-api-shapes.md` for the full response
  shape.
- `sampleExtractionValues` — values now come from the same call
- `sampleChatScript` — delete; chat is real LLM

Keep:

- `id`, `hero`, `thinkingScript` (the per-scenario narrative copy
  shown during the F2 parse animation)
- `chatSeeds` (open question — see "Chat seeds" below)

Re-seed with `npm --workspace middleware run seed -- utility`. The
`refreshManifestIfChanged()` helper rewrites the carrier doc's
filter so the next `/api/scenarios` fetch returns the slim manifest.

### Step 4: backlog cleanup

| Item | New status |
|---|---|
| SCEN-01 (utility 84 fields) | Closed-as-obsolete. The schema is whatever the workflow defines via `getGroundXWorkflow(filter.workflow_id)`. Today the workflow has 36 fields (statement 14 / meters 16 / charges 6) — re-author the workflow to grow / shrink the schema. |
| SCEN-06 (real PDFs ingested) | Closed-as-obsolete. PDFs are already there; the view just wasn't reading them. |
| TS-04 (widget integration tests) | **Re-anchor**: this row was always about adopting the production widgets. The current blocked classification was wrong — the widgets either exist in the scaffold (port them in) or need to be authored. Either way, tests follow the widgets. |
| UR-01 (PdfViewer with pdfjs-dist) | Closure note update: the new flow is `PdfViewerWidget` reads `getGroundXDocumentXray(documentId)` → binary URL → existing `<PdfViewer>` primitive. The `previewUrl` field on `ScenarioDocument` becomes dead code. |
| New backlog items | One per locked-control surface that needs the mode gate. E.g. "F3 schema editor locked in onboarding mode", "F7 connector setup locked in onboarding mode", etc. |

## Open: chat seeds (`scenario.manifest.chatSeeds`)

Three options. User has asked for detail before deciding.

### Option A — Keep as scenario-level UX strings (recommendation)

Manifest keeps `chatSeeds: [{id, prompt, rationale}]`. Three starter
chips render under F2 input: "What's the total amount due?" / "Show
me the largest charge category" / etc. User clicks → literal prompt
goes into chat input → real LLM answers it.

**Pro**: Demos need a nudge; authors retain editorial control.
**Con**: A few strings of mock data; seeds can drift from docs.
**Cost**: ~0 (already wired); just verify the click path uses the real chat.

### Option B — Delete entirely

No chips. Free-text only. Reviewer types from a blank prompt.

**Pro**: Zero mock data.
**Con**: Demo friction; users need guidance.
**Cost**: ~30 min (delete the chip row + the manifest field).

### Option C — Generate from the schema

Auto-derive 2-3 starter prompts from the extracted schema. Either
deterministic templates ("What is the {amount_due}?") or a cheap
light-LLM call.

**Pro**: Zero authored mock data; scales to any scenario.
**Con**: Brittle templates or per-scenario LLM credit.
**Cost**: ~2-4 hr depending on path.

**Default recommendation: Option A.** The 3 strings per scenario are
trivial editorial work and the chips genuinely improve the first-five-
seconds demo experience. Option C is the right long-term answer if
the scenario count grows.

## What's NOT changing

- The bucket structure. Sample docs still carry the same `filter:
  {kind: "sample-doc", scenarioId, scenarioOrder}`.
- The `/api/scenarios` endpoint. It still returns the list of
  scenarios + their docs. Just with a slimmer manifest.
- The chat infrastructure (CF-* closures).
- `MOCK_MODE`. Still useful for local preview when GroundX isn't
  reachable; the new code paths fall back to canned responses behind
  it, same as today.

## Effort

Rough order of magnitude (with TDD on each):

| Phase | Cost |
|---|---|
| Audit / decide where production widgets live (look at scaffold widgets references; if missing, decide local path) | ~30 min |
| Lift UnderstandView UX into `PdfViewerWidget` + wire `getGroundXDocumentXray` | ~2 hr |
| Lift ExtractView UX into `ExtractWidget` + wire `getGroundXDocumentExtract` | ~3 hr |
| Lift InteractView UX into `ChatWithSourcesWidget` + delegate to real chat | ~2 hr |
| Lift IntegrateView UX into `IntegrationsWidget` + wire real data | ~2 hr |
| Test rewrites for the 4 onboarding-view wrappers | ~2 hr |
| Test rewrites for the new production widgets | ~3 hr |
| Strip mock manifest + re-seed | ~30 min |
| Backlog reconciliation | ~30 min |

**Total: ~15-16 hours.** This is the real cost of fixing the drift,
not the ~5-6 hours I quoted earlier (which assumed view-in-place
edits, missing the widget extraction).

## Pre-review impact

Pre-review state today = the user demos a wireframe (silhouette PDF,
hardcoded 14-of-84 schema, hardcoded sample values, hardcoded chat
script). Post-rewire = real product, real data, three onboarding-
specific surfaces only.

The rewire is non-trivial (~2 days) but it's the difference between
"this is a UX prototype" and "this is the product."

## How to keep this from happening again

The `memory/feedback_no_onboarding_duplicates.md` file is the
durable home for this rule. Read it at session start. Before adding
any new file under `src/views/Onboarding/<Frame>View.tsx`, run the
3-question check listed at the bottom of that file:

1. Is this onboarding-specific (sign-up / nav / F1 picker)?
2. Does this read `scenario.manifest.<anything except hero / thinkingScript / chatSeeds>`?
3. Does this UI differ between onboarding and steady?

If (1) is no, (2) is yes, or (3) needs the widget to know about
onboarding internals — stop and use the production widget path.
