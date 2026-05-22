/**
 * Scenario registry — reads the samples bucket and reconstructs
 * `ScenarioConfig[]` from documents' filter metadata.
 *
 *   Bucket (source of truth)
 *      ├── doc filter: { kind: "sample-doc", scenarioId, scenarioOrder, scenarioRole, manifest? }
 *      └── group docs by scenarioId; the doc carrying `manifest` is the canonical one.
 *
 * Cached in-process for a short TTL. The samples are partner-owned and
 * change rarely (a new scenario at most every few weeks); 60s is fine.
 */

import type { AppEnv } from "../config/env.js";
import { logger } from "../lib/logger.js";
import type { SampleDocFilter, ScenarioConfig, ScenarioDocument } from "./types.js";

interface GroundXDocument {
  documentId: string;
  fileName: string;
  bucketId?: number;
  status?: string;
  searchData?: Record<string, unknown>;
  filter?: Record<string, unknown>;
}

interface DocumentsListResponse {
  documents: GroundXDocument[];
  count?: number;
  remaining?: number;
  total?: number;
  nextToken?: string;
}

interface CacheEntry {
  fetchedAt: number;
  data: ScenarioConfig[];
}

const CACHE_TTL_MS = 60_000;

export class ScenarioRegistry {
  private cache: CacheEntry | null = null;

  constructor(private env: AppEnv) {}

  async list(): Promise<ScenarioConfig[]> {
    const now = Date.now();
    if (this.cache && now - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.data;
    }
    const docs = await this.fetchAllDocuments();
    const scenarios = this.groupIntoScenarios(docs);
    this.cache = { fetchedAt: now, data: scenarios };
    return scenarios;
  }

  /** Force the next list() to skip the cache. Used after a seed run. */
  invalidate(): void {
    this.cache = null;
  }

  private async fetchAllDocuments(): Promise<GroundXDocument[]> {
    if (!this.env.GROUNDX_PARTNER_API_KEY) {
      throw new Error("GROUNDX_PARTNER_API_KEY is required to list samples");
    }
    if (!this.env.GROUNDX_SAMPLES_BUCKET_ID) {
      throw new Error("GROUNDX_SAMPLES_BUCKET_ID is required to list samples");
    }

    const out: GroundXDocument[] = [];
    let nextToken: string | undefined;
    do {
      const qs = new URLSearchParams({ n: "100" });
      if (nextToken) qs.set("nextToken", nextToken);
      const res = await fetch(`${this.env.GROUNDX_BASE_URL}/ingest/documents?${qs.toString()}`, {
        headers: { "X-API-Key": this.env.GROUNDX_PARTNER_API_KEY },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`GroundX list-documents failed: ${res.status} ${body}`);
      }
      const json = (await res.json()) as DocumentsListResponse;
      for (const doc of json.documents ?? []) {
        // Only docs in the configured samples bucket count, even if the
        // customer happens to host other buckets. Defense in depth: any doc
        // outside the bucket would also be a config drift.
        if (doc.bucketId == null || doc.bucketId === this.env.GROUNDX_SAMPLES_BUCKET_ID) {
          out.push(doc);
        }
      }
      nextToken = json.nextToken;
    } while (nextToken);
    return out;
  }

  private groupIntoScenarios(docs: GroundXDocument[]): ScenarioConfig[] {
    type Group = { scenarioId: string; order: number; manifest?: SampleDocFilter["manifest"]; documents: ScenarioDocument[] };
    const groups = new Map<string, Group>();

    for (const doc of docs) {
      const filter = doc.filter as Partial<SampleDocFilter> | undefined;
      if (!filter || filter.kind !== "sample-doc" || typeof filter.scenarioId !== "string") {
        continue;
      }
      const id = filter.scenarioId;
      let group = groups.get(id);
      if (!group) {
        group = { scenarioId: id, order: filter.scenarioOrder ?? Number.MAX_SAFE_INTEGER, documents: [] };
        groups.set(id, group);
      }
      if (filter.manifest) {
        if (group.manifest) {
          logger.warn(
            { scenarioId: id, duplicateOnDoc: doc.documentId },
            "Multiple docs carry a manifest for the same scenario — using the first"
          );
        } else {
          group.manifest = filter.manifest;
          group.order = filter.scenarioOrder ?? group.order;
        }
      }
      group.documents.push({
        documentId: doc.documentId,
        fileName: doc.fileName,
        order: filter.scenarioOrder ?? Number.MAX_SAFE_INTEGER,
      });
    }

    const scenarios: ScenarioConfig[] = [];
    for (const group of groups.values()) {
      if (!group.manifest) {
        logger.warn({ scenarioId: group.scenarioId }, "Scenario has docs but no manifest — skipping");
        continue;
      }
      scenarios.push({
        id: group.scenarioId,
        order: group.order,
        manifest: group.manifest,
        documents: group.documents.sort((a, b) => a.order - b.order),
      });
    }
    scenarios.sort((a, b) => a.order - b.order);
    return scenarios;
  }
}
