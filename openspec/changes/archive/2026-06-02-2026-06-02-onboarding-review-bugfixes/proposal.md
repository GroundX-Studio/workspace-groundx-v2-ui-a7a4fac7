# Fix the onboarding-review bugs (#7, #8, #9)

## Why

The 2026-06-02 onboarding interactive review filed three defects that are NOT
backlog and NOT blocked — they are live bugs in shipped surfaces, so they're
fixed here (the six `backlog`/`blocked` issues #1–#6 are explicitly out of scope):

- **#7 (P1, severity:high)** — the Interact chat 502s on EVERY question. The RAG
  search filter composes `rbacFilter {projectId:{$in:[…]}}` `$and`
  `scopeFilter {projectId:"…"}` → GroundX 400 "cannot query more than 1 data type
  per key." Breaks all RAG chat. Root-caused: `composeFilters` (`groundxSearch.ts`)
  `$and`s two clauses on the same `projectId` key with different value shapes
  (`compileScopeFilter` emits a single value as `{field:v}`, the rbac filter uses
  `{$in:[…]}`). Also blocks re-reviewing F5 (Interact answer + cite-jump).
- **#8 (severity:low)** — on a clean anon `/onboarding` load, the chat-session
  bootstrap fires failing requests that self-heal: `POST /api/chat-sessions → 401`
  (then a retry → 200) and `PATCH /api/chat-sessions/<id> → 404` (patch before the
  row exists). Console errors + wasted round-trips every load.
- **#9 (severity:low, visual)** — picking the sample shows the canvas at F3 with
  final extracted values while the chat still narrates the F2 reading stream
  ("parsing layout… thinking…"); the F2 reading/scanner beat is barely shown.
  (Confirm real desync vs transient before fixing — see tasks.)

## What Changes

- **#7 — key-valid filter composition.** Replace the naive `$and` of `rbacFilter`
  + `scopeFilter` with a **key-aware merge**: for any key both constrain
  (`projectId` today), INTERSECT the allowed value sets into a SINGLE clause
  (`{key:v}` for one, `{key:{$in:[…]}}` for many, `{key:{$in:[]}}` = deny-all when
  disjoint); keys in only one side pass through; multiple distinct keys still
  `$and`. The composed filter then carries each key once → GroundX accepts it.
  Add a regression test (composed filter is single-constraint-per-key + the
  sample-onboarding RAG search succeeds), and live-re-verify the chat returns a
  grounded answer with citations. Then re-review F5 (was blocked by #7).
- **#8 — clean anon bootstrap.** Ensure the anon session (cookie/CSRF, via the
  existing `csrfFetch`/`bootstrapCsrfToken` + session establishment) is in place
  before the first `POST /api/chat-sessions`, and that the session row is created
  BEFORE any dependent `PATCH`. No 401/404 on a fresh load.
- **#9 — F2 reading sync.** Confirm the desync at runtime; if real, hold the
  canvas on the F2 doc-viewer/scanner until the ThinkingStream `onDone`
  (`advanceFrame("f3")`) fires, so the canvas and chat narration agree. If it's a
  transient screenshot-timing artifact (the thinking notes persist as a chat
  transcript after the real advance), downgrade + close #9 with evidence.

## Impact

- Code: `middleware/src/services/groundxSearch.ts` (#7 merge) + its test;
  `app/src/contexts/ChatStoreContext/*` / `api/chatSessions.ts` / `csrfFetch.ts`
  (#8 ordering) + tests; `app/src/conversation/experiences/onboarding/experience.tsx`
  / canvas projection (#9, only if confirmed) + test.
- Specs: `chat-routing` (ADDED — key-valid filter composition); `conversation-flow`
  (ADDED — clean anon bootstrap). `#9` spec impact (`ui-views`) added only if the
  desync is confirmed real.
- OUTCOME: closes #7 (P1, fixed + shipped). #8 reverted + deferred (both fixes
  disproportionate to its self-healing severity — see issue #8); its
  conversation-flow delta was dropped from this change. #9 confirmed NOT a bug
  (closed). So this change ships ONLY the #7 chat-routing fix.

## Out of scope

Issues #1–#6 (all `backlog`; #2/#3 also `blocked`) — Loan/Solar seeding, BYO
upload stamping, F7 Integrate, steady-mode audit, per-entry session, WF-05
word-level highlight. Not touched here.
