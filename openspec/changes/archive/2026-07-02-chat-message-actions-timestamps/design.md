## Context

The conversation view renders bubbles via `app/src/conversation/chatPrimitives.tsx` (`UserBubble`, `BotBubble`, `LiveTurnList`) driven by `LiveTurn[]` from `useConversation`. Today the only per-message affordance is the compact `PinToReportAction` (a colored 📌 emoji) hosted in `AnswerActions`, rendered under assistant turns only. User turns have nothing; no message shows a timestamp; the pin reads as janky and off-brand (color instead of the muted-grey chrome used elsewhere).

The persisted message time lives in `chat_messages.created_at`. The repo maps it to `ChatMessageRecord.createdAt` as a **`Date`** ([mysqlRepository.ts:996](../../../middleware/src/db/mysqlRepository.ts)) — there is NO numeric `timestamp` field on the record. The GET `/messages` handler spreads the record (`{...m, citations}`, [app.ts:640](../../../middleware/src/app.ts)), so the wire already carries **`createdAt` as an ISO string** (`res.json` serializes the `Date`). BUT the app-side hydration DTO `PersistedChatMessage` ([chatSessions.ts:581](../../../app/src/api/chatSessions.ts)) does **not** declare `createdAt`, so it arrives untyped-and-unread, and the rendered `LiveTurn` (`useConversation.ts`) has no time at all. Showing times therefore needs: (a) typing **`createdAt: string`** onto `PersistedChatMessage`, (b) a projection test pinning that the wire keeps emitting `createdAt` so it can't silently regress, and (c) threading a numeric `timestamp` onto `LiveTurn` (hydrated turns via `Date.parse(createdAt)`). There is NO new DB column, endpoint, or SSE-envelope field — the client just consumes a field already on the wire.

Source of truth for message time: `chat_messages.timestamp` (DB) → `ChatMessage.timestamp` → (new) `LiveTurn.timestamp`. Greyscale styling source of truth: the brand tokens in `app/src/constants` (`MUTED_ON_LIGHT`/`BODY_TEXT`/`BORDER`), enforced by `no-hardcoded-styles.test.ts`.

## Goals / Non-Goals

**Goals:**
- A per-message footer (greyscale actions + timestamp) on every real chat bubble, both roles.
- Hover-reveal on desktop (`@media (hover: hover)`, incl. `:focus-within`), persistent on touch (`@media (hover: none)`).
- Copy on both roles; Pin retained on assistant; all glyphs monochrome muted-grey.
- Timestamps: `h:mm A` today, `MMM D, h:mm A` older.
- Reuse the one `useConversation` engine + `ConversationFlow` view — no new flow component, no `mode` fork (conversation-flow invariant).

**Non-Goals:**
- Feedback (👍/👎), edit-and-resend, read-aloud, share — deferred (each needs new backend/flow; would be dead plumbing now).
- Footers on scripted onboarding choreography (`reading…/parsing…`), the thinking placeholder, or tool-activity-only lines.
- Any DB/wire/endpoint change.

## Decisions

**1. New `MessageActions` footer component; remove `AnswerActions`.**
`AnswerActions` encodes "1 action inline / ≥2 actions collapse to a ⋯ kebab" — the opposite of the always-inline greyscale icon row this design needs. Rather than bend it, `MessageActions` (in `components/conversation/MessageActions/`) owns: reveal behavior, side alignment (`role`), and the row layout `[actions…] + [timestamp]`. Props: `role`, `text` (copy source), `timestamp`, `streaming?`, `extraActions?: ReactNode` (the pin node for assistant). `AnswerActions` + its test are deleted (no orphaned code). _Alternative considered_: keep `AnswerActions` and add a "flat" variant — rejected as two components competing for one job.

**2. Reveal via CSS group-hover, not JS state.** Each turn is wrapped so the footer is `opacity: 0` + `transition` and becomes `opacity: 1` on the wrapper's `:hover`/`:focus-within` under `@media (hover: hover)`; under `@media (hover: none)` the base rule is `opacity: 1`. Buttons stay mounted + focusable (revealed on focus for keyboard/a11y). The footer's vertical space is **reserved** whether or not it's visible (opacity toggle, not `display` toggle) so hovering never shifts the transcript; spacing is tuned so the reserved row reads as intentional breathing room, not an empty gap. _Alternative_: `onMouseEnter` state — rejected (re-renders, worse a11y, no touch story). _Alternative_: `display:none`→`block` — rejected (layout jump on every hover).

**7. Pin is gated on `pinnable`; time precedence is server-authoritative.** The pin is passed as `extraActions` ONLY when `turn.pinnable === true` (genuine document answers — [chatPrimitives.tsx:247](../../../app/src/conversation/chatPrimitives.tsx), [useConversation.ts:367](../../../app/src/conversation/useConversation.ts)); booking/narration/error assistant turns get copy + timestamp only. For time: a freshly-sent turn stamps the client `Date.now()` at creation (the SSE reply carries no time); the persisted server `created_at` is authoritative and replaces the client value on hydrate. Minor client-vs-server drift is accepted (self-corrects on reload) — chosen over widening the SSE envelope with a server timestamp.

