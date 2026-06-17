# START HERE — standardized-viewer-control (TRANSIENT handoff note)

> ⚠️ **DELETE THIS FILE when the change is finished** — every box in `tasks.md`
> checked and fully verified. This is a temporary handoff note, NOT part of the
> plan. Removing it is the last step of closeout (it is also listed as a task at
> the bottom of `tasks.md`). Do not let it linger in the repo.

## Read these first — before writing any code
1. **Your memory** — the index, then these in full:
   - `project_frame_retirement_coupling` (why the rest is ONE coupled change)
   - `project_publish_protocol` (how to commit/ship — never `git push`)
   - `feedback_composable_architecture`, `feedback_tdd_mandatory`,
     `feedback_adversarial_review_per_task`, `feedback_plain_english`
   - and recall anything else relevant.
2. **The plan** — `design.md` and `tasks.md` in this folder.
3. **Engineering practices** — `scaffold/docs/agents/principles.md` and `discipline.md`.
4. **The GroundX Studio harness guides** — for web-UI work and for design standards.

Then say, in plain English, where things stand and what you'll do first, and wait
for the user's OK before coding.

## Where we are
- **Done and committed** (commit `8b85dd2` on `workspace/groundx-v2-ui`):
  - **T1** — the cornerstone test (clicking a category pill re-focuses the live
    Extract screen).
  - **T4** — the Extract "focused category" now lives on the viewer step, changed
    only through the one dispatch path; the old `setFocusedCategory` / overlay
    field / `?focus=` URL steer are gone.
  - **T9** — the Statement/Meters/Charges pills go through that same dispatch path.
- **Next: "Phase A" of retiring the frame machine.** It is ONE coupled change, not
  small independent steps — read `project_frame_retirement_coupling` for the reason
  and the recommended order:
  1. Foundation, done in order by hand: add the `showInteract` intent and wire the
     "Interact" pill to it; make every `show*` handler move the canvas in BOTH the
     guided walkthrough and the signed-in app (no fork); re-source the step strip
     from the active step instead of the old frame.
  2. The 36-site `advanceFrame` → dispatch migration as a workflow (one isolated
     worker per screen), then delete the old frame machine.
  3. The cross-cutting pieces (resume/persistence, the chat→model context, the
     replay fixtures, the telemetry event).
  4. The clickable-affordance work (let the assistant offer a viewer action as a
     follow-up chip or inline link).
  5. Lock it down (guard test, full verification, one hostile review + a live
     browser spot-check).

## Ground rules (all captured in memory)
- Write the failing test first.
- Do an adversarial self-review after each task — against the plan AND the code.
- Commit each green checkpoint through the `groundx-studio` connector (drive its
  `server.mjs` directly if the tools aren't attached — never `git push`).
- Explain everything in plain English, no jargon.

## Settled product decisions from the prior session
- Auto-advancing to the Extract screen when the "Understand" reading finishes
  STAYS — just routed through the one dispatch path.
- It is fine for the currently-dead shared buttons (e.g. Extract's "Try asking a
  question →", which does nothing for signed-in users today) to start working;
  add tests so that behavior is on purpose.
