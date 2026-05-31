# No LLM tools — GateChatPanel

## Why

`GateChatPanel` is a status-driven dispatcher + composing-animation
wrapper, not an LLM-drivable affordance. It reads `gate.status` off the
onboarding session and renders one of three surfaces (idle placeholder /
typing indicator / `GateChatRail`). The gate transitions it reacts to
(`openGate` / `commitGate` / `dismissGate`) are user-driven from the
StepStrip, IngestView, and the SignUpWidget — not model-driven.

The only actionable surface in the gate flow is `GateChatRail` (dismiss,
book-a-call, committed success card), and its tools live on
`GateChatRail.tools.ts`. Giving the panel its own tool would duplicate that
surface with no added expressivity.
