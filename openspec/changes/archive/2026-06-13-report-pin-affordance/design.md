# Design — pin-to-report opt-in + AnswerActions

## A. Root cause (verified)

Render gate is `turn.pinToReport !== false` (chatPrimitives.tsx:225) — opt-OUT,
so every assistant bubble is pinnable unless explicitly marked false. Only error
turns (useConversation.ts:273, 414) and one intro turn (331) set false;
agent-projected narration (line 299-301, `agent-` prefix), seeded intro/
choreography (`seedTurns`), and booking turns never do → they all show the pill.

## B. Opt-in gating

`LiveTurn.pinToReport?: false` → `pinnable?: boolean`. Render gate
`turn.pinnable === true`. `pinnable: true` set ONLY at:
- the `send()` server-reply assistant turn (useConversation.ts ~368);
- DB hydration of NON-error assistant turns (~266) — persisted real answers.

NOT set (never pinnable): agent-projected `agent-` turns (~299), seeded
intro/choreography turns, error turns (~273/414), the thinking/intro turn (~331).

**Why the hydration mint is safe (verified premise).** Marking ALL non-error
hydrated assistant turns pinnable is correct ONLY because `chat_messages` holds
just the user turn + the grounded assistant answer — the chat handler persists
on `POST /api/chat/messages` (app.ts:593-598). Narration (`agent-` ChatStore
projection), scripted intro/choreography (`seedTurns`), and booking turns are
CLIENT-side, never sent through that endpoint → never persisted → never
hydrated. So no narration can arrive via hydration to be over-pinned. T2's gate
TESTS this (hydrate a thread → only genuine-answer turns are pinnable); if a
future change starts persisting narration as an assistant row, the hydration
mint must gain a discriminator — flag it there.

**Naming note:** `pinToReport` is also `ChatStore.pinToReport` (the MUTATION +
`resolvePinTarget`) and the `pin_to_report` tool + orchestrator intent. This
change renames ONLY the `LiveTurn` flag (useConversation + chatPrimitives) — it
MUST NOT touch the mutation/tool/intent.

## C. Compact extensible affordance (`AnswerActions`)

A new INTERNAL component at **`components/conversation/AnswerActions/`** — NOT
`app/src/conversation/`. This location is deliberate and VERIFIED against both
guards: `widget-contract.test.ts` walks ONLY `components/chat-widgets/` +
`components/viewer-widgets/` (its `SLOTS` array) → AnswerActions is NOT a widget,
so the README/sibling-test/mode-prop contract does NOT apply; but
`no-hardcoded-styles.test.ts` walks ALL of `components/` + `views/` → placing it
under `components/` DOES bring token enforcement (which `app/src/conversation/`,
where `chatPrimitives` lives, would NOT — that subtree is walked by neither
guard). Driven by an action LIST:

```ts
interface AnswerAction { id: string; label: string; icon: ReactNode; onSelect: () => void }
// today: actions = [{ id: "pin", … }]
```

Renderer adapts to length (the composable axis — one source of truth, no fork):
- **1 action** → single compact inline icon button.
- **≥2 actions** → kebab (⋯) overflow menu listing them; no call-site change.

Every length: real `<button>`(s) with `aria-label`s, keyboard-focusable + touch
operable (NOT hover-only), design tokens only — enforced because the component
lives under `components/` (see the location note above; `no-hardcoded-styles`
walks all of `components/`).

`PinToReportAction` (the contract-bound chat-widget — README + sibling test +
`.tools.ts` carrying `pin_to_report`) is KEPT, gaining a compact-icon variant;
its existing-or-new resolution logic + a transient "Pinned ✓" are preserved.
`AnswerActions` hosts it as the `pin` action.

**Extension is earned by data:** the ≥2-action kebab branch ships now (so the
axis is real) and is UNIT-TESTED with a synthetic 2-action fixture (not dormant);
adding a real 2nd action later is appending to the list.

## D. Spec delta (smart-report)

ADD "Pin-to-report SHALL appear only on genuine document-answer turns, as a
compact icon affordance" — opt-in gating + the compact, list-driven,
keyboard/touch-accessible control.
