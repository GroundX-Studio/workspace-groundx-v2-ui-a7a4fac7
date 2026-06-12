# Tasks — add-calendly-scheduler-widget

- [x] T1 — Add failing tests and OpenSpec deltas for app config, inline embed,
  CTA routing, event ownership, CSP, and book-call intent wording.
- [x] T2 — Implement `APP_CONFIG.calendly.url`, the advanced inline
  `BookCallView`, and trusted Calendly scheduled-event handling.
- [x] T3 — Route OnboardingNav `call` clicks through the existing
  `?bookCall=1` viewer path and pass the viewer's scheduled callback to
  `commitGate("engineer-call")`.
- [x] T4 — Update the committed/local Calendly URL, CSP allowlist, widget docs,
  air-gap/observability docs, and tool wording.
- [x] T5 — Verify with focused Vitest suites, strict OpenSpec validation, and
  the highest-signal build/test gate that is safe against the current dirty tree.
