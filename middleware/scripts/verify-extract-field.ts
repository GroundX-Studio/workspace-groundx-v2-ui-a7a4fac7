/**
 * unify-extract-citations — LIVE verification of the unified Extract citation.
 *
 * Calls the REAL `extractField` service (real GroundX search + real LLM + real
 * embedding verification) over the sample City of Windom invoice, and prints
 * the resulting citation. Proves the field-extract path now produces a VERIFIED,
 * TIERED citation through the shared `verifyAndTierSnippetCitation` — not the
 * former bare, unverified `{documentId, page, snippet}`.
 *
 *   UPSTREAM_TIMEOUT_MS=120000 npm --workspace middleware exec tsx scripts/verify-extract-field.ts
 */

import { loadEnv } from "../src/config/env.js";
import { extractField } from "../src/services/fieldExtractor.js";
import { FetchGroundXClient } from "../src/services/groundxClient.js";
import { FetchLlmClient, isEmbeddingsConfigured } from "../src/services/llmClient.js";
import { makeQuoteEmbedder } from "../src/services/quoteEmbedder.js";

const SAMPLE_DOC_ID = "c3bfff49-6640-4213-822b-e81c3a771e45";

async function run(field: { name: string; type: "STRING" | "NUMBER"; description: string }) {
  const env = loadEnv();
  const groundxClient = new FetchGroundXClient(env);
  const llmClient = new FetchLlmClient(env);
  const quoteEmbedder = isEmbeddingsConfigured(env)
    ? makeQuoteEmbedder(new FetchLlmClient(env, "embeddings"), env.EMBEDDINGS_MODEL_ID as string)
    : undefined;

  const result = await extractField(
    { field, contentScope: { type: "documents", documentIds: [SAMPLE_DOC_ID] } },
    {
      llmClient,
      groundxClient,
      ...(env.GROUNDX_PARTNER_API_KEY ? { groundxApiKey: env.GROUNDX_PARTNER_API_KEY } : {}),
      ...(env.LLM_MODEL_ID ? { llmModelId: env.LLM_MODEL_ID } : {}),
      ...(quoteEmbedder ? { quoteEmbedder } : {}),
      embedThreshold: env.EMBEDDINGS_VERIFY_THRESHOLD,
    },
  );

  console.log(`\n── ${field.name} (${field.type}) ──`);
  console.log(`value      = ${JSON.stringify(result.value)}`);
  console.log(`confidence = ${result.confidence}`);
  if (result.citation) {
    const c = result.citation;
    console.log(
      `citation   = doc=${c.documentId} page=${c.page} TIER=${c.tier ?? "<none>"} conf=${c.confidence ?? "<none>"} bbox=${c.bbox ? "yes" : "no"}`,
    );
    console.log(`   snippet = ${(c.snippet ?? "").slice(0, 160)}`);
    if (!c.tier) throw new Error("FAIL — citation has no tier (not unified)");
    console.log("PASS — citation is verified + tiered through the shared pipeline");
  } else {
    console.log("citation   = null (no grounded source)");
  }
}

async function main() {
  await run({
    name: "Total amount due",
    type: "NUMBER",
    description: "the total amount due on this utility bill",
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
