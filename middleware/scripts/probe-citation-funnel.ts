/**
 * Citation-funnel probe (the T0 "measure" step for the two data-gated citation
 * changes, run pre-launch since no organic usage soak exists yet).
 *
 * Runs several varied grounded queries over the REAL sample invoice and
 * aggregates the citation funnel — specifically the drop reasons the two
 * deferred changes target:
 *   - citation-retry-backstop  → turns with `emitted===0` or `emitted>0 && shipped===0`, and `dropReasons.parse`
 *   - extraction-citation-geometry-miss-policy → `dropReasons.geometry` on validated extraction citations
 *
 *   UPSTREAM_TIMEOUT_MS=120000 npm --workspace middleware exec tsx scripts/probe-citation-funnel.ts
 */

import { loadEnv } from "../src/config/env.js";
import { SAMPLE_PROJECT_ID } from "../src/db/seedSampleProject.js";
import { groundedAnswerOverScope } from "../src/services/groundedAnswer.js";
import { FetchGroundXClient } from "../src/services/groundxClient.js";
import { FetchLlmClient, isEmbeddingsConfigured } from "../src/services/llmClient.js";
import { makeQuoteEmbedder } from "../src/services/quoteEmbedder.js";

// ADVERSARIAL set — each question is chosen to PROVOKE a specific funnel loss
// mode, not to ship cleanly:
//   - array/object citation (branchNode) — "list every line item / all meters…"
//   - extraction-leaf geometry resolution — exact usage numbers
//   - omission / ambient (analytical questions the doc can't directly ground)
//   - the per-meter derived-total framing that blanked a report section
const QUESTIONS = [
  "List every individual charge line item on the bill with its amount.",
  "List all meters with meter id, utility type, rate plan, usage, AND the total charges for each meter.",
  "What is the exact electric usage in kWh and the exact water usage in gallons?",
  "Overall, is this utility bill high or reasonable for a commercial customer?",
  "What is driving most of the total cost on this bill?",
  "How many separate water meters are there and what are their meter numbers?",
  "Give me the sewer charge for each meter separately.",
  "What is the total amount due?",
];

async function main() {
  const env = loadEnv();
  const bucketId = env.GROUNDX_SAMPLES_BUCKET_ID ?? 28454;
  const groundxClient = new FetchGroundXClient(env);
  const llmClient = new FetchLlmClient(env);
  const quoteEmbedder = isEmbeddingsConfigured(env)
    ? makeQuoteEmbedder(new FetchLlmClient(env, "embeddings"), env.EMBEDDINGS_MODEL_ID as string)
    : undefined;
  const scope = { type: "bucket" as const, bucketId, filter: { projectId: SAMPLE_PROJECT_ID } };

  const agg = {
    turns: 0,
    emittedZero: 0,
    emittedPositiveShippedZero: 0,
    totalEmitted: 0,
    totalShipped: 0,
    drop: { parse: 0, docId: 0, page: 0, path: 0, value: 0, branchNode: 0, geometry: 0 },
  };

  for (const q of QUESTIONS) {
    const debug: { citations?: Record<string, unknown> } = {};
    const ans = await groundedAnswerOverScope(q, scope, {
      groundxClient,
      llmClient,
      ...(env.GROUNDX_PARTNER_API_KEY ? { groundxApiKey: env.GROUNDX_PARTNER_API_KEY } : {}),
      ...(env.LLM_MODEL_ID ? { llmModelId: env.LLM_MODEL_ID } : {}),
      ...(quoteEmbedder ? { quoteEmbedder } : {}),
      embedThreshold: env.EMBEDDINGS_VERIFY_THRESHOLD,
    }, {
      debug,
      turnPlan: { documentSearch: true, productKnowledge: false, extractionContext: true },
    });
    const f = (debug.citations ?? {}) as { emitted?: number; shipped?: number; dropReasons?: Record<string, number> };
    const emitted = f.emitted ?? 0;
    const shipped = f.shipped ?? (ans.citations?.length ?? 0);
    agg.turns += 1;
    agg.totalEmitted += emitted;
    agg.totalShipped += shipped;
    if (emitted === 0) agg.emittedZero += 1;
    if (emitted > 0 && shipped === 0) agg.emittedPositiveShippedZero += 1;
    for (const k of Object.keys(agg.drop) as (keyof typeof agg.drop)[]) {
      agg.drop[k] += f.dropReasons?.[k] ?? 0;
    }
    console.log(`Q: ${q.slice(0, 48)}…  emitted=${emitted} shipped=${shipped} drops=${JSON.stringify(f.dropReasons ?? {})}`);
  }

  console.log("\n=== AGGREGATE ===");
  console.log(JSON.stringify(agg, null, 2));
  console.log(
    `\nretry-backstop signal (emitted===0 turns): ${agg.emittedZero}/${agg.turns}; parse-loss drops: ${agg.drop.parse}`,
  );
  console.log(`geometry-miss signal (geometry drops): ${agg.drop.geometry}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
