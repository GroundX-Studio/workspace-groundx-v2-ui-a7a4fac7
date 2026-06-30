# No LLM tools — BookCallView

## Why

`BookCallView` is the Calendly inline-widget wrapper. The booking action
happens inside Calendly's third-party surface; the widget has no in-app
action of its own beyond mounting/unmounting the scheduler based on
`?bookCall=1` in the URL and reporting Calendly's trusted scheduled event
to the host.

The `book_call()` suggested-action chip routes the user here (adds
`?bookCall=1`), but the viewer surface itself stays opt-out for LLM
tools. Letting the LLM "drive" Calendly would require cross-origin
scripting, which is correctly forbidden.
