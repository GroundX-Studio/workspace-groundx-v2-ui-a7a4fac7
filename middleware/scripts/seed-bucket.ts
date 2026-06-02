/**
 * Seed the samples bucket from spec JSON files.
 *
 * Each spec lives in `scripts/scenarios/<id>.json` and lists local PDFs to
 * ingest, plus the ScenarioManifest that should be embedded in the first
 * doc's filter. The script is idempotent: it lists docs already in the
 * bucket and skips any whose filter already matches (scenarioId, order,
 * fileName).
 *
 *   npm --workspace middleware run seed -- utility loan solar
 *   npm --workspace middleware run seed                       # all specs
 *
 * Reads PARTNER_API_KEY + GROUNDX_BASE_URL + GROUNDX_SAMPLES_BUCKET_ID from
 * .env.local. The "partner" key is used directly against the GroundX API
 * since this account doubles partner + customer scope.
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnv } from "../src/config/env.js";
import { SAMPLE_PROJECT_ID_BY_SCENARIO } from "../src/db/seedSampleProject.js";
import { stampDocumentFilter } from "../src/services/documentFilter.js";
import type { SampleDocFilter, ScenarioManifest } from "../src/scenarios/types.js";

/**
 * The app-project id stamped on a scenario's docs (the GroundX search-`filter`
 * key for data-org + RBAC). Resolves the scenario slug to its real seeded
 * `proj_<uuid>` (matching `produceEntityScope`); an unmapped scenario keeps its
 * slug (not yet seeded as a real project).
 */
function resolveSampleProjectId(scenarioId: string): string {
  return SAMPLE_PROJECT_ID_BY_SCENARIO[scenarioId] ?? scenarioId;
}

interface SpecDoc {
  fileName: string;
  filePath: string;
  order: number;
}

interface ScenarioSpec {
  id: string;
  order: number;
  // The scenario manifest now lives app-side in `src/scenarios/sampleScenarios.ts`
  // (the registry's source of truth); the seed no longer embeds it in the doc
  // filter. Optional/vestigial in the seed config.
  manifest?: ScenarioManifest;
  documents: SpecDoc[];
}

interface ExistingDoc {
  documentId: string;
  fileName: string;
  filter?: Partial<SampleDocFilter> & Record<string, unknown>;
}

const env = loadEnv();
const PARTNER_KEY = env.GROUNDX_PARTNER_API_KEY;
const BUCKET_ID = process.env.GROUNDX_SAMPLES_BUCKET_ID;
const BASE = env.GROUNDX_BASE_URL;

if (!PARTNER_KEY) throw new Error("GROUNDX_PARTNER_API_KEY missing");
if (!BUCKET_ID) throw new Error("GROUNDX_SAMPLES_BUCKET_ID missing");

const HERE = dirname(fileURLToPath(import.meta.url));
const SCENARIOS_DIR = resolve(HERE, "scenarios");

async function gx<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "X-API-Key": PARTNER_KEY!, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`GroundX ${init.method ?? "GET"} ${path} → ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

async function listExistingDocs(scenarioId: string): Promise<ExistingDoc[]> {
  // GroundX list-documents doesn't accept a metadata filter, so we pull
  // everything and filter in memory. With <500 docs per scenario this is fine.
  const out: ExistingDoc[] = [];
  let nextToken: string | undefined;
  do {
    const q = new URLSearchParams({ n: "100" });
    if (nextToken) q.set("nextToken", nextToken);
    const response = await gx<{ documents: ExistingDoc[]; nextToken?: string }>(
      `/ingest/documents?${q.toString()}`
    );
    for (const doc of response.documents ?? []) {
      // Match by the flat projectId (the post-flatten key); fall back to the
      // legacy scenarioId during the transition.
      const f = doc.filter as (Partial<SampleDocFilter> & { projectId?: string }) | undefined;
      if (f?.projectId === resolveSampleProjectId(scenarioId) || f?.scenarioId === scenarioId) {
        out.push(doc);
      }
    }
    nextToken = response.nextToken;
  } while (nextToken);
  return out;
}

async function uploadLocalFile(filePath: string, fileName: string): Promise<string> {
  // GroundX local upload is a 3-step dance: pre-signed PUT, then ingest
  // with the hosted URL. The upload host is api.eyelevel.ai (not
  // api.groundx.ai) per the docs (groundx-api/02-documents.md §3).
  const ext = fileName.split(".").pop() ?? "pdf";
  const presignRes = await fetch(
    `https://api.eyelevel.ai/upload/file?name=${encodeURIComponent(fileName)}&type=${encodeURIComponent(ext)}`
  );
  if (!presignRes.ok) {
    throw new Error(`pre-sign failed: ${presignRes.status} ${await presignRes.text()}`);
  }
  const presign = (await presignRes.json()) as {
    URL: string;
    Method: string;
    Type: string;
    Header: { "Gx-Hosted-Url": string[] };
  };
  const bytes = await readFile(filePath);
  const putRes = await fetch(presign.URL, {
    method: "PUT",
    headers: { "Content-Type": presign.Type },
    body: bytes,
  });
  if (!putRes.ok) {
    throw new Error(`upload failed: ${putRes.status} ${await putRes.text()}`);
  }
  return presign.Header["Gx-Hosted-Url"][0];
}

