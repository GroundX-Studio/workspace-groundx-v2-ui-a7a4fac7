# Real-data rewire gap — corrected after 2026-05-25 architectural feedback

**Read `memory/feedback_no_onboarding_duplicates.md` first.** This
file is the project-side translation of that rule plus the concrete
rewire plan.

## The single rule

There are **three** onboarding-specific surfaces. Everything else is a
production widget used identically in onboarding and steady. Each
production widget takes a `role: WidgetRole` + a required
`scope: WidgetScope` prop. **Availability** (which surface ever mounts
a widget) is enforced at the **mount site** — the view, from gate /
session state — NOT by a prop. **Affordance locks** (controls a role
may use within a visible widget) are **None today** — no widget varies
an editable affordance by role (widget-access-matrix §2 in
`openspec/changes/2026-05-30-widget-role-access/design.md`).

> **Migration note.** The code TODAY still ships a
> `mode: "onboarding" | "steady"` prop and `documentId` (not `scope`)
> — that is what's wired right now. The contract is migrating
> `mode` → `role: WidgetRole` and `documentId` → `scope: WidgetScope`
> via the in-flight **`2026-05-30-widget-role-access`** change. Build
> NEW work against `role` + `scope`; existing widgets still read
> `mode`/`documentId` until that change lands.

| Surface | Onboarding-specific? | Notes |
|---|---|---|
| Sign-up flow | ✅ Yes | `SignUpWidget` viewer overlay; legacy `GateChatPanel`/`GateChatRail` are not mounted by the live route |
| Onboarding nav | ✅ Yes | `OnboardingNav.tsx` — the left rail with the locked-state CTAs |
| F1 Ingest picker | ✅ Yes | `IngestView.tsx` — the scenario picker grid |
| **PDF viewer (F2)** | ❌ No | production widget, real xray data |
| **Extract experience (F3)** | ❌ No | production widget, real `getGroundXDocumentExtract` data |
| **Chat-with-sources (F5)** | ❌ No | production widget, real LLM + real RAG |
| **Report (F7)** | ❌ No | production widget |
| **Integrations (F7)** | ❌ No | production widget |

Affordance locks like the following — edit schema, change extraction
workflow, switch bucket/project, save-as-template/pin-to-report,
configure connectors — are the **forward-looking** target the
`role` prop exists to express. **None of them are locked by role
today** (widget-access-matrix §2). When they do land, they ride the
same production widget (same code, same data flow); `role` decides the
affordance, the view decides whether the widget mounts at all.

## How the project drifted

The drift pattern across `src/views/Onboarding/`:

| File | Drift |
|---|---|
| `UnderstandView.tsx` | Standalone implementation reading `scenario.manifest`. Should be a thin wrapper that mounts the production PDF viewer widget with a `scope` built from the active session's document + `role`. (Today the widget still takes `documentId` + `mode`; target is `scope` + `role`.) |
| `ExtractView.tsx` | Standalone implementation reading `scenario.manifest.extractionSchema` + `sampleExtractionValues`. Should mount the production Extract widget with `scope` + `role`. The schema metadata comes from `getGroundXWorkflow(document.filter.workflow_id)`; the values come from `getGroundXDocumentExtract(documentId)`. |
| `InteractView.tsx` | Standalone implementation. Should mount the production Chat widget. The chat infrastructure is correct (real LLM + real RAG); the view just needs to delegate. |
| `IntegrateView.tsx` | Standalone implementation with hardcoded plugin list. Should mount the production Integrations widget with `scope` + `role`. |

The data layer (entity functions in `app/src/api/entities/`, the
context providers, the middleware proxy) is correct. The drift is
entirely in `src/views/Onboarding/<Frame>View.tsx`.

## One main view: shells host it; experience + scope drive the canvas

Architectural target (clarified 2026-05-30). The per-frame-view fold below is not just
de-duplication — it is what makes the app conform to **"one main view that loads chat experiences."**

- **Shells stay separate** (onboarding vs authenticated vs future contexts) — they are per-context
  chrome + entry points, and that difference is legitimate. We do NOT collapse shells.
- **Both shells host the SAME main view** = `AppShell` (`nav` + `chat` + `canvas` slots) with:
  - `chat` = `ConversationFlow` + the active `ChatExperience` (unified-conversation-flow change);
  - `canvas` = the experience/scope-driven `ScopedViewerWidget` set (PdfViewer · Extract · SmartReport ·
    Integrate), driven by the active experience's `ContentScope` + viewer step — NOT a bespoke per-frame
    switch. `SteadyShell` already mounts `AppShell`; **`OnboardingShell` must adopt the same shared view**
    instead of its own `canvasContent` frame-switch over `UnderstandView`/`ExtractView`/….
- **The entry point selects the experience** (the mount site composes it): the onboarding full-screen
  overlay composes `makeOnboardingExperience(...)`; the authenticated nav rail's Workspaces/Projects
  entries (today disabled stubs in `OnboardingNav`) will compose Workspace/Project/document(+filter)
  experiences. No entry-context resolver.
- **The signup gate is a viewer overlay** (`SignUpWidget`, anonymous-only),
  shown by the onboarding surface while `ConversationFlow` remains mounted —
  NOT a separate chat experience.

