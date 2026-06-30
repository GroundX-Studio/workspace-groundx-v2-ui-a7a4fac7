# Tasks — report-pin-affordance

> **STATUS: ✅ COMPLETE — ready to archive.** All tasks done + gated. The
> full-width pin pill is gone; a compact opt-in pin icon renders only on genuine
> answers (`LiveTurn.pinnable === true`) via `components/conversation/AnswerActions`.
> Verified: app suite 1704 green, drift guards 241, tsc clean, `npm run build` ✓,
> `validate --strict` green. Independent of changes 1/2; no churning-file deps.

Independent change. SEQUENTIAL tasks; **each followed by an adversarial-review
gate**; TDD failing-test-first. node 20 (`$HOME/.nvm/versions/node/v20.20.2/bin`).

- [x] **T1 — Failing test first (RED).** `chatPrimitives`/`ChatColumn`: (a) a
  genuine answer turn shows a COMPACT per-answer actions control; (b)
  narration/scripted/booking turns show NONE; (c) the control is a real button
  with an aria-label (keyboard/touch operable), not a full-width pill, not
  hover-only.
  - ↳ **Review:** RED for the right reason (opt-out default still present);
    assertions cover answer-yes / narration-no / a11y.

- [x] **T2 — Opt-in flag.** `LiveTurn.pinToReport?: false` → `pinnable?: boolean`;
  gate `turn.pinnable === true`; set `true` ONLY at the send()-reply +
  DB-hydration (non-error assistant) mints; nowhere else. Rename touches ONLY
  useConversation + chatPrimitives — NOT the `ChatStore.pinToReport` mutation /
  `pin_to_report` tool / orchestrator intent.
  - ↳ **Review:** narration loses it; answers keep it; hydration doesn't over-pin
    (test); the ChatStore mutation is untouched (grep + suites green).

- [x] **T3 — `AnswerActions` compact, extensible affordance.** New internal
  component at **`components/conversation/AnswerActions/`** (under `components/`
  for token enforcement, outside the widget slots — design §C) driven by an
  action list: 1 action → inline icon, ≥2 → kebab menu (renderer keys off length,
  no call-site change). The `pin` action renders the KEPT `PinToReportAction`
  chat-widget (contract intact) in a compact variant; resolution logic +
  transient "Pinned ✓" preserved.
  - ↳ **Review:** `no-hardcoded-styles` ACTUALLY walks the new file (confirm it
    is under `components/`, not `app/src/conversation/`) and is green;
    `widget-contract` green + unchanged (AnswerActions is NOT in a slot;
    PinToReportAction README/test/.tools intact); the ≥2-action kebab branch is
    UNIT-TESTED with a synthetic 2-action fixture (not dormant); adding a 2nd
    action needs NO call-site change.

- [x] **T4 — Spec + close.** Apply the smart-report spec delta (design §D);
  `validate --strict` + app suite + `npm run build` green.
  - ↳ **Review:** final hostile pass — spec matches code; no dormant plumbing;
    `pinnable` has a writer + read site (round-trip).
