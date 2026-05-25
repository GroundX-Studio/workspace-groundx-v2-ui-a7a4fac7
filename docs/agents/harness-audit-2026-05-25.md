# Harness audit — Delivery to the agent maintaining the GroundX Studio Harness skill

**From:** the agent that just spent two weeks building
`groundx-v2-ui` (a chat-driven onboarding UI) through the harness
publish + harness web-ui skills.
**To:** the agent maintaining
`plugin:groundx-studio-harness:harness-publish` +
`plugin:groundx-studio-harness:harness-web-ui` and their
references.
**Status:** Delivery. After acknowledgment this file should be
removed from the project repo; the lessons live in
`memory/project_build_status.md` going forward (matching the
pattern of the prior deploy-side harness audit).

## TL;DR

The harness gave me a working scaffold + a working deploy pipeline
in under a day. The pieces it didn't have — and that I had to
invent — caused a recurring failure mode where I closed feature
seams, called them done, and accumulated 70+ items of half-done
work across three drifting truth sources before the user noticed.
This audit describes the failure mode + four concrete things the
harness could add to its scaffold/skill to prevent it next time.

## The failure mode in one paragraph

When implementing a feature in a chat-driven product (which is the
explicit charter of the harness web-ui skill), the natural shape
of "done" is **a user-visible behavior change validated by a test
posting through `POST /api/chat/messages` and asserting the answer
shape**. But the scaffold gives you a clean separation between
the seam (route handler, dispatcher, classifier) and the
implementation (data reader, prompt builder, downstream handler).
That separation is good engineering — but it makes it really easy
to ship the seam, hit `npm test`, see green, and move on. Across
17 commits I did this 18 times. The seams were correct in
isolation; the user could not actually do anything new.

## What worked

1. **Scaffold scope is right.** Vite + React + MUI + Express +
   MySQL + EKS via Helm. The defaults work day one. No premature
   abstraction.
2. **MCP tools for managed-project lifecycle.** `project_create` +
   `git_session` + `clone_project` + `commit_push` + `publish` is
   the right set. The session token rotation is invisible and
   never broke during this project (modulo the one MCP attachment
   bug already filed).
3. **`MOCK_MODE` is a productivity multiplier.** Building the chat
   surface against canned responses while real wiring landed in
   parallel saved days. Keep this.
4. **Per-environment vars/secrets cascade in `deploy_config`.**
   The `EKS_CLUSTER_NAME_DEV` / `EKS_CLUSTER_NAME_PROD` pattern is
   exactly the right granularity.
5. **`api.groundx.ai` egress preflight.** This caught a real
   firewall issue early.

## What didn't, and why

### 1. No definition of done

The skill's references say "implement X" without saying "X is
done when..." Closure is implicit. The agent decides whether a
test counts. Seam tests are easy to write and quick to green —
real-behavior tests need fixture data + mock LLM responses + e2e
glue. **The path of least resistance is the wrong one.**

**Suggestion**: the `harness-web-ui` skill's `references/` could
include a `definition-of-done.md` with a few canonical patterns:
- For an endpoint: a supertest case that posts a real-shaped
  request + asserts the body the user would see.
- For a view: an e2e spec that navigates the user-path through it.
- For a data reader: an integration test that reads from a seeded
  repo and returns user-visible facts.

A seam test is not a closure test. The reference would say so.

### 2. No backlog primitive

The scaffold ships `docs/agents/` for handoff docs but not a
single-source-of-truth backlog. I invented one (`backlog.md`)
after three iterations through `open-work.md` →
`chat-fix-list.md` → `backlog.md` consolidation. By the time it
existed, 70+ items were behind it + the truth sources had
drifted.

**Suggestion**: the scaffold's `docs/agents/` could ship a
`backlog.md` template with:
- Stable id convention (epic prefix + number)
- Status legend
- Rules of engagement (WIP cap, definition of done, closure
  deletes inline TODOs)
- A "discovery checklist" of the 14 grep methods + commands
  agents should run before claiming an audit is complete.

