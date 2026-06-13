# Spec Delta - conversation-flow

## ADDED Requirements

### Requirement: Sign-in SHALL use the shared conversation timeline

The app SHALL route sign-in, sign-up, save-to-account, export-gate, BYO,
threshold, and book-call handoff flows through the active `ChatSession` and
the shared `ConversationFlow`. These flows SHALL NOT create a second chat
window, replace the chat column with a gate rail, or mount a parallel chat
component.

The chat composition root SHALL receive explicit sign-in overlay activity from
the shell. It SHALL NOT use `gate.status` as a chat mode switch.

UI-click sign-in entries MAY append short scripted assistant turns because no
LLM user turn exists. Chat-router/tool-triggered sign-in entries SHALL preserve
the LLM-generated assistant reply and suggested actions. The client SHALL NOT
replace an LLM answer with a generic tool-status sentence such as "I am opening
the relevant view now."

#### Scenario: F1 sign-up opens chat in the same session

- **GIVEN** the user lands on `/onboarding` with one anonymous onboarding session
- **WHEN** the user clicks **Sign up**
- **THEN** the route changes to `/onboarding/signup`
- **AND** the same `chatSessionId` remains active
- **AND** `ConversationFlow` mounts
- **AND** assistant guidance appears as ordinary assistant turns in the timeline.
- **AND** `GateChatPanel` / `GateChatRail` test handles are absent from the live
  chat column.

#### Scenario: LLM-triggered save gate keeps the model answer

- **GIVEN** the user asks the chat to save their work
- **WHEN** the chat router returns an assistant answer plus an `openGate` intent
- **THEN** the assistant answer renders in `ConversationFlow`
- **AND** the sign-in overlay opens in the viewer
- **AND** no local replacement status panel hides or rewrites the answer.

#### Scenario: Gate lifecycle does not replace chat

- **GIVEN** `gate.status` is `open`, `dismissed`, or `committed`
- **WHEN** the active session is an onboarding session
- **THEN** `ChatColumn` still resolves to `ConversationFlow` after the user has
  entered sign-in or a sample journey
- **AND** `GateChatPanel` is not mounted for live sign-in behavior.

#### Scenario: Sign-in narration is duplicate-suppressed

- **GIVEN** sign-in guidance has already been appended for
  `chatSessionId + trigger + pathname`
- **WHEN** React re-renders, the user refreshes, or browser back/forward
  replays the same route state
- **THEN** the same opener is not appended again.
- **AND** restored chat history is checked before appending a UI-click opener.
