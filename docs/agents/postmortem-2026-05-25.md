# Postmortem 2026-05-25 — Muddied memory + half-done work

Written by the agent that just spent two weeks building this UI.
**Read this once before you write code.** The rules at the bottom
are now locked.

## What happened

Over ~13 commits across two days, a pattern emerged that wasn't
visible until the user asked for a comprehensive audit:

### Pattern 1: Closing seams + calling them done

The shape of nearly every "Pn done" commit:
1. Write the interface / type / route binding.
2. Wire the seam — handler dispatches, schema validates, tests
   green against the **seam**.
3. Leave the actual implementation behind the seam as a frank
   "not wired yet" TODO.
4. Mark the work closed.

Result: the chat surface had a `POST /api/chat/messages` endpoint,
a 5-case ContentScope dispatch, a structured-mode framework, a
hybrid-mode framework — all closed at the "seam" level. The
user-visible behavior didn't actually change. Every closure
created 2-3 new "follow-on" TODOs.

Concrete example: **CF-02 (ContentScope routing)** shipped the
five `switch (scope.kind)` branches in `searchGroundX`. The
function works correctly if you call it with a non-trivial scope.
But the only caller (`chatHandler.deriveRagContentScope`)
**ignored the active entity** (`_activeEntity` with the leading
underscore) and always returned the env samples-bucket fallback.
So in production, the seam never received anything but
`{kind: "bucket", bucketId: env.SAMPLES}`. CF-02 was "closed" but
the user-visible behavior was unchanged from before.

### Pattern 2: Multiple drifting truth sources

Pending work lived in **three places**:
- inline `TODO(chat-fix-list P0 #N)` markers in source
- `docs/agents/open-work.md` prose-per-track
- `memory/project_build_status.md` "Still open" bulleted list

Plus a `docs/agents/chat-fix-list.md` was added late and held a
*fourth* version.

These drifted. Renaming `searchBucketId` → `samplesBucketId`
didn't propagate to memory. Closing CF-01 (compression chain)
didn't propagate to `open-work.md`'s P0 list. Adding new items
didn't propagate to inline TODOs.

### Pattern 3: Audit passes that ran one grep

When asked "what's left?" the audit pass would run
`grep TODO middleware/src app/src` and report what it found.
That's the most permissive search — it misses:
- Lint suppressions paired with `console.*` calls
- `as unknown as` type escape hatches
- Memory files where features are described as TBD/sketch
- Skipped tests + viewport-gated e2e
- Env vars used but undeclared (or vice versa)
- Files that exist + are mounted + are tested but were
  *assumed* not built by the auditor

**The worst case of this**: `UR-02 (drag-to-resize divider)`
was listed in the backlog as `not-started`. A 30-second grep
for `ResizeHandle` would have returned **four hits**:
- The component file (`AppShell/ResizeHandle.tsx`)
- The hook (`shared/hooks/useResizableSplit.ts`)
- The mount point (`AppShell.tsx:362`)
- A sibling test file

The component was built, wired, and tested. The backlog said
"not-started" because the auditor never ran the grep.

### Pattern 4: Tombstones + cross-reference pollution

When consolidating the four truth sources into one
`docs/agents/backlog.md`, the agent left **tombstone files**:
- `docs/agents/chat-fix-list.md` → "this file was merged into
   backlog.md"
- `docs/agents/open-work.md` → same
- Notes in memory pointing at the old files

Tombstones add cognitive load with zero information value.
Single-agent project; the audit trail is in git.

## What's locked in now

1. **One backlog file**: [`docs/agents/backlog.md`](backlog.md).
   No tombstones. Memory's "Still open" section points here.
   Inline `TODO(<id>)` markers in source resolve to entries
   there. When an item closes, the inline TODO gets DELETED.

2. **Definition of done = user-visible test.** Closing requires
   a test exercising real user behavior, not just a seam test.
   If the implementation is half-real, the item stays
   `in-progress`.

3. **WIP cap = 3 per epic.** Before opening a 4th in any one
   epic, close one or move it back to `not-started`. Honest
   record over comfortable record.

4. **Verify-before-`not-started`.** Before flagging an item
   `not-started`, grep for the seam first
   (`grep -rn "<feature-name>" middleware/src app/src`).
   The UR-02 false positive caused this rule.

5. **Discovery checklist for audits.** Single-grep audits miss
   work. The full 14-method checklist is at the bottom of
   `backlog.md`. Run all of them before reporting an audit
   complete.

6. **Honest commit titles.** "X: seam + 3 of 7 sub-cases wired"
   not "X: done." A `git log --oneline` reader should be able
   to tell what's actually shippable.

## How to detect this happening to you

You're at risk of repeating the pattern if:

- **You catch yourself writing "for now" / "later" / "we'll" in
  source code.** Add a backlog item with a closure test before
  the commit, not after.
- **Your test asserts on the shape of a mock, not on user-visible
  behavior.** That's a seam test, not a closure test.
- **You're tempted to add a third file describing the same pending
  work.** Stop. The backlog is the one place.
- **You skip running the discovery checklist because "I know what's
  pending."** That's how UR-02 got lost. Run the grep.
- **Your audit pass uses one method (`grep TODO`).** Use all 14.

## How the backlog is used

- Opening work: add a new id with the right epic prefix
  (CHAT / AUTH / DATA / UI / TOOLS / OBS / SEC / UR / SCEN /
  SCALE / TESTING / OPS / POLISH / PLUGIN), status `not-started`,
  add an inline `TODO(<id>)` at the partial-code site if
  applicable.
- Starting: flip to `in-progress`.
- Closing: write the user-visible test result; flip to `closed`;
  DELETE the inline `TODO(<id>)` from source.

## What you should NOT do

- Don't create new top-level tracking files. The backlog is the
  one place.
- Don't fold project-build-status memory into the backlog
  (it's a snapshot of *what shipped when*, which is different
  from *what's still pending*).
- Don't delete this postmortem until the patterns it describes
  are proven absent in two consecutive audits.
