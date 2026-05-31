# Widget access matrix

> Source of truth for **who has access to what** across widgets + tools. Reviewed & locked 2026-05-30.
> Referenced by the `2026-05-30-widget-role-access` change; a coverage test fails the build if any
> widget or tool is missing a row here, and each widget's sibling test asserts its row.

Three axes — do not conflate them:

0. **Scope** (added 2026-05-30) — every widget declares a REQUIRED `scope: WidgetScope`
   (`= ContentScope | { type: "none" }`, `@groundx/shared`). A widget either targets a real
   `ContentScope` or explicitly declares `{ type: "none" }` — never omitted, never a raw
   `documentId`/`bucketId`/`projectId`. ScopedViewerWidgets narrow to a non-`none` `ContentScope`. This
   is enforced by the widget-contract drift guard (rule 6). The scope column below records each widget's
   stance + source.



1. **Widget availability** — does a role ever see/mount the widget at all? *This is where role has real
   teeth today* (the gate/sign-up widgets are anonymous-only). Enforced at the **mount site** (the view
   decides, driven by gate/session state), not by a prop inside the widget.
2. **Affordance lock** — within a visible widget, may this role use an editable control? **No widget
   locks any affordance by role today.** The `role` prop on widgets is forward-looking (for future
   roles like `viewer`/`editor`) + satisfies the widget contract.

Roles today: `anonymous` (uncommitted / pre-sign-up) · `member` (signed in).

## 1. Widget availability

| Widget | anonymous | member | notes |
|---|:--:|:--:|---|
| ChatColumn | ✅ | ✅ | chat container; `mode` (flow dispatch) is removed by unified-conversation-flow, replaced by `role` forwarded to children |
| ThinkingStream | ✅ | ✅ | GA widget; streams real reasoning as received. Onboarding feeds scripted messages. (`persist` = replay logic, NOT role — re-source.) |
| BookingStatusCard | ✅ | ✅ | `mode` is cosmetic → drop |
| ProposeSchemaFieldCard | ✅ | ✅ | schema-build card; identical both modes today → drop functional `mode` |
| SuggestedActionChips | ✅ | ✅ | cosmetic → drop |
| BookCallView | ✅ | ✅ | `mode` = layout chrome → re-source from layout, NOT role |
| PdfViewer | ✅ | ✅ | cosmetic → drop |
| Extract | ✅ | ✅ | **ScopedViewerWidget** (extraction workbench, f3/f3a/f4). Available to both roles; export / Save are locked-for-anonymous (topbar 🔒 + the server 401 → gate handoff) — a DISABLED affordance, not a hidden control. The same widget the authenticated experience uses (`feedback_no_onboarding_duplicates`). (2026-05-30-onboarding-shell-shared-view Phase 3a) |
| SmartReportRender | ✅ | ✅ | **ScopedViewerWidget** (Report render, f4/S3). Available to both roles; export / Save are locked-for-anonymous as a DISABLED affordance (`widgetRoleCanEdit`) + `preview_only` badge, not a hidden control. (2026-05-29-smart-report-screen Phase 3) |
| SmartReportBuilder | ✅ | ✅ | **ScopedViewerWidget** (Report builder, f4a/S3a). Available to both roles; Save is sign-in-gated — anonymous Save opens the gate (`commitGate`), member Save persists (Phase 6); export is locked-for-anonymous (`widgetRoleCanEdit`), a DISABLED `🔒` affordance not a hidden control. Reuses the F3a schema-editor chrome; drives the `report`-kind `reportOverlay` sibling of the Extract schema overlay. (2026-05-29-smart-report-screen Phase 4) |
| Integrate | ✅ | ✅ | **ScopedViewerWidget** (connectors / agent plugins + API snippets, f7). Available to both roles. The only locked affordance is the connector DOWNLOAD button, which is disabled-future (UI-02 agent-integration download pipeline) — an honest `aria-disabled` + title, not role-driven, not a hidden control, not faked. The SURFACE (the cards) is the real content. The same widget the authenticated experience uses (`feedback_no_onboarding_duplicates`). (2026-05-30-onboarding-shell-shared-view Phase 3b) |
| PinToReportAction | ✅ | ✅ | chat-widget (`📌 pin to report`) on every assistant turn. Available to both roles; the only lock is DISABLED-mid-stream (queues the click) — not role-driven. Pins the turn's literal text as a report section via `pinToReport` (existing-or-new UX, no auto-create). (2026-05-29-smart-report-screen Phase 5) |
| SignUpWidget | ✅ | ❌ | **anonymous only** (the sign-up *form*) — a member never sees the form. NUANCE: the widget also renders a committed-state *celebration* (`signup-celebration`) at the anon→member boundary (`gate.status === "committed"`), driven by gate-state not role; that transient is not "a member browsing the form". `commitGate` is gate-state, not role. |
| GateChatPanel | ✅ | ❌ | **gate context** (anonymous) — the chat-column composite that dispatches gate-status → idle placeholder / typing indicator / GateChatRail; re-sourced from gate-state, not role. Moved into the chat-widget slot by 2026-05-31-dependency-direction-guard (was `views/Onboarding/`). |
| GateChatRail | ✅ | ❌ | **gate context** (anonymous) — gate variant re-sourced from gate-state, not role |
| GateValueProp | ✅ | ❌ | **gate context** (anonymous) — shown beside the gate |

