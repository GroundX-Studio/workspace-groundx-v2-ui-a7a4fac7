## ADDED Requirements

### Requirement: Each real chat bubble SHALL carry a per-message footer of greyscale actions plus a timestamp

Every rendered user turn and every assistant turn WITH non-empty content SHALL render a footer row beneath its bubble containing zero-or-more action controls followed by the message's timestamp. The footer SHALL align to the message's side: the assistant footer left-aligned under the left-aligned bubble, the user footer right-aligned under the right-aligned bubble. The Pin-to-report control SHALL appear ONLY on `pinnable` assistant turns (genuine persisted document answers); non-pinnable assistant turns (booking, narration, error) SHALL show Copy + timestamp WITHOUT a pin. The scripted onboarding choreography (the "reading…/parsing…" narration), the thinking placeholder, and tool-activity-only lines SHALL NOT render a footer. (Refines the shared chat column of the Understand/Analyze frames F2–F5.)

#### Scenario: Pinnable assistant answer shows copy, pin, and timestamp
- **WHEN** a `pinnable` assistant turn (a genuine document answer) renders
- **THEN** its footer shows a Copy control, the Pin-to-report control, and the message timestamp, left-aligned under the bubble

#### Scenario: Non-pinnable assistant turn shows copy and timestamp only
- **WHEN** an assistant turn that is NOT `pinnable` (e.g. a booking or narration reply) renders
- **THEN** its footer shows a Copy control and the message timestamp, but NO pin control

#### Scenario: User message shows copy and timestamp
- **WHEN** a user turn renders
- **THEN** its footer shows a Copy control and the message timestamp, right-aligned under the bubble

#### Scenario: Choreography and placeholders carry no footer
- **WHEN** the scripted "reading…" narration, the thinking placeholder, or a tool-activity-only line renders
- **THEN** no per-message footer is rendered for it

### Requirement: The footer SHALL be greyscale, using brand tokens only

All footer glyphs (Copy, Pin) and the timestamp SHALL be rendered in monochrome muted-grey using brand style tokens (no hardcoded color/spacing literals). The Copy and Pin glyphs SHALL be recolorable icons (SVG / `currentColor`-driven), NOT color emoji — a color emoji ignores CSS `color` and cannot be made greyscale. The Pin control SHALL therefore NOT render the colored 📌 emoji.

#### Scenario: No colored emoji or style literals in the footer
- **WHEN** the `no-hardcoded-styles` guard runs over the footer components
- **THEN** it passes, and the footer renders the copy and pin as recolorable icons with no colored 📌 emoji

### Requirement: The footer SHALL reveal on hover/focus on desktop and be persistent on touch

On pointers that support hover (`@media (hover: hover)`), the footer SHALL be visually hidden by default and revealed when its message is hovered OR when focus is within the message (keyboard access). On pointers that do not support hover (`@media (hover: none)`, touch), the footer SHALL be persistently visible. Footer controls SHALL remain mounted and focusable regardless of visual reveal state so keyboard and assistive-technology users can reach them.

#### Scenario: Desktop hover reveals the footer
- **WHEN** a user on a hover-capable device moves the pointer over a message
- **THEN** that message's footer fades into view, and hides again when the pointer leaves (unless focus is within it)

#### Scenario: Keyboard focus reveals the footer
- **WHEN** a user tabs focus onto a footer control
- **THEN** the footer is visible and the control is operable

#### Scenario: Touch devices show the footer persistently
- **WHEN** the view is rendered on a device without hover capability
- **THEN** every message footer is visible without any hover interaction

### Requirement: The Copy control SHALL copy the message text

Both the user and assistant footer SHALL expose a Copy control that copies that message's text — with trailing inline citation markers (`[N]`) removed — to the clipboard, and gives transient confirmation ("Copied ✓") that clears after a short delay. The removal SHALL target citation markers (a `[N]` bound to preceding text/punctuation) and SHALL NOT strip arbitrary bracketed digits that are part of the prose. Where the clipboard API is unavailable, the control SHALL render and no-op without error. The control glyph SHALL be a recolorable icon (muted-grey), not a color emoji.

#### Scenario: Copying an assistant answer strips citation markers
- **WHEN** the user activates the Copy control on an assistant message whose text contains inline `[N]` citation markers
- **THEN** the text written to the clipboard has those markers removed, and the control briefly shows a copied confirmation

#### Scenario: Copy preserves bracketed digits in prose
- **WHEN** the user copies a message containing a bracketed digit that is part of the prose (e.g. "option [1]")
- **THEN** that bracketed digit is preserved in the copied text

#### Scenario: Clipboard API absent
- **WHEN** the clipboard API is unavailable and the Copy control is activated
- **THEN** nothing is copied and no error is thrown

### Requirement: Message timestamps SHALL show clock time, adding the date once not today

The footer timestamp SHALL be derived from the message's own time. It SHALL render as clock time (e.g. `11:33 AM`) when the message was sent on the current calendar day, and SHALL prefix the date (e.g. `Jul 1, 11:33 AM`) once the message is not from the current day. Formatting SHALL be a pure function of the message time and the current time.

#### Scenario: Message from today
- **WHEN** a message sent earlier today is rendered
- **THEN** its footer shows only the clock time (e.g. `11:33 AM`)

#### Scenario: Message from a prior day
- **WHEN** a message sent on a previous day is rendered
- **THEN** its footer shows the date and the clock time (e.g. `Jul 1, 11:33 AM`)

### Requirement: A rendered conversation turn SHALL carry its timestamp

The rendered conversation turn (`LiveTurn`) SHALL carry a numeric `timestamp`. It SHALL be populated for freshly-sent turns (client `Date.now()`), for turns hydrated from persistence (parsed from the persisted server send time, which is authoritative), and for seeded/scripted intro turns. The hydration DTO (`PersistedChatMessage`) SHALL declare the persisted send time as `createdAt` (the ISO string already emitted on the GET `/messages` wire), and the hydrated turn's numeric `timestamp` SHALL be derived from it. A test SHALL assert the GET `/messages` response still emits `createdAt` so it cannot silently regress. No new persisted column, endpoint, or SSE-envelope field SHALL be introduced.

#### Scenario: Both roles render a timestamped footer end-to-end
- **WHEN** the conversation renders a user turn and an assistant turn
- **THEN** each turn carries a numeric `timestamp` and its footer displays a formatted time

#### Scenario: The persisted send time survives hydration
- **WHEN** the GET `/messages` response is projected for a persisted assistant turn
- **THEN** the response row includes the persisted `createdAt`, and a hydrated turn's footer shows that time (not the reload time)
