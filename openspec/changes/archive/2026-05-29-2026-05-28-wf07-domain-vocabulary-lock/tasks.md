# Tasks — WF-07 domain vocabulary lock

## 1. Verify the code against the locked mapping

- [x] Located scope derivation: scenario fixtures (`middleware/src/scenarios/`) do NOT carry a
      `ContentScope`; scope is derived at chat time by `deriveRagContentScope` (chatHandler.ts:525)
      from the active entity's `bucketId` / `projectIdsJson` / `groupId` / `documentIdsJson`.
- [x] Confirmed the mapping is ALREADY correct: `bucketId (+ projectIds)` → `{kind:"bucket", projectIds}`
      (project = filter on a bucket); `groupId` → `{kind:"group"}` only for an explicit multi-workspace
      group. There is NO "project view = group" in code — that contradiction lived only in the decisions
      memo (since corrected). The chat router's `bucket+project` request shape is the path used.

## 2. Correct the fixture if needed

- [x] No fixture change needed — no scenario models a single-workspace project view as a group.
      (Solar project view → entity carries `bucketId` + `projectIds`, not a `groupId`.)

## 3. Drift guard

- [x] Added `middleware/src/services/contentScopeVocabulary.test.ts` — a direct unit test on
      `deriveRagContentScope` (previously only covered indirectly via `handleChatMessage`). 5 cases lock:
      project view → bucket+projectIds (NOT group); multi-project → still bucket; portfolio/bucket-wide
      → plain bucket; group ONLY for explicit `groupId`; bucket+projectIds never silently becomes group.
      **5/5 green.**

## 4. Spec + closure

- [x] `app-architecture` delta: the GroundX↔product vocabulary lock.
- [x] `scenarios` delta: Solar ContentScope reconciliation (bucket + projectId filter).
- [x] Middleware suite green (new test 5/5); tsc clean; OpenSpec `validate --all --strict` green.
- [x] Archive.

## Note

The implementation already satisfied the vocabulary; WF-07's deliverable is the durable spec + the
named regression-lock test, so the contradiction can never reach code. No production code changed.