## 1b. Scope stance (required `scope: WidgetScope` per widget)

ScopedViewerWidgets take a real `ContentScope`; everything else declares `{ type: "none" }`.

| Widget | scope | source |
|---|---|---|
| PdfViewer | **ContentScope** (`documents` for a single doc, or `bucket`/`group` `+ filter`) | active experience scope / `ScopedCanvas`; **replaces the raw `documentId` prop** |
| Extract | **ContentScope** (`documents` for the single-doc demo case, or `bucket`/`group` `+ filter`) | active experience scope / `ScopedCanvas`; the primary `documentId` is `scope.documentIds[0]`, derived FROM scope (NOT scenario context) |
| SmartReportRender | **ContentScope** (the demos open on `bucket + project filter`; doc-count-agnostic so `group` renders the same) | render-time scope inherited from the transition surface (Extract / Interact / Report pill) — recorded on the result, NOT stored on the template |
| SmartReportBuilder | **ContentScope** (the demos open on `bucket + project filter`; the template is scope-independent so the scope only selects which template's sections to seed) | active experience scope inherited from the transition surface (the render scope is supplied at render time, NOT stored on the template) |
| Integrate | **ContentScope** (scope-independent today — the connectors list renders the same for any scope; accepted for contract conformance + threaded through `show_integrate`) | active experience scope / `ScopedCanvas` |
| ChatColumn | `{ type: "none" }` | chat is session-scoped, not document-scoped |
| ThinkingStream | `{ type: "none" }` | display |
| SuggestedActionChips | `{ type: "none" }` | display/actions |
| ProposeSchemaFieldCard | `{ type: "none" }` | operates on the draft template, not a doc set |
| PinToReportAction | `{ type: "none" }` | operates on the draft report template + the source turn, not a doc set |
| BookingStatusCard | `{ type: "none" }` | — |
| BookCallView | `{ type: "none" }` | — |
| GateValueProp | `{ type: "none" }` | — |
| SignUpWidget | `{ type: "none" }` | — |
| GateChatPanel | `{ type: "none" }` | gate is session-scoped, not document-scoped; forwards `{ type: "none" }` to GateChatRail |
| GateChatRail | `{ type: "none" }` | — |

> The raw single-id case is `{ type: "documents", documentIds: [id] }`. No widget takes a bare
> `documentId`/`bucketId`/`projectId` — the audit found exactly one violation (`PdfViewer.documentId`),
> removed by this contract.

## 2. Affordance locks (within a visible widget)

**None today.** No widget hides/disables an editable control by role. Recorded explicitly so this is a
*decision*, not an oversight. When a future role (e.g. read-only `viewer`) lands, affordance rows get
added here and asserted by the owning widget's test.

## 3. Tool access (`availableIn`)

| Tool | widget | category | available to | reason |
|---|---|---|---|---|
| book_call | BookingStatusCard | mutate | all roles | anonymous may book a call |
| commit_gate | GateChatRail | mutate | all roles | anonymous commits the gate = signs up |
| dismiss_gate | GateChatRail | mutate | all roles | anonymous may dismiss |
| propose_schema_field | ProposeSchemaFieldCard | mutate | all roles | core onboarding interaction for the anonymous user |
| accept_proposal | ProposeSchemaFieldCard | mutate | all roles | "" |
| reject_proposal | ProposeSchemaFieldCard | mutate | all roles | "" |
| open_document | PdfViewer | read | all roles | viewing is open |
| jump_to_page | PdfViewer | read | all roles | viewing is open |
| open_template | _template | read | all roles | viewing a template is open |
| **edit_template** | _template | mutate | **`["member"]`** | editing a *saved* template requires a signed-in member — the only role-restricted tool |
| show_extraction | Extract | read | all roles | navigating to the extraction workbench is open (the canvas-dispatch `show_` verb); Save / export are gated at the Save boundary, not the tool |
| show_integrate | Integrate | read | all roles | navigating to the Integrate connectors surface is open (the canvas-dispatch `show_` verb); the connector DOWNLOAD is disabled-future (UI-02), not gated by this tool |
| show_smart_report_render | SmartReportRender | read | all roles | navigating to the render surface is open (the canvas-dispatch `show_` verb) |
| show_smart_report_edit | SmartReportBuilder | read | all roles | opening the builder is open; *persisting* a Save is gated at the Save boundary, not the tool |
| pin_to_report | PinToReportAction | mutate | all roles | anonymous may pin into the draft report (existing-or-new, no auto-create); Save is gated, not the pin |
| propose_report_section | SmartReportBuilder | mutate | all roles | shared family with `propose_schema_field` — proposing a section is open |
| accept_report_section | SmartReportBuilder | mutate | all roles | shared family with `accept_proposal` |
| reject_report_section | SmartReportBuilder | mutate | all roles | shared family with `reject_proposal` |
| edit_report_section | SmartReportBuilder | mutate | all roles | edits the in-memory draft section; *persisting* is gated at Save, not the tool |
| delete_report_section | SmartReportBuilder | mutate | all roles | removes a draft section; *persisting* is gated at Save, not the tool |
| submit_signup | SignUpWidget | mutate | all roles | the sign-up form is anonymous-facing; the user confirms via the chip before the account is created. Availability (a member never sees the form) is enforced at the mount site, not the tool. (2026-05-31-tool-system-completion wf04 §1) |
| wizard_next | OnboardingWizard | read | all roles | onboarding-walkthrough navigation; gated by `APP_CONFIG.onboarding.enabled` + the mount site, not role |
| wizard_back | OnboardingWizard | read | all roles | "" |
| wizard_finish | OnboardingWizard | read | all roles | "" |
| dismiss_wizard | OnboardingWizard | read | all roles | "" |
| close_dialog | DialogTitle | mutate | all roles | closing the active dialog is open to anyone who can see it (2026-05-31-tool-system-completion wf04 §4) |

> `category` (`read`/`mutate`) drives the confirmation model (auto-run vs. confirm-chip), NOT
> visibility. Visibility is `availableIn` only (absent = all roles). Whether a mutation is *persisted*
> is enforced at the save/commit boundary (server-side + signup gate), never by hiding a tool.

## Re-source, don't rename (the `mode` usages that are NOT role)

These widgets use `mode` for onboarding-**flow/phase** behavior, not authorization. Migrating them means
moving that input to its proper source — NOT renaming `mode`→`role` (which would re-encode phase as role):

- **ChatColumn** — `mode` = which flow tree renders → removed entirely by unified-conversation-flow.
- **ThinkingStream** — `persist = mode==="onboarding"` is replay/remount logic → drive from the widget's
  own replay concern (or the onboarding experience), not role.
- **BookCallView** — `mode` toggles surrounding chrome (close button, breadcrumbs) → drive from layout/flow.
- **SignUpWidget / GateChatRail / GateValueProp** — gate variant + `commitGate` side-effect → drive from
  gate-state (already available via `useOnboardingSession`), not role. Availability (anonymous-only) is
  enforced at the mount site.