async function reconcileProjectIdIfMissing(spec: ScenarioSpec, existing: ExistingDoc[]): Promise<void> {
  // Ensure every existing scenario doc carries the FLAT filter
  // {projectId, workflow_id?} — a doc seeded before projectId existed (or with
  // the legacy manifest/scenarioId blob) gets reconciled to the flat shape, so
  // the scope filter matches and no app metadata lingers in the GroundX filter.
  // (The scenario manifest now lives app-side in sampleScenarios.ts.)
  const desiredProjectId = resolveSampleProjectId(spec.id);
  for (const doc of existing) {
    const f = (doc.filter as (Partial<SampleDocFilter> & { projectId?: string; workflow_id?: string }) | undefined) ?? {};
    const hasLegacyBlob = f.manifest != null || f.scenarioId != null || f.kind != null;
    const projectIdOk = f.projectId === desiredProjectId;
    if (projectIdOk && !hasLegacyBlob) continue; // already flat + correct
    console.log(`  → reconciling filter → flat {projectId} for ${doc.documentId}`);
    await gx<{ ingest: { processId: string; status: string } }>("/ingest/documents", {
      method: "PUT",
      body: JSON.stringify({
        documents: [
          {
            documentId: doc.documentId,
            // REPLACE with the flat filter, preserving workflow_id (Extract).
            filter: stampDocumentFilter({ projectId: desiredProjectId, workflowId: f.workflow_id }),
          },
        ],
      }),
    });
    console.log(`  ← flat filter update queued`);
  }
}

async function seedScenario(spec: ScenarioSpec): Promise<void> {
  console.log(`\n=== ${spec.id} (order ${spec.order}, ${spec.documents.length} docs) ===`);

  const existing = await listExistingDocs(spec.id);
  const existingByName = new Map(existing.map((d) => [d.fileName, d]));
  console.log(`  ${existing.length} existing docs in bucket for this scenario`);

  await reconcileProjectIdIfMissing(spec, existing);

  // Determine which docs need ingest. We dedupe by fileName.
  const docsToIngest = spec.documents.filter((doc) => !existingByName.has(doc.fileName));
  if (docsToIngest.length === 0) {
    console.log(`  ✓ all docs already present — nothing to ingest`);
    return;
  }

  for (const doc of docsToIngest) {
    console.log(`  → uploading ${doc.fileName}`);
    const sourceUrl = await uploadLocalFile(doc.filePath, doc.fileName);

    // Flat document filter — just the projectId scoping key (the GroundX
    // search-filter key for RAG + RBAC). No manifest/scenarioId/kind: the
    // scenario manifest lives app-side (`src/scenarios/sampleScenarios.ts`) and
    // the registry joins docs to a scenario by `filter.projectId`.
    const filter = stampDocumentFilter({ projectId: resolveSampleProjectId(spec.id) });

    const payload = {
      documents: [
        {
          bucketId: Number(BUCKET_ID),
          sourceUrl,
          fileName: doc.fileName,
          fileType: doc.fileName.split(".").pop() ?? "pdf",
          processLevel: "full" as const,
          filter,
        },
      ],
    };

    const ingestRes = await gx<{ ingest: { processId: string; status: string } }>(
      "/ingest/documents/remote",
      { method: "POST", body: JSON.stringify(payload) }
    );
    console.log(`  ← processId ${ingestRes.ingest.processId} (${ingestRes.ingest.status})`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { readdir } = await import("node:fs/promises");
  const allFiles = await readdir(SCENARIOS_DIR);
  const allIds = allFiles.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
  const targets = args.length > 0 ? args : allIds;

  for (const id of targets) {
    const path = resolve(SCENARIOS_DIR, `${id}.json`);
    const raw = await readFile(path, "utf8");
    const spec = JSON.parse(raw) as ScenarioSpec;
    await seedScenario(spec);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
