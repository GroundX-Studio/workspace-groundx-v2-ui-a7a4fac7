# Spec Delta — app-architecture

## ADDED Requirements

### Requirement: Calendly scheduler SHALL be a session-scoped viewer widget

The booking scheduler SHALL mount through the existing session-scoped
`BookCallView` viewer widget, not as a duplicate content-scoped
`ScopedViewerWidget`. The widget SHALL accept the standard `role:
WidgetRole` and required `scope: WidgetScope` props and SHALL declare
`scope: { type: "none" }` at mount sites because booking a call is not tied to
a document, bucket, group, project, template, or generated result.

The app SHALL expose one browser-safe Calendly configuration value at
`APP_CONFIG.calendly.url`, sourced from `VITE_CALENDLY_URL`. `BookCallView`
SHALL use that app config value by default instead of reading
`import.meta.env` directly.

`BookCallView` SHALL use Calendly's advanced inline embed API by loading
`https://assets.calendly.com/assets/external/widget.js` and calling
`Calendly.initInlineWidget({ url, parentElement })` with a real owned parent
inside the viewer pane. When the URL is unset, it SHALL render an inline
placeholder instead of a broken empty embed.

At phone widths where Calendly's inline layout clips event details,
`BookCallView` SHALL render an external Calendly action using the same
configured URL instead of mounting the inline iframe.

`BookCallView` SHALL own trusted `calendly.event_scheduled` postMessage
handling from `https://calendly.com` or a Calendly subdomain and expose the
scheduled event to its host through a callback. The chat-side
`BookingStatusCard` SHALL remain a status/back affordance and SHALL NOT own
Calendly iframe events.

#### Scenario: Book-call intent mounts the scheduler in the viewer

- **GIVEN** the app dispatches `{ kind: "openBookCall" }`
- **WHEN** the shell observes `?bookCall=1`
- **THEN** it mounts `BookCallView` with `scope: { type: "none" }`
- **AND** the chat column mounts `BookingStatusCard`.

#### Scenario: Nav CTA uses the same viewer path

- **GIVEN** the user clicks "Book a call" in the OnboardingNav
- **WHEN** the handler runs
- **THEN** the URL gains `bookCall=1`
- **AND** the in-app booking viewer mounts
- **AND** no new browser tab is opened.

#### Scenario: Scheduled event commits the engineer-call gate

- **GIVEN** `BookCallView` is mounted
- **WHEN** Calendly posts `calendly.event_scheduled` from a trusted Calendly origin
- **THEN** the shell commits the gate with method `engineer-call`
- **AND** it clears `bookCall=1` so the call-requested state is visible.

#### Scenario: Direct book-call URL mounts the booking surface

- **GIVEN** the user lands on `/onboarding?bookCall=1`
- **WHEN** the shell renders
- **THEN** the F1 picker overlay does not mask the booking surface
- **AND** `BookCallView` and `BookingStatusCard` are visible.

#### Scenario: Phone width uses the external Calendly action

- **GIVEN** the viewer is rendered below the phone breakpoint
- **WHEN** `BookCallView` has a configured Calendly URL
- **THEN** it renders an "Open calendar" action with that URL
- **AND** it does not initialize the inline Calendly iframe.

#### Scenario: Untrusted scheduled event is ignored

- **GIVEN** `BookCallView` is mounted
- **WHEN** another origin posts `calendly.event_scheduled`
- **THEN** the scheduled callback is not invoked.
