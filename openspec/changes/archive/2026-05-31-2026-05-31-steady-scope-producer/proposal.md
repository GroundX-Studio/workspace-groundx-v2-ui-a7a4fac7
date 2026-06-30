# Real steady/BYO entity→scope producer + scope-column drop

## Why

The `chat_session_entities` scope columns (`bucketId` / `documentIdsJson` / `groupId` /
`projectIdsJson`) are **read** by `deriveRagContentScope` (`middleware/src/services/chatHandler.ts:528`)
but written by **no producer** — the only writer (the PUT entity route, `app.ts:803-810`) deliberately
preserves them as server-only (`existing?.X ?? null`) and never lets a client set them. The change
`2026-05-30-entity-rag-scope-roundtrip` characterized this seam and proved it is **by design** for the
only path that exists today (anon onboarding over a shared samples bucket → the samples-bucket fallback
is the correct scope), then explicitly **Deferred** the producer: *"When the steady-mode / BYO upload
path exists, wire a producer that persists a customer entity's known scope … so `deriveRagContentScope`
resolves a real customer scope instead of the samples-bucket fallback."*

This change is that deferred producer. It is the **upstream** the following work all waits on:

- The durable `chat-routing` requirement *"Per-entity RAG scope SHALL be persisted by a producer and
  read back, never read-only"* (added by `entity-rag-scope-roundtrip`) is **half-satisfied** — the
  reader exists, the producer does not. This change supplies the producer half.
- `cf19` (the multi-bucket→group `ensureBucketGroup` helper) is **backlogged/broken** and, even once
  reworked, only resolves the *read* side (`groupId` → `{type:"group"}`). It has no upstream that writes
  a multi-bucket list onto an entity. Its own rework checklist flags this: *"Rework must decide where a
  multi-bucket list actually comes from before wiring anything."* That producer is here.
- `wf05b`-adjacent single-doc viewer flows need `documentIdsJson` populated to scope RAG to the open PDF.

Until the producer exists, every steady-mode / BYO entity falls through to the env samples bucket — for
a real customer that **would** be a wrong-corpus mis-grounding. We cannot do the `entity-rag` Phase 2 §9
move (*drop any scope column that still has no producer*) until we know which columns get a real producer
here — dropping a column the producer is about to fill would be the wrong call. So: **build the producer
first, then drop only the columns that remain producerless.**

The shape of the producer (when the BYO upload path lands, the EntityKind→ContentScope mapping, and how
it relates to `cf19`) is **not yet decided** — that decision gates everything else in this change and is
the first task.

## What Changes

- **INPUT NEEDED first (gates the rest):** confirm the steady-mode / BYO scope-production model —
  (a) when the BYO upload path lands and what it writes; (b) the `EntityKind` → `ContentScope` mapping
  (which kind maps to bucket / documents / group / bucket+projectId-filter); (c) how this relates to the
  backlogged `cf19` (does the producer write a multi-bucket list that `cf19` then resolves to a group, or
  does the producer write `groupId` directly).
- **Producer (TDD, after the decision):** add a server-side producer that, when a customer entity's
  target content is known (steady-mode active workspace or a completed BYO upload), persists the entity's
  `bucketId` / `documentIdsJson` / `groupId` / `projectIdsJson` onto its `chat_session_entities` row —
  replacing the perpetually-NULL columns. The producer writes the **same** shared `ContentScope` refs the
  reader already consumes (no parallel shape).
- **Round-trip closeout (satisfies the durable requirement):** a write → reload → `deriveRagContentScope`
  → correct-scope test, flipping the RED characterization test from `entity-rag-scope-roundtrip`.
- **THEN (and only then) the `entity-rag` Phase 2 §9 move:** for every scope column that still has **no**
  producer after this change, drop the column **and** its read site in `deriveRagContentScope` (the
  no-dead-column rule). A column the producer above now writes is KEPT.
- **Doc reconciliation:** update `docs/agents/data-model.md` so the `chat_session_entities` row reflects
  "produced by `<producer>`, read by `deriveRagContentScope`" instead of "read-but-unwritten."

## Out of scope

- The BYO **upload UI** itself (file picker, ingest progress) — this change wires the producer at the
  point the upload completes; building the upload surface is separate work (the F1 BYO picker / Documents
  ingest path). If that path does not exist yet, the INPUT NEEDED answer must say so and this change wires
  the producer behind the agreed seam (with an UNBLOCK task) rather than inventing the upload flow.
- The `cf19` `ensureBucketGroup` rework itself (its broken proposal stays its own change). This change
  only supplies the upstream that writes the entity scope `cf19` reads; if the decision is "producer
  writes a multi-bucket list, cf19 resolves it," the cross-reference is recorded, not the helper built.
- New end-user product behavior beyond correct RAG grounding for a known customer scope.

## Affected

- Middleware: `services/chatHandler.ts` (`deriveRagContentScope` — read site, possible column drop),
  a new producer module + wiring at the entity-write / upload-complete seam, `app.ts` (the entity
  writer that currently preserves the columns server-only), `mysqlRepository.ts` (persist the produced
  columns; drop migration for any producerless column).
- App: the EntityKind/EntitySession surface if the mapping needs a client-supplied scope ref
  (decided by the INPUT NEEDED answer).
- Specs: `chat-routing` (the producer requirements).
- Docs: `docs/agents/data-model.md`.

## Conformance to core architectural decisions

- **One source of truth** — the producer writes the shared `@groundx/shared` `ContentScope` refs the
  reader already consumes; no parallel scope shape is introduced.
- **No orphaned plumbing (§no-shortcuts)** — every scope column read by `deriveRagContentScope` ends this
  change with a real non-test producer OR is dropped (column + read site). No column stays read-only.
- **Earn the axis** — the producer is parameterized by the existing `ContentScope` union, not a new
  cross-product; the steady-mode and BYO paths are two callers of one producer, not two forks.
- **Done = round-trip** — closure is a write → reload → read → correct-scope test, not a closed seam.
