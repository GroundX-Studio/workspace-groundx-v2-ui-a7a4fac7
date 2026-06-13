# Add Calendly scheduler viewer widget

## What

Replace the nav-level Calendly bypass with the existing session-scoped
`BookCallView` viewer widget, upgraded to Calendly's advanced inline embed for
desktop/tablet layouts. Both the `book_call` intent and the OnboardingNav
"Book a call" CTA will set `?bookCall=1`, letting the shell mount the same
viewer overlay on top of the active viewer while the normal chat timeline
stays mounted. Phone-width layouts use the same configured
Calendly URL as an external action so Calendly's narrow inline layout does
not clip the event details.

## Why

The current architecture already has the right composable mechanism:
`openBookCall` -> URL state -> active-viewer `BookCallView` overlay. The nav
CTA bypasses that mechanism by opening `VITE_CALENDLY_URL` in a new tab, and
the viewer still reads `import.meta.env` directly. This change makes Calendly
configuration a first-class app config value and keeps session-scoped booking
outside the content-scoped `ScopedViewerWidget` registry.

## Scope

- Add `APP_CONFIG.calendly.url`, sourced from `VITE_CALENDLY_URL`.
- Upgrade `BookCallView` to load Calendly's advanced inline widget into an
  owned parent element at usable inline widths.
- Use an external Calendly action at phone widths to avoid a clipped inline
  third-party surface.
- Keep `BookCallView` session-scoped with `scope: { type: "none" }`.
- Route the OnboardingNav "Book a call" CTA to the in-app viewer.
- Move `calendly.event_scheduled` handling to the viewer widget and keep
  booking narration in the normal conversation stream.
- Update CSP to allow Calendly's advanced embed script/style assets.
- Update the committed example Calendly URL and local app env.

## Out Of Scope

- Hiding the CTA when Calendly is unset.
- Auto-opening Calendly on raw model classification without user chip
  confirmation.
- Converting the scheduler into a content-scoped `ScopedViewerWidget`.
