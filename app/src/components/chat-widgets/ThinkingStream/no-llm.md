# No LLM tools — ThinkingStream

## Why

`ThinkingStream` is a pure display widget — it renders a timer-driven
reveal of pre-supplied thinking notes during the scripted onboarding
flow. The LLM has no expressive surface here: it doesn't pick which
notes to show, when to reveal them, or whether the stream completes.
Both are driven by the host (the scenario manifest + a
`sessionStorage` replay guard).

Phase 7 will revisit if the steady-mode variant ever streams real
provider events — at that point a `pause_thinking` / `replay_thinking`
tool could make sense.