**8. Copy strips citation markers.** `CopyButton` copies the message text with inline `[N]` citation markers removed (a small pure transform), so an assistant answer copies clean prose instead of `…2025.[1] The…`. The transform targets citation markers specifically — a marker adjacent to preceding text/punctuation (e.g. `.[1]`, `2025.[3]`), NOT any bracketed digit, so prose like `option [1]` is preserved; a false-positive case is a required test. Markdown emphasis is left as-is (readable); full markdown-to-plaintext rendering is out of scope (YAGNI).

**3. `CopyButton` is its own primitive-ish component** (`components/conversation/CopyButton/`): `navigator.clipboard.writeText(text)`, swap glyph → check + "Copied ✓" for ~2s (same transient pattern the compact pin already uses). Its glyph is a recolorable **icon** (MUI outlined / inline SVG using `currentColor`) so it renders muted-grey — NOT a clipboard emoji (color-emoji ignore CSS `color`). Isolated so its clipboard + strip + timer logic is unit-tested once and reused by both roles.

**4. Timestamp is a pure helper** `formatMessageTime(ts: number, now: number): string` (co-located util). Injecting `now` keeps it deterministic for tests (no `Date.now()` inside). Same-calendar-day → `h:mm A`; else prefix `MMM D, `.

**5. Thread `timestamp` through `LiveTurn`.** Add `timestamp: number` (required). It must be set at every construction site in `useConversation` — 6+ of them: the user turn (:429), the streaming placeholder `content:""` turns (:481/:617), the agent-message reveal projection (:399), the DB-hydration map (:357, now reading `Date.parse(m.createdAt)` off the newly-typed `PersistedChatMessage.createdAt`), plus every `ChatExperience.seedTurns()` and test fixture that builds a `LiveTurn`. Live/placeholder/agent turns stamp `Date.now()` at creation; hydrated turns parse the persisted ISO `createdAt`. TypeScript makes each site a compile error until set, which is the safety net; the numerous transient sites all funnel through `Date.now()` so there's no per-site logic to get wrong.

**6. Greyscale pin.** `PinToReportAction` compact variant swaps the 📌 emoji for a recolorable monochrome pin **icon** (MUI `PushPinOutlined` / inline SVG on `currentColor`) in a muted-grey token, matching `CopyButton`. An emoji can't be greyscaled (color-emoji ignore CSS `color`), so this must be a real icon. Its behavior (queue-mid-stream, transient confirm, `pinToReport`) is untouched. Before swapping, grep tests for the literal `📌` — any suite asserting it (e.g. `ChatColumn`/`chatPrimitives`/`ConversationFlow`) is updated to assert the icon (by `aria-label`/testid, not glyph).

## Risks / Trade-offs

- [Removing `AnswerActions` loses the kebab-overflow capability] → It was only ever wrapping the pin (1 action); the ≥2 path was never used in production. If a future turn needs >3 actions, reintroduce overflow inside `MessageActions` then (YAGNI now).
- [`navigator.clipboard` unavailable in insecure contexts / old browsers] → `CopyButton` guards on its presence and no-ops gracefully (button still renders; no crash); localhost + prod https both support it.
- [`LiveTurn.timestamp` required could break a missed construction site] → TypeScript makes every site explicit at compile time; a conversation-level test asserts both roles render a timestamped footer.
- [Hover-reveal hides discoverability on desktop] → Standard, expected pattern; footer also reveals on focus, and touch shows it always.

## Carried findings (adjacent, from shipped commit e092459)

A fresh review of the already-shipped `SuggestedActionChips` fix surfaced hardening gaps tracked in tasks §9 — they touch the pill row (not this change's footer) but sit in the same chat-message affordance area: (a) the `save_to_account` chip label is untested and a `saveGate` mock fixture (`"💾 Save to account"`) no longer matches runtime; (b) the chip's ellipsis works only because the label span is a **direct flex child** (blockified) of the `inline-flex` chip — a fact no unit test can guard (jsdom has no layout), so a markup refactor could silently regress truncation, warranting a Playwright guard + an in-code comment; (c) the pill row's `textTransform: uppercase` applies to every pill action including non-anchored nav offers — confirm that's intended. The footer components built here will reuse the same reveal/overflow patterns, so the same "jsdom can't measure layout → browser/e2e verify" rule applies to `MessageActions`.

## Migration Plan

Pure frontend, no persisted-state change → no migration, no rollback data concern. Ships behind normal deploy; revert = revert the commit.

## Drift-prevention / proof

- `no-hardcoded-styles.test.ts` proves greyscale uses tokens (command: `npm --workspace app test`).
- New `MessageActions.test.tsx` / `CopyButton.test.tsx` / `formatMessageTime.test.ts` assert behavior; `ConversationFlow`/`useConversation` suites prove both roles get a timestamped footer.
- `widget-contract.test.ts` stays green (these are `components/conversation/`, outside the widget slots, so README/mode-prop/tools contract does not apply — same status `AnswerActions` had).

## Open Questions

_none_
