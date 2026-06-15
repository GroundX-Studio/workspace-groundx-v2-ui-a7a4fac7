/**
 * validate-agentic-loop-live-model — LIVE-MODEL validation of the agentic tool-loop.
 *
 * The agentic-tool-loop unit tests are LLM-FREE (scripted tool calls) — they prove the
 * plumbing, not the model's behaviour. This is the deliberately-OUT-OF-SUITE smoke that
 * confirms, against a running dev backend (live LLM + GroundX), the three things the
 * unit tests cannot:
 *   (1) the model CALLS `lookup_groundx_docs` for a PRODUCT question (knowledge not in
 *       the prompt) and REFRAINS for a DOCUMENT question (answerable from the doc);
 *   (2) the `maxRounds` budget (4) is not routinely exhausted on ordinary turns;
 *   (3) retrieved skill sections are RELEVANT to the question.
 *
 * It is NOT a vitest test (so the LLM-free guarantee of the default suite is preserved)
 * and requires live credentials. Run + RECORD the outcome:
 *
 *   UPSTREAM_TIMEOUT_MS=120000 npm --workspace middleware exec tsx scripts/validate-agentic-loop.ts
 *
 * Exit code 0 = all cases matched expectations; 1 = a mismatch to triage (e.g. the model
 * over/under-calls lookup, or rounds are exhausted — a prompt/budget signal, recorded).
 */
import { loadEnv } from "../src/config/env.js";
import { SAMPLE_PROJECT_ID } from "../src/db/seedSampleProject.js";
import { groundedAnswerOverScope } from "../src/services/groundedAnswer.js";
import { retrieveGroundxKnowledge } from "../src/services/groundxSkills.js";
import { FetchGroundXClient } from "../src/services/groundxClient.js";
import { FetchLlmClient, isEmbeddingsConfigured } from "../src/services/llmClient.js";
import { makeQuoteEmbedder } from "../src/services/quoteEmbedder.js";
import { toolsForStep } from "../src/services/toolCatalog.js";
import { RETRIEVER_DECIDES } from "../src/services/turnRouter.js";
import { toOpenAiTools } from "../src/services/zodToJsonSchema.js";

const MAX_ROUNDS = 4;

// The spec's requirement (1) has TWO halves, gated by whether the prompt already
// carries the answer:
//   - "calls when needed"   → a PRODUCT question with NO injected knowledge block must
//                             trigger lookup_groundx_docs (the model can't answer from
//                             the utility-bill snippets alone).
//   - "refrains when covered" → with the planner injecting the relevant block
//                             (RETRIEVER_DECIDES), an adequately-covered question is
//                             answered directly. This depends on retrieval COVERAGE for
//                             the exact phrasing, so it is OBSERVED, not hard-asserted.
//   - DOCUMENT questions never need product knowledge → must NOT call lookup.
type Assertion = "called" | "not-called" | "observe";
const RETRIEVER = RETRIEVER_DECIDES;
const CASES: Array<{ label: string; q: string; productKnowledge: false | typeof RETRIEVER; assert: Assertion }> = [
  { label: "PRODUCT, no injection — must CALL lookup", q: "How does GroundX X-Ray parse and understand a document?", productKnowledge: false, assert: "called" },
  { label: "PRODUCT, no injection — must CALL lookup", q: "What document file types can GroundX ingest?", productKnowledge: false, assert: "called" },
  { label: "PRODUCT, planner-injected — refrains if covered (observe)", q: "How does GroundX X-Ray parse and understand a document?", productKnowledge: RETRIEVER, assert: "observe" },
  { label: "DOCUMENT — must NOT call lookup", q: "What are the meter numbers on this utility bill?", productKnowledge: false, assert: "not-called" },
  { label: "DOCUMENT — must NOT call lookup", q: "What is the total amount due on this bill?", productKnowledge: false, assert: "not-called" },
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
  const tools = toOpenAiTools(toolsForStep("interact-chat", "anonymous"));

  let failures = 0;
  let roundsExhausted = 0;

  for (const c of CASES) {
    const ans = await groundedAnswerOverScope(
      c.q,
      scope,
      {
        groundxClient,
        llmClient,
        ...(env.GROUNDX_PARTNER_API_KEY ? { groundxApiKey: env.GROUNDX_PARTNER_API_KEY } : {}),
        ...(env.LLM_MODEL_ID ? { llmModelId: env.LLM_MODEL_ID } : {}),
        ...(quoteEmbedder ? { quoteEmbedder } : {}),
        embedThreshold: env.EMBEDDINGS_VERIFY_THRESHOLD,
      },
      {
        tools,
        toolLoop: { maxRounds: MAX_ROUNDS },
        turnPlan: { documentSearch: true, productKnowledge: c.productKnowledge, extractionContext: true },
      },
    );

    const activity = ans.toolActivity.map((a) => a.name);
    const calledLookup = activity.includes("lookup_groundx_docs");
    const ok =
      c.assert === "observe"
        ? true
        : c.assert === "called"
          ? calledLookup
          : !calledLookup;
    if (c.assert !== "observe" && !ok) failures += 1;
    // (2) rounds budget — toolActivity is one entry per executed server tool; a turn
    // that hit the cap would show MAX_ROUNDS executions.
    if (ans.toolActivity.length >= MAX_ROUNDS) roundsExhausted += 1;
    // (3) skill relevance — what the retriever surfaces for this question (its first line).
    const skill = retrieveGroundxKnowledge(c.q);
    const skillHead = skill ? skill.replace(/\s+/g, " ").slice(0, 90) : "(none)";

    const verdict = c.assert === "observe" ? "OBS " : ok ? "PASS" : "FAIL";
    console.log(
      `${verdict}  ${c.label}\n` +
        `      lookup_groundx_docs called=${calledLookup} (assert: ${c.assert}); ` +
        `serverTools=[${activity.join(", ") || "none"}]; rounds≈${ans.toolActivity.length}/${MAX_ROUNDS}\n` +
        `      skill retrieved: ${skillHead}\n` +
        `      answer: ${ans.body.replace(/\s+/g, " ").slice(0, 100)}`,
    );
  }

  console.log("\n=== SUMMARY ===");
  console.log(`lookup-decision mismatches (asserted cases): ${failures}`);
  console.log(`turns that exhausted maxRounds(${MAX_ROUNDS}): ${roundsExhausted}/${CASES.length}`);
  if (failures > 0 || roundsExhausted > 0) {
    console.log("RESULT: NEEDS-TRIAGE (see mismatches/exhaustion above).");
    process.exit(1);
  }
  console.log("RESULT: PASS — loop calls lookup for product Qs, refrains for document Qs, budget healthy.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
