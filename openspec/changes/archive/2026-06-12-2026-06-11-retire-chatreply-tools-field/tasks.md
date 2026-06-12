# Tasks — retire-chatreply-tools-field

- [x] 1. **Failing user-visible test first** (SEQUENTIAL). In
  `app/src/api/chatSessions.test.ts`, assert the wire contract no longer
  carries the dead field: a representative reply WITHOUT a `tools` key
  parses successfully against the shared `chatReplySchema`, and
  `"tools" in chatReplySchema.shape` is `false`. Run it — it MUST fail
  (today `tools` is a required array, so the tools-less fixture fails to
  parse). _Gate: test exists, is red, and asserts the user-visible parse
  boundary (not a seam)._
- [x] 2. **Implement** (SEQUENTIAL). Remove `tools` from `chatReplySchema`
  (`shared/src/index.ts`); delete every `tools: []` reply-envelope literal
  in `middleware/src/services/ragPipeline.ts` and `structuredHandler.ts`;
  drop the `tools: []` key from app test fixtures
  (`makeFakeApi.ts`, `ChatColumn.test.tsx`, `OnboardingShell.saveGate.test.tsx`,
  `ConversationFlow.test.tsx`, `useConversation.test.tsx`,
  `intentFixtures/fixtures.tsx`, `chatSessions.test.ts`). Do NOT touch the
  LLM-request `tools` parameter (`requestBody.tools` in `ragPipeline.ts`),
  `*.tools.ts` widget specs, or the widget-descriptor `tools: []` fixture in
  `scopedViewerWidget.test.ts` (different surface — kept).
  Task-1 test goes green. _Gate: `rg '\btools: \[\]'` over reply envelopes
  returns nothing; `npm run build` green in shared, middleware, app (Eq
  guards prove no fork)._
- [x] 3. **Spec delta + validate** (SEQUENTIAL). Delta in
  `specs/chat-routing/spec.md` (REMOVED routeChat-invokes-tools; MODIFIED
  chat-wire-types scenario field list). Run
  `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict`.
  _Gate: validate passes; delta header names match the durable spec
  verbatim._
- [x] 4. **Adversarial review** (SEQUENTIAL). Falsify every claim against
  code: confirm no remaining reader/writer of `reply.tools` (14-method
  discovery, not single grep — include `.tsx`, fixtures, DB layer, e2e);
  confirm the surviving requirements actually cover the removed one's
  live scenario (`show_extraction` routes via `intents[]`/chips today);
  full `app` + `middleware` vitest suites green; no cross-plan collision
  on `shared/src/index.ts` with the other in-flight changes. _Gate:
  review written up against plan AND real code; any finding → back to
  in-progress._