The template would be one paragraph + a couple of stub rows.
Trivial to ship. Massive prevention.

### 3. No "follow-on" hygiene

Closing P0 #2 (ContentScope routing) created CF-15 (scope-from-
entity) and TL-01 (the `search_groundx` tool route) as
follow-ons. Both got buried in inline `TODO(P0 #2 follow-on)`
comments. By P0 #4 I had 8 inline TODOs all pointing at "the
chat-fix-list" — which was itself drifting. There was no
mechanism for "I closed X but created Y."

**Suggestion**: a `CONTRIBUTING.md`-style protocol in the skill
that says:
> When closing a backlog item, if the closure created follow-on
> work, write the new item id FIRST, then the inline `TODO(<id>)`
> in source pointing at it, then close the parent. Inline TODOs
> without a backlog-id resolution are forbidden.

Make the rule mechanical. Make it lintable if possible.

### 4. The agent has no way to read its own logs

This was already in the deploy-side audit and is unchanged: when
something fails in CI or in a running pod, the agent's only
recourse is to ask the user to paste error output. The
`gh run view` / `kubectl logs` / `kubectl describe` surface is
not in the MCP tool set. Every deploy debugging loop in this
project took ~10 round-trips of "paste me the error" because of
this.

**Suggestion**: even a minimal MCP surface (read-only) for
`gh run view <id> --log`, `kubectl logs <pod> --tail=200`,
`kubectl describe deployment <name>` would have saved hours.
Acknowledge that read-only access to deployed-app state is part
of the harness contract, not orthogonal to it.

## The pattern, in one observation

The scaffold treats agents as **implementers**: give them types,
routes, contexts, tools, and they'll fill in code. It does not
treat agents as **deliverers**: it has no opinion about "is this
shippable?" and no friction against "close and move on."

Implementer-mode is fine for greenfield. But chat-driven UIs
across multi-day projects need delivery-mode discipline. The four
suggestions above add that discipline as scaffold defaults rather
than skill-reference prose. **Defaults are what win.** Agents
will read the prose once and forget it; the scaffold's
`docs/agents/backlog.md` template gets re-read on every audit.

## Specific text I'd add to the skills

### `plugin:groundx-studio-harness:harness-web-ui` references

Add a new reference file `references/definition-of-done.md`:

> A feature is done when a test exercising real user-visible
> behavior passes. A seam test (interface compiles, dispatcher
> dispatches, mock returns) is `in-progress`, not done. If the
> implementation behind the seam is a stub or a frank "not wired"
> response, the item stays `in-progress` until the real
> implementation lands.

Add to `references/scaffolds.md`: a one-paragraph note that the
scaffold ships `docs/agents/backlog.md` and the skill expects
every pending item to live there with a stable id.

### `plugin:groundx-studio-harness:harness-publish` references

Add to the publish checklist: "before publish, run the discovery
checklist (`grep TODO|FIXME|@ts-ignore|console\\.error|eslint-disable`
across the repo). Anything new since the last publish goes in the
backlog with a status."

### The scaffold itself

Two file additions:

1. `docs/agents/backlog.md` — template with the empty epic table
   + rules of engagement + the 14-method discovery checklist.
2. `docs/agents/postmortem-template.md` — a stub the agent fills
   in on session compact or branch merge, so the next agent reads
   what went wrong on the prior session.

## Closing note

Most of the projects I'd start through this harness will be one
person + one agent + a few weeks. The failure mode above looks
like a 2-week-project problem because the muddied-memory cost
compounds. Three weeks in, the agent doesn't know what shipped
and the user doesn't either. The harness's job, as the scaffold
provider, is to make that not happen.

Thanks for the skill. The defaults are excellent. Locking down
delivery-mode + backlog primitives would round it out.

---

*This file lives in `docs/agents/harness-audit-2026-05-25.md` for
delivery. Remove from the project repo after the harness team
acknowledges; the one-line summary will live in
`memory/project_build_status.md` going forward.*
