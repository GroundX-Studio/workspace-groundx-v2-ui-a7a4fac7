# No LLM tools — BookCallView

## Why

`BookCallView` is the Calendly iframe wrapper. The booking action
happens INSIDE the iframe (a third-party origin); the widget has no
in-app action of its own beyond mounting/unmounting the iframe based
on `?bookCall=1` in the URL. Letting the LLM "drive" Calendly would
require cross-origin scripting, which is correctly forbidden.

Phase 7 may pair this with a `BookingStatusCard`-side `book_call()`
tool that ROUTES the user here (i.e., adds `?bookCall=1`), but the
viewer surface itself stays opt-out.
