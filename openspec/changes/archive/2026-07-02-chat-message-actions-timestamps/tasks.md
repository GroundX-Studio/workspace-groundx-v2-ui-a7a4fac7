## 1. Timestamp helper (pure)

- [x] 1.1 Write failing tests for `formatMessageTime(ts, now)`: same-day → `h:mm A`; prior day → `MMM D, h:mm A`; midnight/day-boundary edge; deterministic (now injected).
- [x] 1.2 Implement `formatMessageTime` co-located with the conversation footer utils; make tests pass.

## 2. Timestamp on the hydration wire (make the incidental emission a contract)

- [x] 2.1 Write a failing test that the GET `/messages` projection emits `createdAt` (the ISO string from `ChatMessageRecord.createdAt`) for a message row (guards the `{...m}` spread against a future explicit-column tightening).
- [x] 2.2 Add `createdAt: string` to the app-side `PersistedChatMessage` DTO + response type (`app/src/api/chatSessions.ts`) — the field is ALREADY on the wire (record spread), just untyped. Make the test pass. (No middleware change.)

## 3. Thread `timestamp` through `LiveTurn`

- [x] 3.1 Write a failing `useConversation` test: a sent user turn + its assistant reply each carry a numeric `timestamp`, AND a hydrated turn carries the persisted send time (not the reload time).
- [x] 3.2 Add required `timestamp: number` to the `LiveTurn` interface; fix the resulting TS errors at every construction site — user turn (:429), streaming placeholders (:481/:617), agent-reveal projection (:399) via `Date.now()`; the hydration map (:357) via `Date.parse(m.createdAt)` off the newly-typed DTO; and `ChatExperience.seedTurns()` + LiveTurn test fixtures. Make the tests pass.

## 4. CopyButton

- [x] 4.1 Write failing `CopyButton.test.tsx`: activating it calls `navigator.clipboard.writeText`; trailing `[N]` citation markers are stripped from the copied text WHILE a bracketed digit in prose (e.g. "option [1]") is preserved; it shows a transient "Copied ✓"; when clipboard is absent it renders and no-ops without throwing.
- [x] 4.2 Implement `components/conversation/CopyButton/` with a recolorable **icon** (MUI outlined / inline SVG on `currentColor`, muted-grey token — NOT a color emoji), the citation-marker-stripping transform, and transient confirm. Make tests pass.

## 5. Greyscale pin

- [x] 5.1 Grep the test suites for the literal `📌` (e.g. `ChatColumn`/`chatPrimitives`/`ConversationFlow`/`PinToReportAction`); update any that assert the glyph to assert by `aria-label`/testid instead.
- [x] 5.2 Update `PinToReportAction` compact variant to a recolorable pin **icon** (MUI `PushPinOutlined` / inline SVG on `currentColor`, muted-grey token — NOT the 📌 emoji); keep queue-mid-stream + transient-confirm behavior. Make the updated tests pass.

## 6. MessageActions footer

- [x] 6.1 Write failing `MessageActions.test.tsx`: renders Copy + timestamp for both roles; assistant footer includes the pin (via `extraActions`) but a NO-pin footer renders when no `extraActions` given; alignment differs by `role`; controls stay mounted/focusable; persistent-on-touch (no-hover) path shows the footer; glyphs are greyscale.
- [x] 6.2 Implement `components/conversation/MessageActions/` (reveal via CSS group-hover/`:focus-within` under `@media (hover: hover)`, persistent under `@media (hover: none)`, with vertical space RESERVED so hover causes no layout shift; side alignment by `role`; layout `[actions…] + [timestamp]`; props `role`/`text`/`timestamp`/`streaming?`/`extraActions?`). Make tests pass.

## 7. Wire into the conversation view + remove AnswerActions

- [x] 7.1 Write a failing `ConversationFlow` (or `chatPrimitives`) test: a user turn and a PINNABLE assistant answer each render a footer with a formatted timestamp (assistant has copy + pin, user has copy); a NON-pinnable assistant turn renders copy + timestamp but no pin; choreography/thinking/tool-activity-only lines render no footer.
- [x] 7.2 In `chatPrimitives.tsx`, render `MessageActions` under `UserBubble` and `BotBubble` (passing `turn.timestamp`, `turn.content`, `role`, and the compact `PinToReportAction` as `extraActions` ONLY when `turn.pinnable === true`); remove the old `AnswerActions` usage. Make tests pass.
- [x] 7.3 Delete `components/conversation/AnswerActions/` and its test (superseded); update the stale `AnswerActions` references in `PinToReportAction.tsx` (comment) and `PinToReportAction/README.md`; confirm no other importers first.

## 8. Closure verification

- [x] 8.1 Dead-code / dead-context cross-check: grep confirms `AnswerActions` has no remaining importers OR doc mentions; `LiveTurn.timestamp` (written at all construction sites, read by the footer) and `PersistedChatMessage.createdAt` (emitted on the wire, read into the hydrated timestamp) each have a live read site — no dead field; no new DB column/endpoint/SSE field introduced (note round-trip N/A in PR).
- [x] 8.2 Run gates green: `npm --workspace app test` (incl. `no-hardcoded-styles.test.ts`, `widget-contract.test.ts`, `recurrence-drift-guards.test.ts`, new component tests, conversation suite), the middleware projection test, and `tsc --noEmit` for app + middleware.
- [x] 8.3 Browser-verify in Chrome DevTools: hover reveals footer with no layout shift (desktop), footer persists under emulated touch/no-hover, both roles aligned correctly, non-pinnable turns show no pin, timestamps format today vs older AND survive a reload, copy strips `[N]` markers, pin is greyscale. Adversarial review of the diff against this spec + real code before marking done.

## 9. Carried hardening — SuggestedActionChips (gaps from shipped commit e092459)

These close review findings on the already-shipped chip-label + chip-UI fix. They live near this change (same chat-message affordance area) but touch `SuggestedActionChips`, not the footer — do them as a small, separable slice.

- [x] 9.1 Add a router test asserting the `save_to_account` mutate chip renders label `"Save to account"` (mirror the existing `book_call` chipLabel test) — the label path is currently only proven for `book_call`.
- [x] 9.2 Correct the stale mock in `app/src/views/Onboarding/OnboardingShell.saveGate.test.tsx` (~:47): the hand-authored `label: "💾 Save to account"` no longer matches real server output (`"Save to account"`, no emoji) — update it so the fixture doesn't misrepresent the runtime chip.
- [x] 9.3 Guard the chip truncation + flush-left/85%-cap behavior that jsdom can't measure. Documented in `SuggestedActionChips.tsx` that `textOverflow: ellipsis` works only because the inner span is a direct flex child (blockified). Added `e2e/onboarding-message-footer.spec.ts` (Playwright): the `book_call` chip renders single-line, within the bubble width, left-aligned, uppercase, and a forced long label stays single-line, stays within the pane, and engages the ellipsis. Same spec also covers the footer reveal (desktop hover) + persistent-on-touch (mobile no-hover) — the §6 reveal behaviors jsdom can't measure. All 3 e2e tests pass.
- [x] 9.4 Confirm the `textTransform: uppercase` on the pill row is intended for ALL pill actions including non-anchored offered-navigation chips (e.g. `→ open the extract` → `→ OPEN THE EXTRACT`), not just the copy/pin/booking CTAs; if nav offers should stay sentence-case, scope the uppercase to CTA chips.
