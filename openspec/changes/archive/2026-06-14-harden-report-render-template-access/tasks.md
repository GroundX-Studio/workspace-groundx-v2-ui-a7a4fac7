# Tasks — harden-report-render-template-access

- [x] **T1 — Shared access rule + render-path enforcement (failing tests first).**
  Add `services/reportTemplateAccess.ts` exporting
  `reportTemplateAccess(record, callerUsername) → { accessible, owned }` (report
  kind + sample-or-own; anon empty-username never "owns"). Apply it in the render
  endpoint's `getTemplate`: load only when `accessible`, else `null`. Failing
  tests: (a) predicate unit test over all branches (sample→accessible/not-owned,
  own→accessible+owned, other-member→inaccessible, non-report→inaccessible, anon
  empty-username→not-owned); (b) render endpoint — an anon caller requesting a
  MEMBER-owned template id renders the empty/no-template state, NOT that
  template's sections.
  - ↳ Review: anon can render the PUBLIC sample but not a member template; the
    inaccessible case is indistinguishable from no-template (no existence leak).

- [x] **T2 — Builder GET endpoint uses the shared helper (parity).** Replace the
  inline `isSample`/`isOwn` in `GET …/reports/template/:id` with
  `reportTemplateAccess`; keep the `owned` flag from it. The existing GET access
  tests stay green (behavior-identical).
  - ↳ Review: one access rule, two callers; GET 404 + owned semantics unchanged.

- [x] **T3 — End-to-end + spec + close.** Re-point the existing render-contract
  tests (which seed a `"owner"`-owned template rendered by an anon agent) to the
  public sample owner (`SAMPLE_TEMPLATE_OWNER`) — the realistic anon-render case —
  so they exercise an ACCESSIBLE template. Apply the smart-report spec delta. Full
  middleware suite + tsc + `validate --strict` green. Adversarial review: both
  read paths share one rule; the render IDOR is closed; no existence leak; the
  write-side guard is untouched.
