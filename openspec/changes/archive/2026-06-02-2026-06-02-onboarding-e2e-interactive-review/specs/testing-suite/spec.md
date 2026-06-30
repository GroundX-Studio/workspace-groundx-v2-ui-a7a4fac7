# testing-suite Specification (delta)

## ADDED Requirements

### Requirement: An interactive inspection sweep SHALL complement the Playwright structural suite

The onboarding experience SHALL be periodically exercised by an interactive
inspection sweep, using Chrome DevTools MCP as the inspector, that catches visual
defects and incidental control bugs the Playwright structural suite does not. The
sweep SHALL enumerate and exercise every interactive control on every onboarding
surface (F1–F7 plus the step strip, nav rail, and compact-mode chrome) at the
supported viewports (desktop, tablet, mobile). For each surface it SHALL assert no
new console error or warning, no unexpected failed network request, no horizontal
overflow / clipped / overlapping / zero-size control, and no visual defect. It
SHALL run against real GroundX + a real LLM and MUST exclude live-data / LLM
variance from findings. Each confirmed finding SHALL be filed as a labeled GitHub
Issue (`bug` | `visual` + `area:*` + severity) rather than fixed in place.

#### Scenario: Interactive sweep exercises every control and logs defects

- **WHEN** the onboarding interactive inspection sweep runs at desktop, tablet, and mobile viewports
- **THEN** every interactive control on every onboarding surface (F1–F7 + step strip / nav / compact chrome) is exercised
- **AND** each surface is checked for console errors, failed network requests, horizontal overflow, and visual defects
- **AND** every confirmed defect (excluding live-data / LLM variance) is filed as a labeled GitHub Issue with reproduction steps + evidence
- **AND** the run reports a surface × viewport coverage table proving no surface was skipped
