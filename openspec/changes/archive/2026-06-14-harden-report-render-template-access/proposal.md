# Harden the report render path's template read (close the read-side IDOR)

## Status: IN PROGRESS (2026-06-14)

## Why

The report **render** path loads its template by id with NO access check:

```
getTemplate: async (id) => {
  const record = await repository.getTemplate(id);
  return record ? reportTemplateFromRecord(record) : null;
}
```

The builder's **read** endpoint (`GET …/reports/template/:id`) already access-scopes
identically to a clear rule — anon may read only the public sample; a member may
read the sample or their own; anything else → 404 (existence not leaked). The
render path does not apply that rule, so once members can save private report
templates, the render endpoint could load (and render) another member's private
template by guessing its id — a read-side IDOR. It is harmless TODAY (the only
real template is the public sample) but must be closed BEFORE private member
templates exist. (Sibling to the WRITE-side ownership guard already shipped.)

## What changes

1. **One shared access rule.** Extract the sample-or-own decision into a single
   `reportTemplateAccess(record, callerUsername) → { accessible, owned }`
   (`services/reportTemplateAccess.ts`), used by BOTH read paths so they cannot
   drift. `owned` (caller IS the owner) still drives the builder's fork-on-edit.

2. **Render path applies it.** The render's `getTemplate` returns the template
   only when `accessible`; otherwise `null` → the graceful no-template empty
   render. Non-leaky: an inaccessible template renders identically to a
   non-existent one (no existence signal), matching the read endpoint's posture.

3. **Builder GET endpoint uses the same helper** (behavior-identical refactor —
   its existing tests stay green).

## Non-goals

- No new auth/roles. The rule is the existing sample-or-own predicate, applied
  consistently. Member-owned private templates don't exist yet; this is the
  guard that must precede them.
