# Tasks — groundx-knowledge-prompt

## 1. Failing user-visible test first (SEQUENTIAL)

- [x] 1.1 `middleware/src/services/groundxSkills.test.ts` — failing: routing
      ("air-gapped Kubernetes deploy" → `groundx-on-prem` section; "how does
      X-Ray parse layout" → `groundx-architecture`; "what is the late fee on
      my bill" → no sections), char + section caps, missing-assets-dir
      graceful empty.
- [x] 1.2 `ragPipeline.test.ts` — failing: stubbed LLM captures system prompt;
      GroundX product question → prompt contains `GROUNDX KNOWLEDGE` block
      with vendored content under the cap; document-content question → no
      block; capsule no longer carries product facts (X-Ray description moved
      out).

## 2. Implement (SEQUENTIAL)

- [x] 2.1 `middleware/src/services/groundxSkills.ts` — lazy-loaded section
      index over `middleware/assets/groundx-skills/`, keyword scoring,
      `selectGroundxKnowledge(question, caps)`.
- [x] 2.2 Wire into `callGroundedLlm` in `ragPipeline.ts`; shrink capsule to
      Studio-app framing.
- [x] 2.3 `Dockerfile.middleware` runtime stage ships `middleware/assets`;
      extend `scripts/test-deploy-assets.mjs` (or sibling) to guard it.

## 3. Verification + gates (SEQUENTIAL)

- [x] 3.1 Middleware vitest green (file-serial config); app suite untouched;
      intent parity guards (`intentToolCorpus.test.ts`, shared intentCatalog
      live-coverage) still green — no catalog change was made.
- [x] 3.2 `npm run build` (shared + middleware) green.
- [x] 3.3 `openspec validate --all --strict --json` passes.
- [x] 3.4 Adversarial review gate: falsify every claim against code; confirm
      no dormant plumbing (every export has a caller; sync script output has
      a read site); confirm capsule facts removed are reachable via routing.

## Deferred (tracked, not dormant)

- D.1 `lookup_groundx_docs` server-executed LLM tool — blocked on a tool-result
  round-trip loop in the chat router. Recorded as the named evolution in the
  `chat-architecture-hardening` skill-knowledge requirement (carried in the
  durable spec post-archive); design notes in `proposal.md`.
- D.2 Periodic re-sync of the pinned commit (`node
  scripts/sync-groundx-skills.mjs <ref>`) — manual, on upstream releases.
  Operational note, not a deliverable.
