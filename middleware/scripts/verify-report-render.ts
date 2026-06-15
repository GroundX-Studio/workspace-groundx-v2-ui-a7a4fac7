/**
 * report-default-template T7 — LIVE render verification.
 *
 * Calls the REAL `renderReport` service (real GroundX search + real LLM + real
 * embedding-verification) over the seeded default report template, scoped to the
 * sample utility invoice — the exact anonymous onboarding render path, minus the
 * HTTP/session/MySQL plumbing. The seeded template + sample project are written
 * into an in-memory repository (identical bytes to the boot seed); GroundX/LLM
 * hit the real cloud services from .env.local.
 *
 *   npm --workspace middleware exec tsx scripts/verify-report-render.ts
 *
 * Prints each section's body + citations and exits non-zero if any section is
 * empty / unciteable — so the wiring tests' CANNED sections are backed by proof
 * the live render actually answers the three questions over the real bill.
 */

import { SAMPLE_REPORT_TEMPLATE_ID } from "@groundx/shared";

import { loadEnv } from "../src/config/env.js";
import { MemoryAppRepository } from "../src/db/memoryRepository.js";
import {
  SAMPLE_PROJECT_ID,
  seedSampleProject,
  seedSampleReportTemplate,
} from "../src/db/seedSampleProject.js";
import { FetchGroundXClient } from "../src/services/groundxClient.js";
import { FetchLlmClient, isEmbeddingsConfigured } from "../src/services/llmClient.js";
import { authorizedProjectIds, rbacFilterForProjects } from "../src/services/projectAccess.js";
import { makeQuoteEmbedder } from "../src/services/quoteEmbedder.js";
import { renderReport, reportTemplateFromRecord } from "../src/services/reportRenderer.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const bucketId = env.GROUNDX_SAMPLES_BUCKET_ID ?? null;
  if (bucketId == null) throw new Error("GROUNDX_SAMPLES_BUCKET_ID not set");

  const repository = new MemoryAppRepository();
  await seedSampleProject(repository, bucketId);
  await seedSampleReportTemplate(repository);

  const groundxClient = new FetchGroundXClient(env);
  const llmClient = new FetchLlmClient(env);
  const quoteEmbedder = isEmbeddingsConfigured(env)
    ? makeQuoteEmbedder(new FetchLlmClient(env, "embeddings"), env.EMBEDDINGS_MODEL_ID as string)
    : undefined;

  // Anon RBAC: exactly the endpoint's resolution (no signed-in user).
  const authorizedProjects = await authorizedProjectIds(repository, null);

  const scope = {
    type: "bucket" as const,
    bucketId,
    filter: { projectId: SAMPLE_PROJECT_ID },
  };

  console.log(
    `[verify] templateId=${SAMPLE_REPORT_TEMPLATE_ID} bucket=${bucketId} project=${SAMPLE_PROJECT_ID} embeddings=${quoteEmbedder ? "on" : "lexical-only"} authorizedProjects=${JSON.stringify(authorizedProjects)}`,
  );

  const result = await renderReport(
    {
      templateId: SAMPLE_REPORT_TEMPLATE_ID,
      scope,
      variables: {},
      sectionIds: null,
      chatSessionId: "verify-cli",
      parentMessageId: null,
    },
    {
      samplesBucketId: bucketId,
      getTemplate: async (id) => {
        const record = await repository.getTemplate(id);
        return record ? reportTemplateFromRecord(record) : null;
      },
      groundxClient,
      llmClient,
      ...(env.GROUNDX_PARTNER_API_KEY ? { groundxApiKey: env.GROUNDX_PARTNER_API_KEY } : {}),
      rbacFilter: rbacFilterForProjects(authorizedProjects),
      ...(env.LLM_MODEL_ID ? { llmModelId: env.LLM_MODEL_ID } : {}),
      ...(quoteEmbedder ? { quoteEmbedder } : {}),
      embedThreshold: env.EMBEDDINGS_VERIFY_THRESHOLD,
    },
  );

  if ("gated" in result) {
    throw new Error(`[verify] FAIL — render was gated: ${result.gate} (${result.reason})`);
  }

  console.log(`\n[verify] status=${result.status} preview_only=${result.preview_only} sections=${result.sections.length} reason=${result.reason ?? "—"}\n`);

  let failures = 0;
  for (const s of result.sections) {
    const body = (s.body ?? "").trim();
    const cites = s.cites ?? [];
    const ok = body.length > 0 && body !== "—" && cites.length > 0;
    if (!ok) failures += 1;
    console.log(`── ${s.name} [${s.render_as}] ${ok ? "✓" : "✗"} ${cites.length} cite(s)`);
    console.log(body.length > 320 ? `${body.slice(0, 320)}…` : body);
    for (const c of cites.slice(0, 3)) {
      console.log(`   cite → doc=${c.documentId} page=${c.page ?? "?"} tier=${c.tier ?? "?"}`);
    }
    console.log("");
  }

  if (result.sections.length === 0) {
    throw new Error("[verify] FAIL — zero sections rendered");
  }
  if (failures > 0) {
    throw new Error(`[verify] FAIL — ${failures} section(s) had no grounded/cited body`);
  }
  console.log(`[verify] PASS — all ${result.sections.length} sections grounded with citations`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
