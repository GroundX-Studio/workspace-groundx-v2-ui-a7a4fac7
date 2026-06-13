# No LLM tools — GateChatPanel

## Why

`GateChatPanel` is a legacy status-driven dispatcher + composing-animation
wrapper, not an LLM-drivable affordance. It reads `gate.status` off the
onboarding session and renders one of three historical surfaces (idle
placeholder / typing indicator / `GateChatRail`). The live sign-in path now
uses `SignUpWidget` in the viewer and keeps `ConversationFlow` mounted.

Giving the legacy panel its own tool would duplicate retired surface area with
no added expressivity.