Conformance owners: chat → unified-conversation-flow; canvas widgets → core-data-model-hardening
(`ScopedViewerWidget` base) + this fold; entry experiences (Workspace/Project/document) → follow-on.
The one **explicit gap to track**: `OnboardingShell` adopting the shared `AppShell` + experience/scope
canvas (so the canvas is one surface across both shells), and wiring the nav-rail entries to compose
experiences. The **`2026-05-30-onboarding-shell-shared-view`** change owns the
`OnboardingShell` → `AppShell` fold.

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

**Production widgets live under the slot-scoped dirs
`app/src/components/viewer-widgets/` and
`app/src/components/chat-widgets/`** (the slot directory declares the
surface — see the locked widget contract). There is **no**
`app/src/components/widgets/` directory.

The viewer-surface widgets need to be authored / completed:

```
app/src/components/viewer-widgets/
├── PdfViewer/                  ← exists; was: views/Onboarding/UnderstandView UX shell
├── Extract/                    ← to author; was: views/Onboarding/ExtractView UX shell
├── SmartReport/                ← greenfield (UI-02 / TL-05..07 territory; see smart-report-screen change)
└── Integrate/                  ← to author; was: views/Onboarding/IntegrateView UX shell

app/src/components/chat-widgets/
└── ChatColumn/ (+ delegation)  ← chat-with-sources; was: views/Onboarding/InteractView UX shell + OnboardingChatColumn delegation
```

**Rewire order (locked 2026-05-25): PdfViewer → Extract → ChatWithSources → Integrations → Report.** Reviewer-impact ranked: F2 silhouette is the biggest visible mock, F3 hardcoded schema is next, chat is already mostly real, F7 is small, Report is greenfield.

The current onboarding views are reasonable starting points for the
**visible UX** (the scan-line animation, the schema-fields table, the
chat column chrome). They are wrong in their **data sources**. So the
extraction is:

- Lift the UX shell into the slot dir
  `app/src/components/{viewer,chat}-widgets/<Widget>/`
- Replace the mock-data reads with the corresponding entity/context
  calls (`getGroundXDocumentXray`, `getGroundXDocumentExtract`, etc.)
- Take a required `scope: WidgetScope` + `role: WidgetRole` prop.
  **Availability** (whether the widget mounts) is enforced at the
  mount site (the view, from gate/session state), not by a prop.
  Affordance locks by role are None today; `role` is the
  forward-looking hook. (NEW work targets `role`/`scope`; existing
  widgets still read `mode`/`documentId` until widget-role-access
  lands.)
- Move the existing unit tests with them; rewrite the data mocks

### Step 2: shrink the onboarding views to layout wrappers

Each of the four files becomes ~30 lines:

```tsx
// src/views/Onboarding/UnderstandView.tsx (after)
import { PdfViewerWidget } from "@/components/viewer-widgets/PdfViewer";
import { useWidgetRole } from "@/contexts/...";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";

export const UnderstandView: FC = () => {
  const role = useWidgetRole();
  const { state: session } = useOnboardingSession();
  const documentId = session.activeDocumentId;
  if (!documentId) return <SignInPlaceholder />;  // BYO branch only
  return (
    <PdfViewerWidget
      scope={{ type: "documents", documentIds: [documentId] }}
      role={role}
    />
  );
};
```

Same shape for `ExtractView`, `InteractView`, `IntegrateView`. They
own only the BYO branch and the scope/role handoff. (This is the
post-`widget-role-access` shape; today the widget still takes
`documentId` + `mode`.)

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

### Step 4: planning cleanup

Migrate the affected requirements into the OpenSpec capability specs.
Most of these legacy rows are obsolete in light of the
GroundX-workflow rewire; surface the remaining work as new OpenSpec
changes under `openspec/changes/`.

| Item | New status |
|---|---|
| SCEN-01 (utility 84 fields) | Closed-as-obsolete. The schema is whatever the workflow defines via `getGroundXWorkflow(filter.workflow_id)`. Today the workflow has 36 fields (statement 14 / meters 16 / charges 6) — re-author the workflow to grow / shrink the schema. |
| SCEN-06 (real PDFs ingested) | Closed-as-obsolete. PDFs are already there; the view just wasn't reading them. |
| TS-04 (widget integration tests) | **Re-anchor**: this row was always about adopting the production widgets. The current blocked classification was wrong — the widgets either exist in the scaffold (port them in) or need to be authored. Either way, tests follow the widgets. |
| UR-01 (PdfViewer with pdfjs-dist) | Closure note update: the new flow is `PdfViewerWidget` reads `getGroundXDocumentXray(documentId)` → binary URL → existing `<PdfViewer>` primitive. The `previewUrl` field on `ScenarioDocument` becomes dead code. |
| New OpenSpec changes | One per locked-control surface that needs a role-gated affordance (none exist today). E.g. "F3 schema editor locked for read-only roles", "F7 connector setup locked for read-only roles", etc. — file each under `openspec/changes/` against the relevant capability spec. The role-gating mechanism itself is owned by `2026-05-30-widget-role-access`. |

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

> NOTE (2026-06-01-retire-mock-mode): `MOCK_MODE` has since been removed
> entirely. The runtime always uses the real GroundX / LLM clients; tests
> inject `Fake*` clients at the dependency seam. There is no canned-response
> fallback. The bullet that previously described `MOCK_MODE` here is obsolete.

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
| OpenSpec reconciliation | ~30 min |

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
