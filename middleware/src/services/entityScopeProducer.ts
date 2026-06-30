/**
 * entityScopeProducer — the upstream that writes a known customer
 * entity's RAG scope onto its `chat_session_entities` row.
 *
 * Background (2026-05-31-steady-scope-producer): `deriveRagContentScope`
 * (`chatHandler.ts`) READS four scope columns (`bucketId` /
 * `projectIdsJson` / `groupId` / `documentIdsJson`) every chat turn, but
 * the only writer (the PUT entity route, `app.ts`) preserved them
 * server-only/NULL with NO producer — so every entity fell through to the
 * env-samples-bucket fallback. The change `entity-rag-scope-roundtrip`
 * characterized that as by-design for the only path that existed (anon
 * onboarding) and Deferred the producer. This module is that producer.
 *
 * Phase 0 decision (recorded in the change's tasks.md): build the
 * producer for the EntityKind that exists today — `sample`. A
 * `sample:<scenarioId>` entity maps to the demo scope:
 *
 *     { type: "bucket", bucketId: <samplesBucket>, filter: { projectId: [scenarioId] } }
 *
 * expressed as the persisted columns `bucketId` + `projectIdsJson`. The
 * `scenarioId` is the GroundX `projectId` filter-field value that
 * distinguishes one demo from another inside the shared samples bucket
 * (WF-07: bucket == workspace; a demo is a project filter-field, never a
 * group). `deriveRagContentScope` already maps `projectIdsJson` →
 * `filter: { projectId: [...] }`, so the produced columns round-trip
 * back to the demo scope — NOT the bare samples-bucket fallback.
 *
 * BYO is DEFERRED: its upload path does not exist yet, so no producer is
 * wired for it here (the change's Out-of-scope + UNBLOCK note).
 *
 * No-known-target → returns null:
 *   - the entity key is not a recognized `sample:<scenarioId>` key, or
 *   - no samples bucket is configured (`samplesBucketId` null/undefined).
 * In both cases the row's scope columns stay NULL and
 * `deriveRagContentScope` resolves the env-samples fallback (the
 * documented anon-onboarding behavior, unchanged).
 *
 * The producer writes the SAME column refs the reader consumes — it does
 * not introduce a parallel scope shape (one source of truth).
 */

import { SAMPLE_PROJECT_ID_BY_SCENARIO } from "../db/seedSampleProject.js";

/** The scope-column subset of `ChatSessionEntityRecord` the producer fills. */
export interface ProducedEntityScope {
  bucketId: number | null;
  projectIdsJson: string | null;
  groupId: number | null;
  documentIdsJson: string | null;
}

export interface ProduceEntityScopeDeps {
  /** Env samples bucket id (`GROUNDX_SAMPLES_BUCKET_ID`); the demo corpus. */
  samplesBucketId: number | null | undefined;
}

/**
 * Compute the scope columns for a known-target entity, or `null` when the
 * target is not known (→ caller leaves the columns NULL → fallback).
 *
 * Today only the `sample` EntityKind has a producer. When a new kind
 * lands with a known target (steady-mode workspace bucket, BYO uploaded
 * documents, multi-bucket group), add its case here — composing on the
 * existing `ContentScope` axis, not forking the producer.
 */
export function produceEntityScope(
  entityKey: string,
  deps: ProduceEntityScopeDeps,
): ProducedEntityScope | null {
  const samplesBucketId = deps.samplesBucketId;
  if (samplesBucketId == null) {
    // No demo corpus configured → no derivable target → fallback path.
    return null;
  }

  // EntityKey format is `${kind}:${id}` (app makeEntityKey). Split on the
  // FIRST colon only — a scenarioId could in principle contain a colon.
  const sep = entityKey.indexOf(":");
  if (sep <= 0) {
    return null;
  }
  const kind = entityKey.slice(0, sep);
  const id = entityKey.slice(sep + 1);

  if (kind === "sample" && id.length > 0) {
    // The demo scope: samples bucket narrowed by the project filter.
    // `deriveRagContentScope` maps projectIdsJson → filter.projectId. Resolve
    // the scenario slug to its REAL seeded project id (the value stamped on the
    // doc's GroundX filter) so the filter actually matches; an unmapped
    // scenario keeps its slug (not yet seeded as a project).
    const projectId = SAMPLE_PROJECT_ID_BY_SCENARIO[id] ?? id;
    return {
      bucketId: samplesBucketId,
      projectIdsJson: JSON.stringify([projectId]),
      // No producer here — kept as cf19 (multi-bucket→group) substrate
      // and single-doc-viewer (documentIdsJson) substrate respectively.
      groupId: null,
      documentIdsJson: null,
    };
  }

  // Unrecognized kind (future: project / document / report once their
  // targets are known) → no producer yet → fallback path.
  return null;
}
