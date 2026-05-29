# No LLM tools — SignUpWidget

## Why

`SignUpWidget` is the F6 sign-up form. Identity actions (email entry,
magic-link request, password submit) are user-driven and security-
sensitive by definition — the LLM driving "sign up as foo@bar" is a
straight authentication-fraud vector. The widget intentionally exposes
no LLM-callable surface.

The closest legitimate tool would be `prompt_signup()` ("the LLM
detected the user wants to save and recommends signing in"), but that
belongs on a higher-level widget (the gate rail) since the prompt is
about WHEN to mount the sign-up surface, not WHAT to do once mounted.
Phase 7 may explore this; the form itself stays opt-out.
