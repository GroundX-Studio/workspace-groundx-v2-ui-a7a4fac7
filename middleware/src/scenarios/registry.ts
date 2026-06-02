/**
 * Scenario registry — lists the onboarding sample scenarios.
 *
 * 2026-06-02-flatten-document-filter: the manifest (UX config) is now sourced
 * APP-SIDE from `SAMPLE_SCENARIOS`; the registry only joins the samples bucket's
 * documents to a scenario by `filter.projectId` (the data-org key). This
 * decouples the picker from GroundX document metadata and lets the GroundX
 * search `filter` be the flat `{projectId, workflow_id}` scoping key (no
 * `manifest`/`scenarioId`/`kind` blob). A scenario with no matching bucket doc
 * is omitted (not yet seeded).
 *
 *   SAMPLE_SCENARIOS (app-side: id, order, manifest)
 *      └── join bucket docs where filter.projectId === projectId(scenarioId)
 *
 * Cached in-process for a short TTL — the samples change rarely.
 */

import type { AppEnv } from "../config/env.js";
import { SAMPLE_PROJECT_ID_BY_SCENARIO } from "../db/seedSampleProject.js";
import type { ScenarioConfig, ScenarioDocument } from "./types.js";
import { SAMPLE_SCENARIOS, type SampleScenarioConfig } from "./sampleScenarios.js";

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
  nextToken?: string;
}

interface CacheEntry {
  fetchedAt: number;
  data: ScenarioConfig[];
}

const CACHE_TTL_MS = 60_000;

/** The GroundX `filter.projectId` value for a scenario (real seeded id, or slug). */
function projectIdForScenario(scenarioId: string): string {
  return SAMPLE_PROJECT_ID_BY_SCENARIO[scenarioId] ?? scenarioId;
}

export class ScenarioRegistry {
  private cache: CacheEntry | null = null;

  /** `configs` is injectable for tests; defaults to the app-side source. */
  constructor(
    private env: AppEnv,
    private configs: readonly SampleScenarioConfig[] = SAMPLE_SCENARIOS,
  ) {}

  async list(): Promise<ScenarioConfig[]> {
    const now = Date.now();
    if (this.cache && now - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.data;
    }
    const docs = await this.fetchAllDocuments();
    const scenarios = this.joinDocsToScenarios(docs);
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
        if (doc.bucketId == null || doc.bucketId === this.env.GROUNDX_SAMPLES_BUCKET_ID) {
          out.push(doc);
        }
      }
      nextToken = json.nextToken;
    } while (nextToken);
    return out;
  }

  /**
   * Join each app-side scenario config to its bucket documents by
   * `filter.projectId`. The manifest comes from the config (NOT the doc filter);
   * the documents come from the bucket. A scenario with no matching doc is
   * omitted (not yet seeded into the bucket).
   */
  private joinDocsToScenarios(docs: GroundXDocument[]): ScenarioConfig[] {
    const byProjectId = new Map<string, GroundXDocument[]>();
    for (const doc of docs) {
      const projectId = (doc.filter as { projectId?: unknown } | undefined)?.projectId;
      if (typeof projectId !== "string") continue;
      const list = byProjectId.get(projectId) ?? [];
      list.push(doc);
      byProjectId.set(projectId, list);
    }

    const scenarios: ScenarioConfig[] = [];
    for (const config of this.configs) {
      const matched = byProjectId.get(projectIdForScenario(config.id)) ?? [];
      if (matched.length === 0) continue; // not seeded yet → omit from the picker
      const documents: ScenarioDocument[] = matched
        .slice()
        .sort((a, b) => a.fileName.localeCompare(b.fileName))
        .map((d, i) => ({ documentId: d.documentId, fileName: d.fileName, order: i + 1 }));
      scenarios.push({
        id: config.id,
        order: config.order,
        manifest: config.manifest,
        documents,
        supportsJsonRender: config.manifest.supportsJsonRender ?? false,
      });
    }
    scenarios.sort((a, b) => a.order - b.order);
    return scenarios;
  }
}
