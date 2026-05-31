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
| SignUpWidget | ✅ | ❌ | **anonymous only** — a signed-in member never sees sign-up; `commitGate` is gate-state, not role |
| GateChatRail | ✅ | ❌ | **gate context** (anonymous) — gate variant re-sourced from gate-state, not role |
| GateValueProp | ✅ | ❌ | **gate context** (anonymous) — shown beside the gate |

## 1b. Scope stance (required `scope: WidgetScope` per widget)

ScopedViewerWidgets take a real `ContentScope`; everything else declares `{ type: "none" }`.

| Widget | scope | source |
|---|---|---|
| PdfViewer | **ContentScope** (`documents` for a single doc, or `bucket`/`group` `+ filter`) | active experience scope / `ScopedCanvas`; **replaces the raw `documentId` prop** |
| Extract (unbuilt) | **ContentScope** | active experience scope |
| SmartReport (unbuilt) | **ContentScope** | active experience scope |
| Integrate (unbuilt) | **ContentScope** | active experience scope |
| ChatColumn | `{ type: "none" }` | chat is session-scoped, not document-scoped |
| ThinkingStream | `{ type: "none" }` | display |
| SuggestedActionChips | `{ type: "none" }` | display/actions |
| ProposeSchemaFieldCard | `{ type: "none" }` | operates on the draft template, not a doc set |
| BookingStatusCard | `{ type: "none" }` | — |
| BookCallView | `{ type: "none" }` | — |
| GateValueProp | `{ type: "none" }` | — |
| SignUpWidget | `{ type: "none" }` | — |
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
