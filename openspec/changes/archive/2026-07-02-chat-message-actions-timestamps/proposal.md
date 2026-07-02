## Why

Chat messages today carry no per-message affordances except a single colored 📌 pin emoji floating under assistant answers — it reads as janky, is assistant-only, and there is no way to copy a message or see when it was sent. Modern chat UIs (e.g. ChatGPT) attach a subtle, greyscale action row + timestamp to each message that reveals on hover (desktop) and is persistent on touch. This change brings the conversation view to that bar.

## What Changes

- Every real chat bubble (user turns; assistant turns with content) gains a **footer row**: greyscale action icon-buttons + a timestamp, aligned to the message's side (assistant left, user right).
- **Reveal behavior**: desktop hides the footer and fades it in on hover of that message and on keyboard focus-within; touch devices (`@media (hover: none)`) show it persistently.
- **Assistant footer**: Copy + timestamp, plus Pin-to-report **only on `pinnable` turns** (genuine document answers — booking/narration/error turns are not pinnable, so they show copy + timestamp only). **User footer**: Copy + timestamp.
- **Copy** copies the message text with trailing inline citation markers (`[N]`) stripped, so an assistant answer copies clean prose rather than `…2025.[1] The…` (targeting only citation markers, not arbitrary bracketed digits in prose).
- **Greyscale, not color**: footer glyphs are monochrome muted-grey. Because color-emoji (📌, clipboard) ignore CSS `color`, the pin and copy glyphs MUST be recolorable **icons** (MUI outlined icon / inline SVG using `currentColor`), not emoji — the pin drops the colored 📌 for a greyscale pin icon; copy is a greyscale icon; timestamp is muted grey.
- **Timestamps**: shown as `11:33 AM` for a message sent today, `Jul 1, 11:33 AM` once it is not today. Rendered `LiveTurn` gains a numeric `timestamp`. Freshly-sent turns stamp the client `Date.now()`; the server-persisted send time is authoritative and replaces it on hydrate. The GET `/messages` response ALREADY carries the persisted send time as **`createdAt`** (an ISO string, via the `{...m}` row spread of `ChatMessageRecord.createdAt`) — but the app-side hydration DTO does not declare it. This change types `createdAt: string` onto the DTO and parses it to the numeric turn `timestamp`; consuming the already-emitted field means genuinely **zero** middleware change (a test pins that `createdAt` stays on the wire).
- **New components** under `components/conversation/`: `MessageActions` (footer container — reveal + alignment + layout) and `CopyButton` (clipboard copy + transient "Copied ✓"). The compact `PinToReportAction` is reused as the assistant pin node, restyled greyscale.
- **BREAKING (internal only)**: `AnswerActions` is removed. Its "1 inline / ≥2 kebab overflow" model does not fit an always-inline icon row; `MessageActions` supersedes it. No public API — the component, its test, and its usage in `chatPrimitives` are deleted, and the stale references to it in `PinToReportAction.tsx` (comment) and `PinToReportAction/README.md` are updated (no dangling mentions, no dead code).
- Scripted onboarding choreography (the "reading…/parsing…" narration) is out of scope — footers attach only to real chat bubbles.

## Capabilities

### New Capabilities
- _none_

### Modified Capabilities
- `conversation-flow`: adds the requirement that each rendered chat bubble carries a per-message footer (greyscale actions + timestamp) with hover-reveal-on-desktop / persistent-on-touch behavior and role-based alignment, and that `LiveTurn` carries a `timestamp`.

## Impact

- **Frontend (app/)**: `app/src/conversation/chatPrimitives.tsx` (bubble rendering wires in the footer), `app/src/conversation/useConversation.ts` (`LiveTurn` gains numeric `timestamp`; all creation/hydration/seed sites populate it — 6+ construction sites; hydrated turns use `Date.parse(createdAt)`), `app/src/api/chatSessions.ts` (`PersistedChatMessage` gains `createdAt: string`), new `components/conversation/MessageActions/` + `components/conversation/CopyButton/`, restyled `components/chat-widgets/PinToReportAction`, removal of `components/conversation/AnswerActions/`. New pure helper `formatMessageTime`.
- **Backend / DB**: **none** — no new column, endpoint, or SSE-envelope change. The GET `/messages` handler already spreads `ChatMessageRecord.createdAt` (an ISO string) onto each row ([app.ts:640](../../../middleware/src/app.ts), [mysqlRepository.ts:996](../../../middleware/src/db/mysqlRepository.ts)); the client simply consumes it. A projection test pins that `createdAt` stays on the wire so a future column-list tightening can't silently drop it.
- **Contracts / gates**: no change to chat-sse-envelope, persistence-round-trip, or citation philosophy. Closure gates: `no-hardcoded-styles.test.ts` (greyscale via tokens), `ConversationFlow`/`useConversation` suites, new component tests. `navigator.clipboard` is the only new browser dependency.
- **Wireframes**: refines the chat column shared across F2–F5 (Understand/Analyze); no new frame.
